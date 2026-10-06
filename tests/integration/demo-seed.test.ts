import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { provisionTenant } from '../../apps/api/src/modules/tenancy/application/tenant-service.js';
import { seedDemo } from '../../scripts/seed-demo-data.mjs';
import { verifyDemoApi } from '../../scripts/verify-demo-api.mjs';
import { createSession, revokeSession, findUserByEmail } from '../../apps/api/src/modules/identity/infrastructure/repositories/identity-repository.js';
import { configureApiSession, apiList } from '../../apps/mobile/src/services/api-client';
import { businessApi } from '../../apps/mobile/src/services/business-api';
import Constants from 'expo-constants';
vi.mock('expo-constants',()=>({default:{expoConfig:{extra:{apiBaseUrl:''}}}}));
let database: MongoMemoryReplSet;
beforeAll(async()=>{database=await MongoMemoryReplSet.create({replSet:{count:1}});await mongoose.connect(database.getUri());},60000);
afterAll(async()=>{await mongoose.disconnect();await database?.stop();});
it('creates coherent real demo documents and repeats without duplicate writes',async()=>{
 const provisioned=await provisionTenant({name:'Demo seed test',slug:'demo-seed-test',owner:{email:'seed-test@demo.example',password:'LocalTest-2026!',displayName:'Demo owner'}});
 const input={tenantId:provisioned.tenant.id,actorId:provisioned.owner.id};
 const first=await seedDemo(input);
 expect(first.totals).toMatchObject({products:100,customers:20,suppliers:15,purchases:10,sales:20,expenses:6,cashMovements:39,inventoryMovements:190});
 const admin=await findUserByEmail('seed-test@demo.example');
 const session=await createSession({userId:admin!.id,tenantId:admin!.tenantId,ttlSeconds:900});
 try {await verifyDemoApi({admin,sessionId:session.sessionId,consumer:async({base,token})=>{
 (Constants.expoConfig!.extra!).apiBaseUrl=base;configureApiSession({token:()=>token,refresh:async()=>{},expire:()=>{}});
 expect((await apiList('/inventory/products')).length).toBe(100);
 expect((await businessApi.listCustomers()).length).toBe(20);
 expect((await businessApi.listSuppliers()).length).toBe(15);
 expect((await businessApi.listInvoices()).length).toBe(20);
 expect((await businessApi.listOrders()).length).toBe(10);
 }});}finally {await revokeSession(session.sessionId);}
 const second=await seedDemo(input);
 expect(second.totals).toEqual(first.totals);
 expect(Object.values(second.created).every(value=>value===0)).toBe(true);
},180000);


