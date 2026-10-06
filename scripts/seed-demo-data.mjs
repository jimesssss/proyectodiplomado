import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { atomic } from '../apps/api/src/core/db/transaction.ts';
import { recordAudit } from '../apps/api/src/core/audit/audit.ts';

import { disconnectDatabase } from '../apps/api/src/core/db/database.ts';
import { createOrgUnit, listOrgUnits } from '../apps/api/src/modules/organization/index.ts';
import { createOrgBodySchema } from '../apps/api/src/modules/organization/presentation/validators/org-validators.ts';
import { createCustomer, listCustomers } from '../apps/api/src/modules/crm/application/customer-service.ts';
import { createCustomerBodySchema } from '../apps/api/src/modules/crm/presentation/validators/crm-validators.ts';
import { createProduct, listProducts, createManualMovement, listMovements, listBalances } from '../apps/api/src/modules/inventory/index.ts';
import { createProductBodySchema, createMovementBodySchema } from '../apps/api/src/modules/inventory/presentation/validators/inventory-validators.ts';
import { createSupplier, listSuppliers, createPurchase, updatePurchase, listPurchases } from '../apps/api/src/modules/purchasing/index.ts';
import { createSupplierBodySchema, createPurchaseBodySchema, patchPurchaseBodySchema } from '../apps/api/src/modules/purchasing/presentation/validators/purchase-validators.ts';
import { createSale, updateSale, listSales } from '../apps/api/src/modules/sales/index.ts';
import { createSaleBodySchema, patchSaleBodySchema } from '../apps/api/src/modules/sales/presentation/validators/sale-validators.ts';
import { createTreasuryAccount, listTreasuryAccounts, createReceipt, updateReceipt, listReceipts, createPayment, updatePayment, listPayments, listAccountMovements } from '../apps/api/src/modules/treasury/index.ts';
import { createTreasuryAccountBodySchema, createPaymentBodySchema, createReceiptBodySchema } from '../apps/api/src/modules/treasury/presentation/validators/treasury-validators.ts';
import { findUserByEmail, createSession, revokeSession } from '../apps/api/src/modules/identity/infrastructure/repositories/identity-repository.ts';
import { resolvePermissions, updateAppUser } from '../apps/api/src/modules/identity/index.ts';
import { provisionTenant, getTenantById } from '../apps/api/src/modules/tenancy/application/tenant-service.ts';
import { findTenantBySlug } from '../apps/api/src/modules/tenancy/infrastructure/repositories/tenant-repository.ts';
import { DEMO_PREFIX, DEMO_PRODUCTS, DEMO_CUSTOMERS, DEMO_SUPPLIERS, DEMO_EXPENSES, INITIAL_QUANTITIES } from './demo-data.mjs';

export class DemoSeedError extends Error { }
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const marker=(kind,index)=>`${DEMO_PREFIX} ${kind} ${String(index+1).padStart(3,'0')}`;
const day=(base,offset)=>{const date=new Date(base);date.setUTCDate(date.getUTCDate()-offset);date.setUTCHours(12,0,0,0);return date;};
export async function allPages(fetchPage) {
 const rows=[];for(let page=1;page<=10000;page++){const result=await fetchPage(page,100);rows.push(...result.items);if(rows.length>=result.total||result.items.length<100)return rows;}
 throw new DemoSeedError('La paginación excedió el límite de seguridad.');
}

/** Every write goes through a real domain service and its route's existing validator.
 * Ledger/documents/audit for each sale, purchase and opening movement commit together.
 */
