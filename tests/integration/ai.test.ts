/**
 * Integración AI — FASE 20 (ADR-008).
 * Contra MongoDB real (memory server): catálogo de EXACTAMENTE 3 tools de
 * lectura; `crm.search` ejecuta la MISMA búsqueda que `/search` (refactor
 * FASE 20) con datos reales y registra `completed`; la regla subyacente
 * fallida (sanitize del término) registra `failed` con el error original;
 * violaciones de tool/contrato NO se registran; `reports.sales_kpis`
 * devuelve EXACTAMENTE lo mismo que `GET /reports/sales` (paridad de datos
 * y reglas de rango); `hr.salaries` es la lectura sensible con datos del
 * tenant; aislamiento cruzado (B no ve datos ni interacciones de A) y los
 * tools de lectura NO escriben en `auditLog` (el ADR ata el auditLog a la
 * "acción final", reservada a escrituras futuras).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
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
import { createHrRouters } from '../../apps/api/src/modules/hr/index.js';
import { createReportingRouters } from '../../apps/api/src/modules/reporting/index.js';
import { createAiRouters } from '../../apps/api/src/modules/ai/index.js';

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
    ...createHrRouters(deps),
    ...createReportingRouters(deps),
    ...createAiRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';

let mongod: MongoMemoryServer | undefined;

async function provision(slug: string, email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/tenants')
    .send({
      name: slug.toUpperCase(),
      slug,
      owner: { email, password: PASSWORD, displayName: 'Owner' },
    });
  expect(res.status).toBe(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(login.status).toBe(200);
  return login.body.data.accessToken as string;
}

describe('ai: catálogo, capa de permisos y registro de interacciones', () => {
  let tokenA = '';
  let tokenB = '';
  let searchInteractionId = '';

  const postA = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const getA = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenA}`);
  const postB = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenB}`).send(body);
  const getB = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenB}`);

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_ai'), logger);
    tokenA = await provision('ai-tenant-a', 'owner-a@ai.example');
    tokenB = await provision('ai-tenant-b', 'owner-b@ai.example');
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('catálogo: GET /ai/tools publica EXACTAMENTE las 3 tools de lectura con sus permisos', async () => {
    const res = await getA('/api/v1/ai/tools');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const tools = res.body.data.tools as Array<{
      name: string;
      description: string;
      requiredPermissions: string[];
    }>;
    expect(tools.map((tool) => tool.name)).toEqual([
      'crm.search',
      'reports.sales_kpis',
      'hr.salaries',
    ]);
    expect(tools[0]?.requiredPermissions).toEqual([]); // filtra por TIPO dentro
    expect(tools[1]?.requiredPermissions).toEqual([
      'report:read',
      'sales.invoice:read',
      'customer:read',
    ]);
    expect(tools[2]?.requiredPermissions).toEqual(['hr.salary:read']);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(10);
    }
    expect(JSON.stringify(res.body)).not.toContain('tenantId');
  });

  it('crm.search: ejecuta la MISMA búsqueda que /search con datos reales y registra completed', async () => {
    const customer = await postA('/api/v1/customers', {
      code: 'ACME-01',
      name: 'ACME Industries',
    });
    expect(customer.status, JSON.stringify(customer.body)).toBe(201);

    const run = await postA('/api/v1/ai/interactions', {
      tool: 'crm.search',
      args: { q: 'acme', types: 'customer', limit: 10 },
      prompt: '   clientes con acme   ',
    });
    expect(run.status, JSON.stringify(run.body)).toBe(201);
    const data = run.body.data;
    expect(data.tool).toBe('crm.search');
    expect(data.status).toBe('completed');
    expect(data.error).toBeNull();
    expect(data.prompt).toBe('clientes con acme'); // redactado (blancos fuera)
    expect(data.args).toEqual({ q: 'acme', types: 'customer', limit: 10 });
    expect(data.result.query).toBe('acme');
    expect(data.result.results).toHaveLength(1);
    expect(data.result.results[0]).toMatchObject({
      type: 'customer',
      title: 'ACME Industries',
    });
    expect(data.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof data.requestId).toBe('string');
    expect(data.requestId.length).toBeGreaterThan(0);
    expect(typeof data.userId).toBe('string');
    expect(data.userId.length).toBeGreaterThan(0);
    expect(data.status).toBe('completed');
    expect(JSON.stringify(run.body)).not.toContain('tenantId');
    searchInteractionId = data.id as string;

    // UNA sola implementación: la ruta /search (refactor FASE 20) devuelve
    // exactamente lo mismo que la tool.
    const direct = await getA('/api/v1/search?q=acme&types=customer&limit=10');
    expect(direct.status).toBe(200);
    expect(direct.body.data).toEqual(data.result);
  });

  it('historial: filtro por tool/status, detalle por id y paginación en meta', async () => {
    const byTool = await getA('/api/v1/ai/interactions?tool=crm.search');
    expect(byTool.status, JSON.stringify(byTool.body)).toBe(200);
    expect(byTool.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(byTool.body.data[0].id).toBe(searchInteractionId);

    const completed = await getA('/api/v1/ai/interactions?status=completed');
    expect(completed.status).toBe(200);
    expect(completed.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(completed.body.data[0].status).toBe('completed');

    const detail = await getA(`/api/v1/ai/interactions/${searchInteractionId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(searchInteractionId);

    const unknownParam = await getA('/api/v1/ai/interactions?bogus=1');
    expect(unknownParam.status).toBe(200); // STRIP: desconocido descartado
  });

  it('failed: pasa el contrato pero la regla subyacente falla → registro failed + error original', async () => {
    // q='   ' (len 3) PASA el contrato (min 2); sanitizeSearchTerm exige
    // 2 tras el recorte → ValidationError DENTRO de la ejecución.
    const run = await postA('/api/v1/ai/interactions', { tool: 'crm.search', args: { q: '   ' } });
    expect(run.status).toBe(400);
    expect(run.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(run.body)).toContain('Invalid search term');

    const failed = await getA('/api/v1/ai/interactions?status=failed');
    expect(failed.status, JSON.stringify(failed.body)).toBe(200);
    expect(failed.body.meta.total).toBeGreaterThanOrEqual(1);
    const item = failed.body.data[0];
    expect(item.tool).toBe('crm.search');
    expect(item.status).toBe('failed');
    expect(item.error).toBe('Invalid search term');
    expect(item.result).toBeNull();
    expect(item.prompt).toBeNull(); // sin prompt → null
    expect(item.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('violaciones de tool/contrato NO registran interacción: total intacto', async () => {
    const before = await getA('/api/v1/ai/interactions?limit=1');
    expect(before.status).toBe(200);
    const totalBefore = before.body.meta.total as number;

    const unknownTool = await postA('/api/v1/ai/interactions', { tool: 'nope', args: {} });
    expect(unknownTool.status).toBe(400);
    expect(unknownTool.body.error.message).toBe('Unknown tool');

    const badArgs = await postA('/api/v1/ai/interactions', {
      tool: 'reports.sales_kpis',
      args: { from: '2026-01-01', to: '2026-01-31', groupBy: 'week' },
    });
    expect(badArgs.status).toBe(400);
    expect(badArgs.body.error.message).toBe('Invalid tool arguments');

    const after = await getA('/api/v1/ai/interactions?limit=1');
    expect(after.body.meta.total).toBe(totalBefore); // ni unknown tool ni args inválidos
  });

  it('reports.sales_kpis: paridad EXACTA con GET /reports/sales y mismas reglas de rango', async () => {
    const run = await postA('/api/v1/ai/interactions', {
      tool: 'reports.sales_kpis',
      args: { from: '2026-01-01', to: '2026-01-31', groupBy: 'month' },
      prompt: 'kpis de enero',
    });
    expect(run.status, JSON.stringify(run.body)).toBe(201);
    expect(run.body.data.status).toBe('completed');
    const result = run.body.data.result;
    expect(result.report).toBe('sales');
    expect(result.from).toBe('2026-01-01');
    expect(result.groupBy).toBe('month');
    expect(Array.isArray(result.series)).toBe(true);
    expect(Array.isArray(result.totals)).toBe(true);
    expect(Array.isArray(result.topCustomers)).toBe(true);

    const direct = await getA('/api/v1/reports/sales?from=2026-01-01&to=2026-01-31&groupBy=month');
    expect(direct.status, JSON.stringify(direct.body)).toBe(200);
    expect(result).toEqual(direct.body.data); // LOS MISMOS datos (misma función)

    // Mismas reglas de rango que la ruta (checkDateRange de reporting):
    const inverted = await postA('/api/v1/ai/interactions', {
      tool: 'reports.sales_kpis',
      args: { from: '2026-02-01', to: '2026-01-01', groupBy: 'month' },
    });
    expect(inverted.status).toBe(400);
    expect(JSON.stringify(inverted.body)).toContain('from must not be after to');
  });

  it('hr.salaries: lectura sensible con datos reales del tenant', async () => {
    const employee = await postA('/api/v1/employees', {
      code: 'salaried-1',
      firstName: 'Sala',
      lastName: 'Ried',
      email: 'salaried1@example.com',
      position: 'Analista',
      hireDate: '2026-03-01',
    });
    expect(employee.status, JSON.stringify(employee.body)).toBe(201);
    const salary = await postA('/api/v1/salaries', {
      employeeId: employee.body.data.id,
      period: '2026-09',
      baseAmount: 1000,
    });
    expect(salary.status, JSON.stringify(salary.body)).toBe(201);

    const run = await postA('/api/v1/ai/interactions', {
      tool: 'hr.salaries',
      args: { period: '2026-09' },
    });
    expect(run.status, JSON.stringify(run.body)).toBe(201);
    expect(run.body.data.status).toBe('completed');
    expect(run.body.data.result.total).toBe(1);
    expect(run.body.data.result.items).toHaveLength(1);
    expect(run.body.data.result.items[0].period).toBe('2026-09');
    expect(run.body.data.result.items[0].netAmount).toBe(1000);
    expect(JSON.stringify(run.body)).not.toContain('tenantId');

    const byTool = await getA('/api/v1/ai/interactions?tool=hr.salaries');
    expect(byTool.status).toBe(200);
    expect(byTool.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('aislamiento: B no ve datos ni interacciones de A; ?tenantId= ajeno inofensivo', async () => {
    const bList = await getB('/api/v1/ai/interactions');
    expect(bList.status, JSON.stringify(bList.body)).toBe(200);
    expect(bList.body.meta.total).toBe(0); // interacciones de A invisibles

    const bDetail = await getB(`/api/v1/ai/interactions/${searchInteractionId}`);
    expect(bDetail.status).toBe(404); // 404 uniforme (registro de A)

    const bSearch = await postB('/api/v1/ai/interactions', {
      tool: 'crm.search',
      args: { q: 'acme', types: 'customer' },
    });
    expect(bSearch.status, JSON.stringify(bSearch.body)).toBe(201);
    expect(bSearch.body.data.result.results).toEqual([]); // B no tiene clientes

    const bSalaries = await postB('/api/v1/ai/interactions', {
      tool: 'hr.salaries',
      args: { period: '2026-09' },
    });
    expect(bSalaries.status, JSON.stringify(bSalaries.body)).toBe(201);
    expect(bSalaries.body.data.result.total).toBe(0); // nómina de A invisible

    // ?tenantId= ajeno se DESCARTA (STRIP): el filtro SIEMPRE es el del JWT.
    const spoofed = await getA('/api/v1/ai/interactions?tenantId=other-tenant&limit=1');
    expect(spoofed.status).toBe(200);
    const own = await getA('/api/v1/ai/interactions?limit=1');
    expect(spoofed.body.meta.total).toBe(own.body.meta.total);
  });

  it('auditoría: los tools de lectura NO escriben en auditLog (ADR-008: auditLog = acción final)', async () => {
    const none = await getA('/api/v1/audit?entityType=ai_interaction');
    expect(none.status, JSON.stringify(none.body)).toBe(200);
    expect(none.body.meta.total).toBe(0);

    // El auditRouter SÍ funciona y registra otras entidades (customer/employee):
    const other = await getA('/api/v1/audit?limit=1');
    expect(other.status).toBe(200);
    expect(other.body.meta.total).toBeGreaterThanOrEqual(2);
  });
});
