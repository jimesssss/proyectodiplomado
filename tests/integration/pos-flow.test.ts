/**
 * Integración Sales — FASE 9.
 * Contra MongoDB real (memory server): numeración secuencial por
 * tenant+tipo+año, líneas con importes calculados en el servidor, máquinas
 * de estado, aprobación de cotización con permiso propio, FKs del mismo
 * tenant (404 uniforme), soft-delete y aislamiento cruzado.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import type { Env } from '../../apps/api/src/core/config/env.js';
import { createJwtService } from '../../apps/api/src/core/auth/jwt.js';
import { resolveJwtKeys } from '../../apps/api/src/core/auth/keys.js';
import { connectDatabase, disconnectDatabase } from '../../apps/api/src/core/db/database.js';
import { createApp } from '../../apps/api/src/core/http/app.js';
import { createLogger } from '../../apps/api/src/core/logging/logger.js';
import { createAuditRouter } from '../../apps/api/src/modules/audit/index.js';
import {
  createAuthRouter,
  createSessionChecker,
} from '../../apps/api/src/modules/identity/index.js';
import { createTenantRouter, isTenantActive } from '../../apps/api/src/modules/tenancy/index.js';
import { createCrmRouters } from '../../apps/api/src/modules/crm/index.js';
import { createSalesRouters } from '../../apps/api/src/modules/sales/index.js';

import { createInventoryRouters } from '../../apps/api/src/modules/inventory/index.js';
import { createTreasuryRouters } from '../../apps/api/src/modules/treasury/index.js';
import { createOrgRouter, ORG_KINDS_BY_PATH, ORG_ROUTE_PATHS } from '../../apps/api/src/modules/organization/index.js';
const logger = createLogger('silent');
const keys = resolveJwtKeys({});
const jwt = createJwtService({
  privateKey: keys.privateKey,
  publicKey: keys.publicKey,
  issuer: 'erp-test',
  audience: 'erp-api',
  accessTtlSeconds: 900,
});

const env: Env = {
  nodeEnv: 'test',
  port: 0,
  mongoDbUri: 'unused',
  logLevel: 'silent',
  corsOrigins: [],
  jwtIssuer: 'erp-test',
  jwtAudience: 'erp-api',
  accessTokenTtl: 900,
  refreshTokenTtl: 3600,
};

const sessionChecker = createSessionChecker();
const deps = { jwt, isSessionActive: sessionChecker };

const app = createApp({
  logger,
  env,
  routes: [
    {
      path: '/api/v1/auth',
      router: createAuthRouter({
        jwt,
        accessTokenTtl: 900,
        refreshTokenTtl: 3600,
        isSessionActive: sessionChecker,
        isTenantActive,
      }),
    },
    { path: '/api/v1/tenants', router: createTenantRouter(deps) },
    { path: '/api/v1/audit', router: createAuditRouter(deps) },
    ...createCrmRouters(deps),
    ...createSalesRouters(deps),
    ...createInventoryRouters(deps),
    ...createTreasuryRouters(deps),
    ...ORG_KINDS_BY_PATH.map(kind => ({path:'/api/v1/'+ORG_ROUTE_PATHS[kind],router:createOrgRouter(deps,kind)})),
  ],
});


const PASSWORD = 'Local-Test-2026';
let database: MongoMemoryReplSet;
let token = '', otherToken = '', productId = '', warehouseId = '', accountId = '', customerId = '';
const post = (path:string,body:object) => request(app).post('/api/v1'+path).set('Authorization','Bearer '+token).send(body);
const patch = (path:string,body:object) => request(app).patch('/api/v1'+path).set('Authorization','Bearer '+token).send(body);
const get = (path:string) => request(app).get('/api/v1'+path).set('Authorization','Bearer '+token);
async function provision(slug:string):Promise<string> {
  const email=slug+'@local.example';
  expect((await post('/tenants',{name:slug,slug,owner:{email,password:PASSWORD,displayName:'Owner'}})).status).toBe(201);
  const login=await post('/auth/login',{email,password:PASSWORD});expect(login.status).toBe(200);return login.body.data.accessToken as string;
}
async function order(quantity:number):Promise<string> {
 const created=await post('/sales/orders',{customerId,currency:'MXN',lines:[{productId,description:'Producto',quantity,unitPrice:100}]});
 expect(created.status).toBe(201);const id=created.body.data.id as string;
 expect((await patch('/sales/orders/'+id,{status:'confirmed'})).status).toBe(200);return id;
}
async function balance():Promise<number> {const res=await get('/inventory/stock?productId='+productId+'&warehouseId='+warehouseId);expect(res.status).toBe(200);return res.body.data[0].qty as number;}
async function money():Promise<number> {const res=await get('/treasury/accounts/'+accountId);expect(res.status).toBe(200);return res.body.data.balance as number;}
describe('real POS composition on a replica set',()=>{
 beforeAll(async()=>{
  database=await MongoMemoryReplSet.create({replSet:{count:1,storageEngine:'wiredTiger'}});
  await connectDatabase(database.getUri('erp_pos_local'),logger);
  token=await provision('pos-local');otherToken=await provision('pos-other');
  let parentId:string|undefined;
  for(const [path,code] of [['organizations','ORG'],['companies','CMP'],['branches','BR'],['warehouses','WH']]) {
   const res=await post('/'+path,{code,name:code,...(parentId?{parentId}:{})});expect(res.status).toBe(201);parentId=res.body.data.id as string;
  }
  warehouseId=parentId!;
  const product=await post('/inventory/products',{code:'POS-PRODUCT',name:'Producto',unit:'pieza',price:100});expect(product.status).toBe(201);productId=product.body.data.id as string;
  const customer=await post('/customers',{code:'POS-CUSTOMER',name:'Cliente'});expect(customer.status).toBe(201);customerId=customer.body.data.id as string;
  const account=await post('/treasury/accounts',{type:'cash',code:'POS-CASH',name:'Caja',currency:'MXN',openingBalance:0});expect(account.status).toBe(201);accountId=account.body.data.id as string;
  expect((await post('/inventory/movements',{productId,warehouseId,type:'manual_in',quantity:25,reason:'Fixture local'})).status).toBe(201);
 },120000);
 afterAll(async()=>{await disconnectDatabase();await database?.stop();});
 it('sells 2 from stock 25, creates paid invoice and credits the cash ledger once',async()=>{
  const id=await order(2);const result=await post('/sales/orders/'+id+'/complete',{warehouseId,accountId});
  expect(result.status,JSON.stringify(result.body.error)).toBe(200);expect(result.body.data.invoice.status).toBe('paid');expect(result.body.data.invoice.total).toBe(200);
  expect(await balance()).toBe(23);expect(await money()).toBe(200);
  expect((await post('/sales/orders/'+id+'/complete',{warehouseId,accountId})).status).toBe(409);
  expect(await balance()).toBe(23);expect(await money()).toBe(200);
 });
 it('rolls all document, stock and cash changes back when stock is insufficient',async()=>{
  const id=await order(24);const beforeInvoices=(await get('/sales/invoices')).body.meta.total;
  expect((await post('/sales/orders/'+id+'/complete',{warehouseId,accountId})).status).toBe(422);
  expect((await get('/sales/orders/'+id)).body.data.status).toBe('confirmed');
  expect((await get('/sales/invoices')).body.meta.total).toBe(beforeInvoices);expect(await balance()).toBe(23);expect(await money()).toBe(200);
 });
 it('concurrent completions consume stock and collect money once',async()=>{
  const id=await order(1);const results=await Promise.all([post('/sales/orders/'+id+'/complete',{warehouseId,accountId}),post('/sales/orders/'+id+'/complete',{warehouseId,accountId})]);
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);expect(await balance()).toBe(22);expect(await money()).toBe(300);
 });
 it('rejects foreign tenant documents and missing warehouse without writes',async()=>{
  const id=await order(1);
  const foreign=await request(app).post('/api/v1/sales/orders/'+id+'/complete').set('Authorization','Bearer '+otherToken).send({warehouseId,accountId});expect(foreign.status).toBe(404);
  expect((await post('/sales/orders/'+id+'/complete',{warehouseId:'ffffffffffffffffffffffff',accountId})).status).toBe(404);
  expect((await get('/sales/orders/'+id)).body.data.status).toBe('confirmed');expect(await balance()).toBe(22);expect(await money()).toBe(300);
 });
});