export async function seedDemo({tenantId,actorId,asOf=new Date(),onProgress=()=>{}}) {
 const stats={organizations:0,companies:0,branches:0,warehouses:0,accounts:0,products:0,customers:0,suppliers:0,purchases:0,sales:0,expenses:0,initialMovements:0};
 const audit=async(entity,verb,record)=>recordAudit({tenantId,userId:actorId,requestId:randomUUID(),action:`${entity}.${verb}`,entityType:entity,entityId:record.id,newValue:record,reason:DEMO_PREFIX,userAgent:'ERP-SC backend demo seed'});
 const create=async(entity,service,schema,body)=>{const record=await service(schema.parse(body));await audit(entity,'create',record);return record;};
 const change=async(entity,service,schema,id,body)=>{const record=await service(id,schema.parse(body));await audit(entity,'update',record);return record;};
 const ensure=async(rows,input,createRecord,counter)=>{
  const existing=rows.find(row=>row.code===input.code || (input.email && row.email===input.email));
  if(existing){if(existing.archived||existing.status==='archived')throw new DemoSeedError(`Registro demo archivado: ${input.code}. No se reactiva automáticamente.`);
   if(existing.code!==input.code || existing.name!==input.name)throw new DemoSeedError(`Colisión de código/email: ${input.code}. No se modifican registros ajenos.`);return existing;}
  const record=await atomic(createRecord);stats[counter]++;rows.push(record);return record;
 };
 const orgRows={};for(const kind of ['organization','company','branch','warehouse'])orgRows[kind]=await allPages((p,l)=>listOrgUnits(tenantId,kind,p,l));
 const orgInput={code:'DEMO-DULCERIA',name:'Dulcería ERP-SC'};
 const organization=await ensure(orgRows.organization,orgInput,()=>create('organization',body=>createOrgUnit(tenantId,'organization',body),createOrgBodySchema('organization'),orgInput),'organizations');
 const companyInput={code:'DEMO-EMPRESA',name:'Dulcería ERP-SC',parentId:organization.id};
 const company=await ensure(orgRows.company,companyInput,()=>create('company',body=>createOrgUnit(tenantId,'company',body),createOrgBodySchema('company'),companyInput),'companies');
 if(company.parentId!==organization.id)throw new DemoSeedError('La empresa demo pertenece a otra organización.');
 const branchInput={code:'DEMO-SUC-001',name:'Sucursal demo principal',parentId:company.id};
 const branch=await ensure(orgRows.branch,branchInput,()=>create('branch',body=>createOrgUnit(tenantId,'branch',body),createOrgBodySchema('branch'),branchInput),'branches');
 if(branch.parentId!==company.id)throw new DemoSeedError('La sucursal demo pertenece a otra empresa.');
 const warehouses=[];for(const [code,name]of[['DEMO-ALM-001','Almacén principal'],['DEMO-ALM-002','Almacén secundario']]){
  const body={code,name,parentId:branch.id};const warehouse=await ensure(orgRows.warehouse,body,()=>create('warehouse',b=>createOrgUnit(tenantId,'warehouse',b),createOrgBodySchema('warehouse'),body),'warehouses');
  if(warehouse.parentId!==branch.id)throw new DemoSeedError('El almacén demo pertenece a otra sucursal.');warehouses.push(warehouse);
 }
 const accountRows=await allPages((page,limit)=>listTreasuryAccounts(tenantId,{page,limit}));
 const accounts=[];for(const body of[{code:'DEMO-CAJA',name:'Caja principal / efectivo',type:'cash',currency:'MXN',openingBalance:25000},{code:'DEMO-BANCO',name:'Cuenta bancaria demo',type:'bank',currency:'MXN',openingBalance:50000}]){
  const account=await ensure(accountRows,body,()=>create('bank.account',b=>createTreasuryAccount(tenantId,b),createTreasuryAccountBodySchema,body),'accounts');
  if(account.currency!=='MXN'||account.type!==body.type)throw new DemoSeedError('La cuenta demo tiene tipo/moneda incompatible.');accounts.push(account);
 }
 onProgress('Organización, empresa, sucursal, almacenes y cuentas preparados.');
 const productRows=await allPages((page,limit)=>listProducts(tenantId,{page,limit}));const products=[];
 for(const body of DEMO_PRODUCTS)products.push(await ensure(productRows,body,()=>create('product',b=>createProduct(tenantId,b),createProductBodySchema,body),'products'));
 const customerRows=await allPages((page,limit)=>listCustomers(tenantId,{page,limit}));const customers=[];
 for(const body of DEMO_CUSTOMERS)customers.push(await ensure(customerRows,body,()=>create('customer',b=>createCustomer(tenantId,b),createCustomerBodySchema,body),'customers'));
 const supplierRows=await allPages((page,limit)=>listSuppliers(tenantId,{page,limit}));const suppliers=[];
 for(const body of DEMO_SUPPLIERS)suppliers.push(await ensure(supplierRows,body,()=>create('supplier',b=>createSupplier(tenantId,b),createSupplierBodySchema,body),'suppliers'));
 onProgress('Productos, clientes y proveedores preparados.');
 const movementRows=await allPages((page,limit)=>listMovements(tenantId,{page,limit}));
 for(let i=0;i<products.length;i++){
  const product=products[i],reason=`${DEMO_PREFIX} initial ${product.code}`;
  const existing=movementRows.find(m=>m.reason===reason&&m.productId===product.id&&m.warehouseId===warehouses[0].id);
  if(existing){if(existing.type!=='manual_in'||existing.qty!==INITIAL_QUANTITIES[i%5])throw new DemoSeedError('La entrada inicial demo no coincide con su identificador.');continue;}
  const body={productId:product.id,warehouseId:warehouses[0].id,type:'manual_in',quantity:INITIAL_QUANTITIES[i%5],reason};
  await atomic(()=>create('stock.movement',b=>createManualMovement(tenantId,b),createMovementBodySchema,body));stats.initialMovements++;
 }
 onProgress('Entradas iniciales registradas mediante el ledger real.');
 const purchaseRows=await allPages((page,limit)=>listPurchases(tenantId,'purchase.order',{page,limit}));
 const purchaseCreate=(kind,body)=>create(kind,b=>createPurchase(tenantId,kind,b),createPurchaseBodySchema(kind),body);
 const purchaseChange=(kind,id,status)=>change(kind,(docId,b)=>updatePurchase(tenantId,kind,docId,b),patchPurchaseBodySchema(kind),id,{status});
 const saleCreate=(kind,body)=>create(kind,b=>createSale(tenantId,kind,b),createSaleBodySchema(kind),body);
 const saleChange=(kind,id,status)=>change(kind,(docId,b)=>updateSale(tenantId,kind,docId,b),patchSaleBodySchema(kind),id,{status});
 const paymentCreate=body=>create('payment',b=>createPayment(tenantId,b),createPaymentBodySchema,body);
 const receiptCreate=body=>create('receipt',b=>createReceipt(tenantId,b),createReceiptBodySchema,body);
 const moneyPost=async(kind,id)=>{const record=await (kind==='payment'?updatePayment:updateReceipt)(tenantId,id,{status:'posted'});await audit(kind,'update',record);return record;};
 for(let i=0;i<10;i++){
  const notes=marker('purchase',i),existing=purchaseRows.find(d=>d.notes===notes);
  if(existing){if(existing.status!=='completed'||existing.archived)throw new DemoSeedError(`Compra demo incompleta/archivada: ${notes}.`);continue;}
  const supplier=suppliers[i],issueDate=day(asOf,14-i);
  const linked=[0,1,2].map(j=>{const p=products[(i*7+j)%products.length];return {productId:p.id,description:p.name,quantity:5+(i+j)%6,unitPrice:p.cost??0,taxRate:0,discountPct:0};});
  const lines=linked.map(({productId,...line})=>line);
  const order=await atomic(async()=>{
   const order=await purchaseCreate('purchase.order',{supplierId:supplier.id,currency:'MXN',issueDate,lines,notes});
   await purchaseChange('purchase.order',order.id,'confirmed');
   const receipt=await purchaseCreate('goods.receipt',{orderId:order.id,warehouseId:warehouses[0].id,currency:'MXN',issueDate,lines:linked,notes:notes+' receipt'});
   await purchaseChange('goods.receipt',receipt.id,'received');await purchaseChange('goods.receipt',receipt.id,'posted');
   const invoice=await purchaseCreate('supplier.invoice',{supplierId:supplier.id,orderId:order.id,currency:'MXN',issueDate,lines,notes:notes+' invoice'});
   await purchaseChange('supplier.invoice',invoice.id,'issued');
   const payment=await paymentCreate({accountId:accounts[1].id,invoiceId:invoice.id,amount:invoice.total,date:issueDate,reference:notes,notes:'Pago de compra demo '+order.number});await moneyPost('payment',payment.id);
   await purchaseChange('supplier.invoice',invoice.id,'paid');return purchaseChange('purchase.order',order.id,'completed');
  });purchaseRows.push(order);stats.purchases++;
 }
 onProgress('Compras, recepciones, facturas de proveedor y pagos preparados.');
 const saleRows=await allPages((page,limit)=>listSales(tenantId,'sales.order',{page,limit}));
 for(let i=0;i<20;i++){
  const notes=marker('sale',i),existing=saleRows.find(d=>d.notes===notes);
  if(existing){if(existing.status!=='fulfilled'||existing.archived)throw new DemoSeedError(`Venta demo incompleta/archivada: ${notes}.`);continue;}
  const customer=customers[i],issueDate=day(asOf,i%7),account=accounts[i%2];
  const lines=[0,1,2].map(j=>{const p=products[(i*4+j)%products.length];return {productId:p.id,description:p.name,quantity:1+(i+j)%2,unitPrice:p.price??0,taxRate:0,discountPct:0};});
  const order=await atomic(async()=>{
   const order=await saleCreate('sales.order',{customerId:customer.id,currency:'MXN',issueDate,lines,notes});await saleChange('sales.order',order.id,'confirmed');
   const delivery=await saleCreate('sales.delivery',{orderId:order.id,warehouseId:warehouses[0].id,currency:'MXN',issueDate,lines,notes:notes+' delivery'});await saleChange('sales.delivery',delivery.id,'shipped');
   const invoice=await saleCreate('sales.invoice',{customerId:customer.id,orderId:order.id,currency:'MXN',issueDate,lines,notes:notes+' invoice'});await saleChange('sales.invoice',invoice.id,'issued');
   const receipt=await receiptCreate({accountId:account.id,invoiceId:invoice.id,amount:invoice.total,date:issueDate,reference:notes,notes:'Cobro de venta demo '+invoice.number});await moneyPost('receipt',receipt.id);
   await saleChange('sales.invoice',invoice.id,'paid');return saleChange('sales.order',order.id,'fulfilled');
  });saleRows.push(order);stats.sales++;
 }
 onProgress('Ventas, entregas, facturas y cobros preparados con stock validado.');
 const paymentRows=await allPages((page,limit)=>listPayments(tenantId,{page,limit}));
 for(let i=0;i<DEMO_EXPENSES.length;i++){
  const [concept,amount]=DEMO_EXPENSES[i],reference=marker('expense',i),existing=paymentRows.find(p=>p.reference===reference);
  if(existing){if(existing.status!=='posted')throw new DemoSeedError(`Gasto demo incompleto: ${reference}.`);continue;}
  const payment=await atomic(async()=>{const record=await paymentCreate({accountId:accounts[0].id,amount,date:day(asOf,i+1),reference,notes:concept+' (demostración)'});return moneyPost('payment',record.id);});paymentRows.push(payment);stats.expenses++;
 }
 const receiptRows=await allPages((page,limit)=>listReceipts(tenantId,{page,limit}));
 const contributionRef=marker('income',0);
 if(!receiptRows.some(r=>r.reference===contributionRef))await atomic(async()=>{const receipt=await receiptCreate({accountId:accounts[0].id,amount:1000,date:day(asOf,2),reference:contributionRef,notes:'Aportación de efectivo de demostración'});await moneyPost('receipt',receipt.id);});
 const balances=await allPages((page,limit)=>listBalances(tenantId,{page,limit}));
 const allMovements=await allPages((page,limit)=>listMovements(tenantId,{page,limit}));
 const demoProductIds=new Set(products.map(p=>p.id));
 const demoStock=balances.filter(b=>demoProductIds.has(b.productId)&&b.warehouseId===warehouses[0].id);
 if(demoStock.length!==100||demoStock.some(b=>b.qty<0))throw new DemoSeedError('La verificación de existencias demo falló.');
 const currentAccounts=await allPages((page,limit)=>listTreasuryAccounts(tenantId,{page,limit}));let cashMovements=0;
 for(const account of accounts){const ledger=await allPages((page,limit)=>listAccountMovements(tenantId,account.id,{page,limit}));const current=currentAccounts.find(a=>a.id===account.id);const sum=ledger.reduce((total,m)=>total+m.amount,0);if(!current||Math.abs(sum-current.balance)>0.01)throw new DemoSeedError('El saldo de caja no coincide con el ledger.');cashMovements+=ledger.length;}
 for(const balance of demoStock){const sum=allMovements.filter(m=>m.productId===balance.productId&&m.warehouseId===balance.warehouseId).reduce((total,m)=>total+m.qty,0);if(Math.abs(sum-balance.qty)>0.000001)throw new DemoSeedError('El stock no coincide con el ledger.');}
 const totals={organizations:1,companies:1,branches:1,warehouses:2,accounts:2,products:products.length,customers:customers.length,suppliers:suppliers.length,purchases:10,sales:20,expenses:DEMO_EXPENSES.length,cashMovements,inventoryMovements:allMovements.filter(m=>demoProductIds.has(m.productId)).length};
 return {tenantId,organizationId:organization.id,actorId,created:stats,totals,limitations:['El backend no define categorías de producto. Su clasificación comercial se conserva únicamente como texto en description.','Transferencias usan la cuenta bank existente; no existe un tercer tipo de cuenta.']};
}

