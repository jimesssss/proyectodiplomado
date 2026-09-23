/**
 * Seguridad AI — FASE 20 (ADR-008).
 * 401 UNAUTHENTICATED en las 4 rutas con token manipulado incluido, 403 con
 * `details.permission` = `ai:use` en todas (una sola clave de catálogo),
 * capa de permisos de la tool SELECCIONADA (ai:use NO basta: AND declarado
 * por tool, primer faltante reportado, denegaciones NO registradas),
 * token con `pv` obsoleta (SIN bump en FASE 20: `ai:use` desde v1),
 * entrada estricta (tenantId/body desconocido → 400), tool desconocida →
 * 400, id malformado → 400, verbos PATCH/DELETE no publicados → 404 y
 * ausencia de `tenantId` en todas las respuestas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { PERMISSION_CATALOG_VERSION } from '@erp/permissions';
import type { Env } from '../../apps/api/src/core/config/env.js';
import { createJwtService } from '../../apps/api/src/core/auth/jwt.js';
import { resolveJwtKeys } from '../../apps/api/src/core/auth/keys.js';
import { connectDatabase, disconnectDatabase } from '../../apps/api/src/core/db/database.js';
import { createApp } from '../../apps/api/src/core/http/app.js';
import { createLogger } from '../../apps/api/src/core/logging/logger.js';
import {
  createAuthRouter,
  createRoleRouter,
  createSessionChecker,
  createUserRouter,
} from '../../apps/api/src/modules/identity/index.js';
import { createTenantRouter, isTenantActive } from '../../apps/api/src/modules/tenancy/index.js';
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
    { path: '/api/v1/users', router: createUserRouter(deps) },
    { path: '/api/v1/roles', router: createRoleRouter(deps) },
    ...createAiRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const ID_PATH = '0123456789abcdef01234567';

const AI_ROUTES: ReadonlyArray<{
  readonly method: 'get' | 'post';
  readonly path: string;
}> = [
  { method: 'get', path: '/api/v1/ai/tools' },
  { method: 'get', path: '/api/v1/ai/interactions' },
  { method: 'post', path: '/api/v1/ai/interactions' },
  { method: 'get', path: `/api/v1/ai/interactions/${ID_PATH}` },
];

function call(
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  token: string,
  body: object = {},
): ReturnType<ReturnType<typeof request.agent>['get']> {
  const req = request(app)[method](path).set('Authorization', `Bearer ${token}`);
  return method === 'get' || method === 'delete' ? req : req.send(body);
}

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let noPermToken = '';
let aiOnlyToken = '';
let kpiPartToken = '';

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

async function createRole(owner: string, key: string, permissions: string[]): Promise<void> {
  const res = await request(app)
    .post('/api/v1/roles')
    .set('Authorization', `Bearer ${owner}`)
    .send({ key, name: key, permissions });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

async function createUser(owner: string, email: string, roles: string[]): Promise<string> {
  const res = await request(app)
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${owner}`)
    .send({ email, password: PASSWORD, displayName: email.split('@')[0], roles });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return login(email);
}

describe('ai security: ai:use, capa de permisos por tool y apéndice inmutable', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_ai_sec'), logger);

    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'AISEC',
        slug: 'ai-sec',
        owner: { email: 'aisec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(res.status).toBe(201);
    ownerToken = await login('aisec-owner@example.com');

    // Roles con permisos EXACTOS (denegación por defecto).
    await createRole(ownerToken, 'ai-user', ['ai:use']);
    await createRole(ownerToken, 'kpi-part', ['ai:use', 'report:read']); // sin subyacentes
    noPermToken = await createUser(ownerToken, 'aisec-noperm@example.com', []);
    aiOnlyToken = await createUser(ownerToken, 'aisec-ai@example.com', ['ai-user']);
    kpiPartToken = await createUser(ownerToken, 'aisec-kpi@example.com', ['kpi-part']);
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 UNAUTHENTICATED en las 4 rutas sin token y con token manipulado', async () => {
    for (const c of AI_ROUTES) {
      const anon =
        c.method === 'get'
          ? await request(app).get(c.path)
          : await request(app).post(c.path).send({});
      expect(anon.status, `${c.method} ${c.path}`).toBe(401);
      expect(anon.body.error.code).toBe('UNAUTHENTICATED');
    }
    const tampered = await request(app)
      .get('/api/v1/ai/tools')
      .set('Authorization', `Bearer ${ownerToken.slice(0, -4)}beef`);
    expect(tampered.status).toBe(401);
  });

  it('403 FORBIDDEN con details.permission = ai:use en las 4 rutas (clave única de catálogo)', async () => {
    for (const c of AI_ROUTES) {
      const res = await call(c.method, c.path, noPermToken, {});
      expect(res.status, `${c.method} ${c.path}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('Missing permission');
      expect(res.body.error.details.permission).toBe('ai:use');
    }
  });

  it('capa de permisos de la tool (ADR-008): ai:use NO es suficiente (AND declarado)', async () => {
    // Sin permisos de reporting → primer faltante de la cadena:
    const kpis = await call('post', '/api/v1/ai/interactions', aiOnlyToken, {
      tool: 'reports.sales_kpis',
      args: { from: '2026-01-01', to: '2026-01-31', groupBy: 'month' },
    });
    expect(kpis.status, JSON.stringify(kpis.body)).toBe(403);
    expect(kpis.body.error.message).toBe('Missing permission');
    expect(kpis.body.error.details.permission).toBe('report:read');

    // Con report:read pero sin subyacentes → el SIGUIENTE de la cadena:
    const kpisPartial = await call('post', '/api/v1/ai/interactions', kpiPartToken, {
      tool: 'reports.sales_kpis',
      args: { from: '2026-01-01', to: '2026-01-31', groupBy: 'month' },
    });
    expect(kpisPartial.status, JSON.stringify(kpisPartial.body)).toBe(403);
    expect(kpisPartial.body.error.details.permission).toBe('sales.invoice:read');

    // Lectura sensible de nómina sin hr.salary:read (ADR-008 §Lecturas sensibles):
    const hr = await call('post', '/api/v1/ai/interactions', aiOnlyToken, {
      tool: 'hr.salaries',
      args: {},
    });
    expect(hr.status).toBe(403);
    expect(hr.body.error.details.permission).toBe('hr.salary:read');

    // crm.search NO exige permiso global → ejecuta con filtrado POR TIPO
    // (denegación por defecto: sin customer:read → sin resultados):
    const search = await call('post', '/api/v1/ai/interactions', aiOnlyToken, {
      tool: 'crm.search',
      args: { q: 'acme' },
    });
    expect(search.status, JSON.stringify(search.body)).toBe(201);
    expect(search.body.data.status).toBe('completed');
    expect(search.body.data.result.results).toEqual([]);

    // 3 denegaciones SIN registro + 1 ejecución CON registro → total 1.
    const list = await call('get', '/api/v1/ai/interactions', aiOnlyToken);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].tool).toBe('crm.search');
    expect(list.body.data[0].status).toBe('completed');
  });

  it('token con pv obsoleta → 403 de re-autenticación; FASE 20 NO bumpó el catálogo', async () => {
    expect(PERMISSION_CATALOG_VERSION).toBe(2); // ai:use en el catálogo DESDE v1
    const ownerClaims = jwt.verifyAccessToken(ownerToken);
    const stale = jwt.signAccessToken({
      userId: ownerClaims.sub,
      tenantId: ownerClaims.tenantId,
      roles: ownerClaims.roles,
      permissions: [...ownerClaims.permissions],
      permVersion: PERMISSION_CATALOG_VERSION - 1, // v1 obsoleta
      sessionId: ownerClaims.sid,
    });

    const tools = await request(app)
      .get('/api/v1/ai/tools')
      .set('Authorization', `Bearer ${stale}`);
    expect(tools.status).toBe(403);
    expect(tools.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const run = await request(app)
      .post('/api/v1/ai/interactions')
      .set('Authorization', `Bearer ${stale}`)
      .send({ tool: 'crm.search', args: { q: 'xx' } });
    expect(run.status).toBe(403); // el chequeo de pv va ANTES de todo

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(200); // solo-autenticada sigue operativa
  });

  it('entrada estricta y contratos: tenantId fuera, tool desconocida, id y verbos', async () => {
    const injected = await call('post', '/api/v1/ai/interactions', ownerToken, {
      tool: 'crm.search',
      args: { q: 'acme' },
      tenantId: 'evil',
    });
    expect(injected.status).toBe(400); // strictObject: tenantId solo del JWT

    const unknownTool = await call('post', '/api/v1/ai/interactions', ownerToken, {
      tool: 'nope',
      args: {},
    });
    expect(unknownTool.status).toBe(400);
    expect(unknownTool.body.error.message).toBe('Unknown tool');

    const missingArgs = await call('post', '/api/v1/ai/interactions', ownerToken, {
      tool: 'crm.search',
    });
    expect(missingArgs.status).toBe(400); // args → {} → falta `q`
    expect(missingArgs.body.error.message).toBe('Invalid tool arguments');

    const unknownKey = await call('post', '/api/v1/ai/interactions', ownerToken, { hack: true });
    expect(unknownKey.status).toBe(400);

    const badId = await call('get', '/api/v1/ai/interactions/not-an-id', ownerToken);
    expect(badId.status).toBe(400); // 'Invalid id'

    // Apéndice INMUTABLE: sin PATCH/DELETE publicados → 404.
    const patched = await call('patch', `/api/v1/ai/interactions/${ID_PATH}`, ownerToken, {
      status: 'completed',
    });
    expect(patched.status).toBe(404);
    const removed = await call('delete', `/api/v1/ai/interactions/${ID_PATH}`, ownerToken);
    expect(removed.status).toBe(404);

    const unknownRoute = await call('get', '/api/v1/agents', ownerToken);
    expect(unknownRoute.status).toBe(404); // montaje inexistente
  });

  it('sin tenantId en ninguna respuesta (catálogo, historial y detalle)', async () => {
    const tools = await call('get', '/api/v1/ai/tools', aiOnlyToken);
    expect(tools.status).toBe(200);
    expect(JSON.stringify(tools.body)).not.toContain('tenantId');

    const list = await call('get', '/api/v1/ai/interactions', aiOnlyToken);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(list.body)).not.toContain('tenantId');

    const detail = await call(
      'get',
      `/api/v1/ai/interactions/${list.body.data[0].id as string}`,
      aiOnlyToken,
    );
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body)).not.toContain('tenantId');
  });
});
