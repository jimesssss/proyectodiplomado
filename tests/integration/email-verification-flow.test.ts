import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { Server } from 'node:http';
import { createApp } from '../../apps/api/src/core/http/app.js';
import { createLogger } from '../../apps/api/src/core/logging/logger.js';
import { resolveJwtKeys } from '../../apps/api/src/core/auth/keys.js';
import { createJwtService } from '../../apps/api/src/core/auth/jwt.js';
import { createAuthRouter, createSessionChecker } from '../../apps/api/src/modules/identity/index.js';
import { findUserByEmail, updateVerificationToken, getUserPasswordHash, activateUserAfterVerification, clearEmailVerificationToken } from '../../apps/api/src/modules/identity/infrastructure/repositories/identity-repository.js';
import { isTenantActive } from '../../apps/api/src/modules/tenancy/index.js';
import { TenantModel } from '../../apps/api/src/modules/tenancy/infrastructure/schemas/collections.js';
import { UserModel } from '../../apps/api/src/modules/identity/infrastructure/schemas/collections.js';
import { hashVerificationToken } from '../../apps/api/src/core/email/resend.js';
import { verifyEmail, resendVerification } from '../../apps/web/src/App';
const password='Verification-Test-2026!';
let database:MongoMemoryServer, server:Server, base:string;
const savedKey=process.env.RESEND_API_KEY;
beforeAll(async()=>{
 delete process.env.RESEND_API_KEY; // Isolated tests must not send actual email.
 database=await MongoMemoryServer.create();await mongoose.connect(database.getUri());
 const jwt=createJwtService({...resolveJwtKeys({}),issuer:'verification-test',audience:'erp-api',accessTtlSeconds:900});
 const env={nodeEnv:'test' as const,port:0,mongoDbUri:'unused',logLevel:'silent' as const,corsOrigins:[],jwtIssuer:'verification-test',jwtAudience:'erp-api',accessTokenTtl:900,refreshTokenTtl:3600};
 const app=createApp({logger:createLogger('silent'),env,routes:[{path:'/api/v1/auth',router:createAuthRouter({jwt,accessTokenTtl:900,refreshTokenTtl:3600,isSessionActive:createSessionChecker(),isTenantActive})}]});
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/v1';
},60000);
afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await mongoose.disconnect();await database?.stop();if(savedKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=savedKey;});
async function post(route:string,body:unknown){return fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
async function account(name:string,expired=false){
 const email=name+'@verification.example';const response=await post('/auth/register',{email,password,displayName:'Verification Test'});expect(response.status).toBe(201);
 const user=(await findUserByEmail(email))!;
 // Existing active tenant fixture, matching the real account under repair.
 await TenantModel.create({_id:user.tenantId,slug:'verification-'+name,name:'Verification '+name});
 const token=randomBytes(32).toString('base64url');
 await updateVerificationToken(user.id,{tokenHash:hashVerificationToken(token),expiresAt:new Date(Date.now()+(expired?-60000:60000))});return {user,email,token};
}
it('verifies once, handles replay/concurrency, preserves the password and allows real login',async()=>{
 const {user,email,token}=await account('valid');const before=await getUserPasswordHash(user.id);
 expect((await post('/auth/login',{email,password})).status).toBe(403);
 const results=await Promise.all([verifyEmail(token,base),verifyEmail(token,base)]);expect(results.every(r=>r.ok&&r.status==='success')).toBe(true);
 const verified=(await findUserByEmail(email))!;expect(verified.emailVerifiedAt).not.toBeNull();
 expect(await verifyEmail(token,base)).toMatchObject({ok:true,status:'success'});
 expect((await findUserByEmail(email))!.emailVerifiedAt).toEqual(verified.emailVerifiedAt);
 expect(await getUserPasswordHash(user.id)).toBe(before);
 expect((await post('/auth/login',{email,password})).status).toBe(200);
});
it('keeps unknown and expired tokens invalid for unverified accounts',async()=>{
 const {email,token}=await account('expired',true);
 expect(await verifyEmail(token,base)).toMatchObject({ok:false,status:'expired'});
 expect(await verifyEmail(randomBytes(32).toString('base64url'),base)).toMatchObject({ok:false,status:'invalid'});
 expect((await findUserByEmail(email))!.emailVerifiedAt).toBeNull();
 expect((await post('/auth/login',{email,password})).status).toBe(403);
});
it('recognizes a legacy verified account through the existing resend route after its token was erased',async()=>{
 const {user,email,token}=await account('legacy');await verifyEmail(token,base);
 await UserModel.updateOne({_id:user.id},{$set:{emailVerificationTokenHash:null}});
 expect(await verifyEmail(token,base)).toMatchObject({ok:false,status:'invalid'});
 expect(await resendVerification(email,base)).toMatchObject({ok:true,alreadyVerified:true});
 expect((await post('/auth/login',{email,password})).status).toBe(200);
});
it('never reactivates a verified account disabled by its administrator',async()=>{
 const {user,email,token}=await account('disabled');await verifyEmail(token,base);
 await UserModel.updateOne({_id:user.id},{$set:{status:'disabled'}});
 expect(await verifyEmail(token,base)).toMatchObject({ok:false,status:'error'});
 expect(await resendVerification(email,base)).toMatchObject({ok:true,alreadyVerified:true});
 expect((await findUserByEmail(email))!.status).toBe('disabled');
 expect((await post('/auth/login',{email,password})).status).toBe(403);
});
it('rejects replaced tokens atomically without clearing the current token',async()=>{
 const {user,email,token}=await account('replacement');const replacement=randomBytes(32).toString('base64url');
 await updateVerificationToken(user.id,{tokenHash:hashVerificationToken(replacement),expiresAt:new Date(Date.now()+60000)});
 expect(await activateUserAfterVerification(user.id,hashVerificationToken(token))).toBeNull();
 await clearEmailVerificationToken(user.id,hashVerificationToken(token));
 expect(await verifyEmail(token,base)).toMatchObject({ok:false,status:'invalid'});
 expect((await findUserByEmail(email))!.emailVerifiedAt).toBeNull();
 expect(await verifyEmail(replacement,base)).toMatchObject({ok:true,status:'success'});
});