export async function selectDemoActor(password) {
 const email=process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase()||'admin@erp-sc.com';
 let admin=await findUserByEmail(email);const demo=await findUserByEmail('demo@erp-sc.com');
 if(admin&&demo&&admin.tenantId!==demo.tenantId)throw new DemoSeedError('Admin y demo pertenecen a tenants distintos. No existe una API de traslado de usuarios; no se modifican tenantIds.');
 if(!admin&&demo)admin=demo;
 if(!admin){if(!password)throw new DemoSeedError('Configura DEMO_ADMIN_PASSWORD para crear el administrador. No se genera ni guarda una contraseña en texto plano.');
  const existing=await findTenantBySlug('dulceria-erp-sc-demo');if(existing)throw new DemoSeedError('El tenant demo existe sin el usuario indicado. Configura DEMO_ADMIN_EMAIL con su owner existente.');
  const result=await atomic(()=>provisionTenant({name:'Dulcería ERP-SC',slug:'dulceria-erp-sc-demo',owner:{email,password,displayName:'Administrador demo'}}));
  admin=await findUserByEmail(result.owner.email);await recordAudit({tenantId:result.tenant.id,userId:admin.id,action:'tenant.provision',entityType:'tenant',entityId:result.tenant.id,newValue:result.tenant,reason:DEMO_PREFIX});
 }
 if(admin.status!=='active')throw new DemoSeedError('El administrador existente no está activo. No se altera automáticamente su estado.');
 const tenant=await getTenantById(admin.tenantId);if(tenant.status!=='active')throw new DemoSeedError('El tenant está suspendido.');
 const permissions=await resolvePermissions(admin.tenantId,admin.roles);
 const required=['org:write','product:create','stock.movement:create','customer:create','supplier:create','sales.order:create','sales.invoice:create','purchase.order:create','goods.receipt:create','bank.account:create','receipt:create','payment:create','audit:read','report:read'];
 if(required.some(p=>!permissions.includes(p)))throw new DemoSeedError('El usuario existente no tiene los permisos administrativos del catálogo real. No se le asignan permisos inventados.');
 if(demo&&demo.id!==admin.id&&!demo.roles.includes('owner')){
  const updated=await updateAppUser(admin.tenantId,demo.id,{roles:[...new Set([...demo.roles,'owner'])]});await recordAudit({tenantId:admin.tenantId,userId:admin.id,action:'user.update',entityType:'user',entityId:updated.id,newValue:updated,reason:DEMO_PREFIX});
 }
 return admin;
}

