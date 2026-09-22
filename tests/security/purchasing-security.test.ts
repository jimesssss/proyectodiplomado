/**
 * Seguridad Purchasing — FASE 10.
 * 401/403 por recurso con `details.permission`, receipts SIN ruta DELETE
 * (404 porque el catálogo no define `goods.receipt:delete`), token con `pv`
 * obsoleto, validación estricta (tenantId/number/campos calculados),
 * importes inválidos y ausencia de datos internos en las respuestas.
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
import { createPurchasingRouters } from '../../apps/api/src/modules/purchasing/index.js';

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
    ...createPurchasingRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';
const LINES = [{ description: 'Insumo', quantity: 1, unitPrice: 100 }];

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';
let supplierId = '';
let requestId = '';

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

describe('purchasing security: permisos por recurso, receipts sin DELETE y entrada estricta', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_purchasing_sec'), logger);

    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'PURCHSEC',
        slug: 'purch-sec',
        owner: { email: 'purchsec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(res.status).toBe(201);
    ownerToken = await login('purchsec-owner@example.com');

    const supplier = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'SEC-01', name: 'Proveedor Seguridad' });
    expect(supplier.status).toBe(201);
    supplierId = supplier.body.data.id as string;

    const created = await request(app)
      .post('/api/v1/purchasing/requests')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ supplierId, lines: LINES });
    expect(created.status).toBe(201);
    requestId = created.body.data.id as string;

    const reader = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'purchsec-reader@example.com',
        password: PASSWORD,
        displayName: 'Reader',
        roles: [],
      });
    expect(reader.status).toBe(201);
    readerToken = await login('purchsec-reader@example.com');
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 en los 6 listados sin token y con token manipulado', async () => {
    const lists = [
      '/api/v1/suppliers',
      '/api/v1/purchasing/requests',
      '/api/v1/purchasing/orders',
      '/api/v1/purchasing/receipts',
      '/api/v1/purchasing/invoices',
      '/api/v1/purchasing/returns',
    ];
    for (const path of lists) {
      const anon = await request(app).get(path);
      expect(anon.status).toBe(401);
      expect(anon.body.error.code).toBe('UNAUTHENTICATED');
    }
    const create = await request(app)
      .post('/api/v1/purchasing/requests')
      .send({ supplierId, lines: LINES });
    expect(create.status).toBe(401);

    const tampered = await request(app)
      .get('/api/v1/purchasing/requests')
      .set('Authorization', `Bearer ${ownerToken.slice(0, -4)}beef`);
    expect(tampered.status).toBe(401);
  });

  it('sin permisos: 403 con details.permission en lectura y escritura de cada recurso', async () => {
    const cases: ReadonlyArray<{
      readonly method: 'get' | 'post' | 'patch' | 'delete';
      readonly path: string;
      readonly permission: string;
      readonly body?: Record<string, unknown>;
    }> = [
      { method: 'get', path: '/api/v1/suppliers', permission: 'supplier:read' },
      {
        method: 'post',
        path: '/api/v1/suppliers',
        permission: 'supplier:create',
        body: { code: 'NUEVO', name: 'Nuevo' },
      },
      {
        method: 'post',
        path: '/api/v1/purchasing/requests',
        permission: 'purchase.request:create',
        body: { supplierId, lines: LINES },
      },
      {
        method: 'patch',
        path: `/api/v1/purchasing/requests/${requestId}`,
        permission: 'purchase.request:update',
        body: { notes: 'x' },
      },
      {
        method: 'delete',
        path: `/api/v1/purchasing/requests/${requestId}`,
        permission: 'purchase.request:delete',
      },
      {
        method: 'post',
        path: '/api/v1/purchasing/receipts',
        permission: 'goods.receipt:create',
        body: { lines: LINES },
      },
      {
        method: 'delete',
        path: `/api/v1/purchasing/invoices/${MISSING_ID}`,
        permission: 'supplier.invoice:delete',
      },
      { method: 'get', path: '/api/v1/purchasing/returns', permission: 'purchase.return:read' },
      {
        method: 'get',
        path: '/api/v1/purchasing/orders',
        permission: 'purchase.order:read',
      },
    ];
    for (const testCase of cases) {
      const call = request(app)[testCase.method](testCase.path);
      const req = call.set('Authorization', `Bearer ${readerToken}`);
      const res = testCase.body === undefined ? await req : await req.send(testCase.body);
      expect(res.status, `${testCase.method} ${testCase.path}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.details.permission).toBe(testCase.permission);
    }
  });

  it('receipts: sin permiso `:delete` en el catálogo, la ruta DELETE no EXISTE (404 para todos)', async () => {
    // Ni siquiera el owner puede DELETE: la ruta no se publica (archivar → PATCH {archived}).
    const owner = await request(app)
      .delete(`/api/v1/purchasing/receipts/${MISSING_ID}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(owner.status).toBe(404);

    const reader = await request(app)
      .delete(`/api/v1/purchasing/receipts/${MISSING_ID}`)
      .set('Authorization', `Bearer ${readerToken}`);
    expect(reader.status).toBe(404); // 404 de ruta ausente, no 403 de permiso
  });

  it('token con versión de catálogo obsoleta (pv=0) → 403 de re-autenticación', async () => {
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
      .get('/api/v1/purchasing/requests')
      .set('Authorization', `Bearer ${stale}`);
    expect(list.status).toBe(403);
    expect(list.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(200); // solo-autenticada sigue operativa
  });

  it('tenantId, number, status y campos calculados inyectados → 400', async () => {
    const tenant = await request(app)
      .post('/api/v1/purchasing/requests')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ supplierId, lines: LINES, tenantId: 'otro-tenant' });
    expect(tenant.status).toBe(400);
    expect(tenant.body.error.code).toBe('VALIDATION_ERROR');

    const number = await request(app)
      .post('/api/v1/purchasing/requests')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ supplierId, lines: LINES, number: 'RQ-1999-000001' });
    expect(number.status).toBe(400); // la numeración es del servidor

    const status = await request(app)
      .post('/api/v1/purchasing/requests')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ supplierId, lines: LINES, status: 'approved' });
    expect(status.status).toBe(400); // todo nace en draft

    const kind = await request(app)
      .post('/api/v1/purchasing/requests')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ supplierId, lines: LINES, kind: 'goods.receipt' });
    expect(kind.status).toBe(400); // el tipo lo fija la ruta

    const totals = await request(app)
      .post('/api/v1/purchasing/requests')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ supplierId, lines: LINES, total: 1 });
    expect(totals.status).toBe(400);

    const supplierInject = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'INJ-01', name: 'Inyectado', tenantId: 'otro-tenant', archived: true });
    expect(supplierInject.status).toBe(400);
  });

  it('importes y líneas inválidos → 400 (nunca 500 ni negativos)', async () => {
    const cases: ReadonlyArray<{ readonly name: string; readonly lines: unknown[] }> = [
      { name: 'cantidad cero', lines: [{ description: 'X', quantity: 0, unitPrice: 10 }] },
      { name: 'cantidad negativa', lines: [{ description: 'X', quantity: -2, unitPrice: 10 }] },
      { name: 'precio negativo', lines: [{ description: 'X', quantity: 1, unitPrice: -5 }] },
      {
        name: 'impuesto > 100',
        lines: [{ description: 'X', quantity: 1, unitPrice: 10, taxRate: 150 }],
      },
      {
        name: 'descuento > 100',
        lines: [{ description: 'X', quantity: 1, unitPrice: 10, discountPct: 101 }],
      },
      { name: 'sin líneas', lines: [] },
      { name: 'descripción vacía', lines: [{ description: '', quantity: 1, unitPrice: 10 }] },
    ];
    for (const testCase of cases) {
      const res = await request(app)
        .post('/api/v1/purchasing/requests')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ supplierId, lines: testCase.lines });
      expect(res.status, testCase.name).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('ids y queries con formato inválido → 400 (nunca 500)', async () => {
    const get = await request(app)
      .get('/api/v1/purchasing/requests/not-an-id')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(get.status).toBe(400);

    const patch = await request(app)
      .patch('/api/v1/purchasing/orders/xyz')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'confirmed' });
    expect(patch.status).toBe(400);

    const badStatus = await request(app)
      .get('/api/v1/purchasing/invoices?status=hacked')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badStatus.status).toBe(400);

    const badArchived = await request(app)
      .get('/api/v1/purchasing/requests?archived=yes')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badArchived.status).toBe(400);

    const badSupplier = await request(app)
      .get('/api/v1/purchasing/requests?supplierId=xyz')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badSupplier.status).toBe(400);

    const badPage = await request(app)
      .get('/api/v1/purchasing/requests?page=0&limit=1000')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badPage.status).toBe(400);
  });

  it('las respuestas no filtran tenantId internos ni secretos', async () => {
    const suppliers = await request(app)
      .get('/api/v1/suppliers?limit=100')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(suppliers.status).toBe(200);
    const requests = await request(app)
      .get('/api/v1/purchasing/requests?limit=100')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(requests.status).toBe(200);
    const raw = JSON.stringify({ s: suppliers.body, r: requests.body });
    expect(raw).not.toContain('tenantId');
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('$argon2id');
  });
});
