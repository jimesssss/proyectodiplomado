import { createApp } from '../apps/api/src/core/http/app.ts';
import { createLogger } from '../apps/api/src/core/logging/logger.ts';
import { resolveJwtKeys } from '../apps/api/src/core/auth/keys.ts';
import { createJwtService } from '../apps/api/src/core/auth/jwt.ts';
import { createAuthRouter, createSessionChecker, resolvePermissions } from '../apps/api/src/modules/identity/index.ts';
import { isTenantActive } from '../apps/api/src/modules/tenancy/index.ts';
import { createOrgRouter, ORG_KINDS_BY_PATH, ORG_ROUTE_PATHS } from '../apps/api/src/modules/organization/index.ts';
import { createCrmRouters } from '../apps/api/src/modules/crm/index.ts';
import { createInventoryRouters } from '../apps/api/src/modules/inventory/index.ts';
import { createSalesRouters } from '../apps/api/src/modules/sales/index.ts';
import { createPurchasingRouters } from '../apps/api/src/modules/purchasing/index.ts';
import { createTreasuryRouters } from '../apps/api/src/modules/treasury/index.ts';
import { createReportingRouters } from '../apps/api/src/modules/reporting/index.ts';
import { PERMISSION_CATALOG_VERSION } from '@erp/permissions';

export async function verifyDemoApi({admin,sessionId,consumer,checkRender=false}) {
 const keys=resolveJwtKeys({});const jwt=createJwtService({...keys,issuer:'erp-demo-verification',audience:'erp-api',accessTtlSeconds:900});
 const deps={jwt,isSessionActive:createSessionChecker()};
 const env={nodeEnv:'test',port:0,mongoDbUri:'unused',logLevel:'silent',corsOrigins:[],jwtIssuer:'erp-demo-verification',jwtAudience:'erp-api',accessTokenTtl:900,refreshTokenTtl:3600};
 const app=createApp({logger:createLogger('silent'),env,routes:[
 {path:'/api/v1/auth',router:createAuthRouter({...deps,isTenantActive,accessTokenTtl:900,refreshTokenTtl:3600})},
 ...ORG_KINDS_BY_PATH.map(kind=>({path:'/api/v1/'+ORG_ROUTE_PATHS[kind],router:createOrgRouter(deps,kind)})),
 ...createCrmRouters(deps),...createInventoryRouters(deps),...createSalesRouters(deps),...createPurchasingRouters(deps),...createTreasuryRouters(deps),...createReportingRouters(deps)]});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port+'/api/v1';
 let token=jwt.signAccessToken({userId:admin.id,tenantId:admin.tenantId,roles:admin.roles,permissions:await resolvePermissions(admin.tenantId,admin.roles),permVersion:PERMISSION_CATALOG_VERSION,sessionId});
 const checks={};
 const get=async(route)=>{const response=await fetch(base+route,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Demo API verification failed: '+route+' HTTP '+response.status);return (await response.json()).data;};
 try {
  for(const route of ['/auth/me','/organizations','/inventory/products','/inventory/stock','/customers','/suppliers','/sales/orders','/purchasing/orders','/treasury/payments','/treasury/accounts']) {await get(route+'?page=1&limit=100');checks[route]='passed';}
  const to=new Date().toISOString().slice(0,10),from=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  for(const report of ['sales','purchases','cashflow','inventory','crm']) {const data=await get('/reports/'+report+(['inventory','crm'].includes(report)?'':'?from='+from+'&to='+to));if(['sales','purchases','cashflow'].includes(report)&&!data.totals?.some(row=>row.currency==='MXN'&&row.count>0))throw new Error('Empty real report: '+report);if(report==='inventory'&&data.products<100)throw new Error('Incomplete inventory report');checks['report:'+report]='passed';}
  if(consumer)await consumer({base,token});
  checks.login='skipped by user request; existing password unchanged';
  checks.render='pending: authenticated deployed reads deliberately skipped';
  if(checkRender)try {const health=await fetch('https://erp-sc-api.onrender.com/api/v1/health',{signal:AbortSignal.timeout(45000)});checks.renderHealth=health.ok?'passed':'HTTP '+health.status;}catch{checks.renderHealth='unavailable';}
  checks.android='pending: device login and navigation must be checked on Android';
  return checks;
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}