async function main() {
 for(const file of[path.join(root,'.env'),path.join(root,'apps/api/.env')])if(fs.existsSync(file))dotenv.config({path:file});
 if(!process.env.MONGODB_URI)throw new DemoSeedError('Falta MONGODB_URI en el entorno del backend.');
 const lockDirectory=path.join(root,'.cache');fs.mkdirSync(lockDirectory,{recursive:true});
 const lockPath=path.join(lockDirectory,'seed-demo-'+createHash('sha256').update(process.env.MONGODB_URI).digest('hex').slice(0,16)+'.lock');let lock;
 try{lock=fs.openSync(lockPath,'wx');fs.writeFileSync(lock,String(process.pid));}catch{throw new DemoSeedError('Otro seed tiene el bloqueo local. Si fue interrumpido, verifica el proceso antes de retirar su archivo .cache/seed-demo-*.lock.');}
 let sessionId;
 try{
  // This maintenance command uses MongoDB URI from the backend, never an embedded credential.
  await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:15000});
  const topology=await mongoose.connection.db.admin().command({hello:1});if(!topology.setName&&topology.msg!=='isdbgrid')throw new DemoSeedError('El seed requiere transacciones MongoDB: utiliza Atlas o un replica set.');
  const admin=await selectDemoActor(process.env.DEMO_ADMIN_PASSWORD);
  const verifyOnly=process.argv.includes('--verify-only');
  const result=verifyOnly?null:await seedDemo({tenantId:admin.tenantId,actorId:admin.id,onProgress:message=>console.log(message)});
  const {verifyDemoApi}=await import('./verify-demo-api.mjs');
  const session=await createSession({userId:admin.id,tenantId:admin.tenantId,ttlSeconds:900,userAgent:'ERP-SC demo verification'});sessionId=session.sessionId;
  const verification=await verifyDemoApi({admin,sessionId,checkRender:true});
  const summary={...(result??{tenantId:admin.tenantId}),verification};
  const output=path.join(root,'docs/qa/demo-seed-result.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
 }finally{if(sessionId)await revokeSession(sessionId);await disconnectDatabase();if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(lockPath);}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
 console.error(error instanceof DemoSeedError?error.message:'El seed se detuvo. No se imprimen credenciales, tokens ni errores de conexión. Revisa la fase indicada y ejecuta las pruebas locales.');process.exitCode=1;
});




