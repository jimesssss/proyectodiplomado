/**
 * Seguridad CRM — FASE 8.
 * 401/403 por recurso (denegación por defecto), token con `pv` obsoleta,
 * validación estricta de entrada (tenantId/campos desconocidos), ids con
 * formato inválido y ausencia de datos internos en las respuestas.
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
  createSessionChecker,
  createRoleRouter,
  createUserRouter,
} from '../../apps/api/src/modules/identity/index.js';
import { createTenantRouter, isTenantActive } from '../../apps/api/src/modules/tenancy/index.js';
import { createCrmRouters } from '../../apps/api/src/modules/crm/index.js';

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
    ...createCrmRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';
let customerId = '';

describe('crm security: autenticación, permisos y entrada estricta', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_crm_sec'), logger);

    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'CRMSEC',
        slug: 'crm-sec',
        owner: { email: 'crmsec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(res.status).toBe(201);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'crmsec-owner@example.com', password: PASSWORD });
    ownerToken = login.body.data.accessToken as string;

    // Usuario sin roles → sin permisos (denegación por defecto).
    const created = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'crmsec-reader@example.com',
        password: PASSWORD,
        displayName: 'Reader',
        roles: [],
      });
    expect(created.status).toBe(201);
    const readerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'crmsec-reader@example.com', password: PASSWORD });
    readerToken = readerLogin.body.data.accessToken as string;

    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'SEC-01', name: 'Cliente Seguridad' });
    expect(customer.status).toBe(201);
    customerId = customer.body.data.id as string;
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 en los 5 recursos sin token y con token manipulado', async () => {
    const lists = [
      '/api/v1/customers',
      '/api/v1/contacts',
      '/api/v1/leads',
      '/api/v1/opportunities',
      '/api/v1/activities',
    ];
    for (const path of lists) {
      const anon = await request(app).get(path);
      expect(anon.status).toBe(401);
      expect(anon.body.error.code).toBe('UNAUTHENTICATED');
    }
    const create = await request(app).post('/api/v1/customers').send({ code: 'X-1', name: 'X' });
    expect(create.status).toBe(401);

    const tampered = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken.slice(0, -4)}beef`);
    expect(tampered.status).toBe(401);
  });

  it('sin permisos: 403 con details.permission en los 5 recursos', async () => {
    const cases: ReadonlyArray<{
      readonly method: 'get' | 'post' | 'patch' | 'delete';
      readonly path: string;
      readonly permission: string;
      readonly body?: Record<string, unknown>;
    }> = [
      { method: 'get', path: '/api/v1/customers', permission: 'customer:read' },
      {
        method: 'post',
        path: '/api/v1/customers',
        permission: 'customer:create',
        body: { code: 'NO-1', name: 'No' },
      },
      { method: 'get', path: '/api/v1/contacts', permission: 'contact:read' },
      {
        method: 'post',
        path: '/api/v1/contacts',
        permission: 'contact:create',
        body: { customerId: MISSING_ID, firstName: 'A', lastName: 'B' },
      },
      { method: 'get', path: '/api/v1/leads', permission: 'lead:read' },
      {
        method: 'patch',
        path: `/api/v1/leads/${MISSING_ID}`,
        permission: 'lead:update',
        body: { status: 'contacted' },
      },
      { method: 'get', path: '/api/v1/opportunities', permission: 'opportunity:read' },
      {
        method: 'delete',
        path: `/api/v1/opportunities/${MISSING_ID}`,
        permission: 'opportunity:delete',
      },
      { method: 'get', path: '/api/v1/activities', permission: 'activity:read' },
      {
        method: 'post',
        path: '/api/v1/activities',
        permission: 'activity:create',
        body: { type: 'note', subject: 'Nota' },
      },
    ];
    for (const testCase of cases) {
      const call = request(app)[testCase.method];
      const req = call(testCase.path).set('Authorization', `Bearer ${readerToken}`);
      const res = testCase.body === undefined ? await req : await req.send(testCase.body);
      expect(res.status, `${testCase.method} ${testCase.path}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.details.permission).toBe(testCase.permission);
    }
  });

  it('token con versión de catálogo obsoleta (pv=0) → 403 en CRUD y en /search', async () => {
    const ownerClaims = jwt.verifyAccessToken(ownerToken);
    const stale = jwt.signAccessToken({
      userId: ownerClaims.sub,
      tenantId: ownerClaims.tenantId,
      roles: ownerClaims.roles,
      permissions: [...ownerClaims.permissions],
      permVersion: PERMISSION_CATALOG_VERSION - 1,
      sessionId: ownerClaims.sid,
    });

    const list = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${stale}`);
    expect(list.status).toBe(403);
    expect(list.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const search = await request(app)
      .get('/api/v1/search?q=cliente')
      .set('Authorization', `Bearer ${stale}`);
    expect(search.status).toBe(403);
    expect(search.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    // La ruta solo-autenticada sigue funcionando con pv viejo.
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(200);
  });

  it('tenantId inyectado en bodies → 400 (nunca llega del cliente)', async () => {
    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'INJ-1', name: 'Inyectado', tenantId: 'otro-tenant' });
    expect(customer.status).toBe(400);
    expect(customer.body.error.code).toBe('VALIDATION_ERROR');

    const lead = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Inyectado', source: 'web', tenantId: 'otro-tenant' });
    expect(lead.status).toBe(400);
  });

  it('campos desconocidos (incluidos anidados y computed) → 400', async () => {
    const unknownTop = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'UNK-1', name: 'X', isAdmin: true });
    expect(unknownTop.status).toBe(400);

    const unknownNested = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'UNK-2', name: 'X', address: { street: 'Main', zip: '28001' } });
    expect(unknownNested.status).toBe(400);

    const computedActivity = await request(app)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        type: 'note',
        subject: 'Nota',
        customerId,
        completedAt: '2001-01-01T00:00:00Z',
      });
    expect(computedActivity.status).toBe(400); // completedAt lo fija el servidor
  });

  it('ids con formato inválido → 400 (nunca 500)', async () => {
    const get = await request(app)
      .get('/api/v1/customers/not-an-id')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(get.status).toBe(400);
    expect(get.body.error.code).toBe('VALIDATION_ERROR');

    const patch = await request(app)
      .patch('/api/v1/leads/xyz')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'contacted' });
    expect(patch.status).toBe(400);

    const badQuery = await request(app)
      .get('/api/v1/leads?status=hacked')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badQuery.status).toBe(400);

    const badPage = await request(app)
      .get('/api/v1/customers?page=0&limit=5000')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badPage.status).toBe(400);
  });

  it('/search: 401 anónimo, query inválida y resultados vacíos sin permisos', async () => {
    const anon = await request(app).get('/api/v1/search?q=cliente');
    expect(anon.status).toBe(401);

    const tooShort = await request(app)
      .get('/api/v1/search?q=a')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(tooShort.status).toBe(400);

    const badType = await request(app)
      .get('/api/v1/search?q=cliente&types=usuario')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badType.status).toBe(400);

    // Sin `<recurso>:read` no hay 403 global: el tipo no aparece (denegación por tipo).
    const reader = await request(app)
      .get('/api/v1/search?q=cliente')
      .set('Authorization', `Bearer ${readerToken}`);
    expect(reader.status).toBe(200);
    expect(reader.body.data.results).toEqual([]);
  });

  it('las respuestas de CRM no filtran tenantId internos ni secretos', async () => {
    const list = await request(app)
      .get('/api/v1/customers?limit=100')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    const raw = JSON.stringify(list.body);
    expect(raw).not.toContain('tenantId');
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('$argon2id');
  });
});
