/**
 * Seguridad Sales — FASE 9.
 * 401/403 por tipo de documento, separación explícita de `sales.quote:approve`
 * (actualizar ≠ aprobar), token con `pv` obsoleta, validación estricta
 * (tenantId/number/campos calculados), importes inválidos y ausencia de
 * datos internos en las respuestas.
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
import { createCrmRouters } from '../../apps/api/src/modules/crm/index.js';
import { createSalesRouters } from '../../apps/api/src/modules/sales/index.js';

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
    ...createSalesRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';
const LINES = [{ description: 'Servicio', quantity: 1, unitPrice: 100 }];

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';
let salesToken = '';
let customerId = '';
let quoteId = '';

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

describe('sales security: permisos por tipo, approve propio y entrada estricta', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_sales_sec'), logger);

    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'SALESSEC',
        slug: 'sales-sec',
        owner: { email: 'salessec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(res.status).toBe(201);
    ownerToken = await login('salessec-owner@example.com');

    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'SEC-01', name: 'Cliente Seguridad' });
    expect(customer.status).toBe(201);
    customerId = customer.body.data.id as string;

    const quote = await request(app)
      .post('/api/v1/sales/quotes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerId, lines: LINES });
    expect(quote.status).toBe(201);
    quoteId = quote.body.data.id as string;

    // Sin roles → sin permisos (denegación por defecto).
    const reader = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'salessec-reader@example.com',
        password: PASSWORD,
        displayName: 'Reader',
        roles: [],
      });
    expect(reader.status).toBe(201);
    readerToken = await login('salessec-reader@example.com');

    // Vendedor: puede cotizar/pedidos, pero NO aprobar (permiso separado).
    const role = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        key: 'sales-person',
        name: 'Sales Person',
        permissions: [
          'sales.quote:read',
          'sales.quote:create',
          'sales.quote:update',
          'sales.quote:delete',
          'sales.order:read',
          'sales.order:create',
          'sales.order:update',
          'sales.order:delete',
        ],
      });
    expect(role.status).toBe(201);
    const seller = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'salessec-seller@example.com',
        password: PASSWORD,
        displayName: 'Seller',
        roles: ['sales-person'],
      });
    expect(seller.status).toBe(201);
    salesToken = await login('salessec-seller@example.com');
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 en los 5 tipos sin token y con token manipulado', async () => {
    const lists = [
      '/api/v1/sales/quotes',
      '/api/v1/sales/orders',
      '/api/v1/sales/deliveries',
      '/api/v1/sales/invoices',
      '/api/v1/sales/returns',
    ];
    for (const path of lists) {
      const anon = await request(app).get(path);
      expect(anon.status).toBe(401);
      expect(anon.body.error.code).toBe('UNAUTHENTICATED');
    }
    const create = await request(app)
      .post('/api/v1/sales/quotes')
      .send({ customerId, lines: LINES });
    expect(create.status).toBe(401);

    const approve = await request(app).post(`/api/v1/sales/quotes/${quoteId}/approve`);
    expect(approve.status).toBe(401);

    const tampered = await request(app)
      .get('/api/v1/sales/quotes')
      .set('Authorization', `Bearer ${ownerToken.slice(0, -4)}beef`);
    expect(tampered.status).toBe(401);
  });

  it('sin permisos: 403 con details.permission en lectura y escritura de cada tipo', async () => {
    const cases: ReadonlyArray<{
      readonly method: 'get' | 'post' | 'patch' | 'delete';
      readonly path: string;
      readonly permission: string;
      readonly body?: Record<string, unknown>;
    }> = [
      { method: 'get', path: '/api/v1/sales/quotes', permission: 'sales.quote:read' },
      {
        method: 'post',
        path: '/api/v1/sales/quotes',
        permission: 'sales.quote:create',
        body: { customerId, lines: LINES },
      },
      {
        method: 'patch',
        path: `/api/v1/sales/orders/${MISSING_ID}`,
        permission: 'sales.order:update',
        body: { status: 'confirmed' },
      },
      {
        method: 'delete',
        path: `/api/v1/sales/invoices/${MISSING_ID}`,
        permission: 'sales.invoice:delete',
      },
      { method: 'get', path: '/api/v1/sales/returns', permission: 'sales.return:read' },
      { method: 'get', path: '/api/v1/sales/deliveries', permission: 'sales.delivery:read' },
      {
        method: 'post',
        path: `/api/v1/sales/quotes/${quoteId}/approve`,
        permission: 'sales.quote:approve',
        body: {},
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

  it('aprobar NO es actualizar: el vendedor edita cotizaciones pero no aprueba', async () => {
    const created = await request(app)
      .post('/api/v1/sales/quotes')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ customerId, lines: LINES });
    expect(created.status).toBe(201); // sales.quote:create ✓
    const sellerQuoteId = created.body.data.id as string;

    const updated = await request(app)
      .patch(`/api/v1/sales/quotes/${sellerQuoteId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ notes: 'nota del vendedor' });
    expect(updated.status).toBe(200); // sales.quote:update ✓

    const approve = await request(app)
      .post(`/api/v1/sales/quotes/${sellerQuoteId}/approve`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({});
    expect(approve.status).toBe(403); // sales.quote:approve ✗ (aunque update exista)
    expect(approve.body.error.details.permission).toBe('sales.quote:approve');

    const otherType = await request(app)
      .get('/api/v1/sales/invoices')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(otherType.status).toBe(403);
    expect(otherType.body.error.details.permission).toBe('sales.invoice:read');
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
      .get('/api/v1/sales/quotes')
      .set('Authorization', `Bearer ${stale}`);
    expect(list.status).toBe(403);
    expect(list.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(200); // solo-autenticada sigue operativa
  });

  it('tenantId, number, status y campos calculados inyectados → 400', async () => {
    const tenant = await request(app)
      .post('/api/v1/sales/quotes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerId, lines: LINES, tenantId: 'otro-tenant' });
    expect(tenant.status).toBe(400);
    expect(tenant.body.error.code).toBe('VALIDATION_ERROR');

    const number = await request(app)
      .post('/api/v1/sales/quotes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerId, lines: LINES, number: 'QT-1999-000001' });
    expect(number.status).toBe(400); // la numeración es del servidor

    const status = await request(app)
      .post('/api/v1/sales/quotes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerId, lines: LINES, status: 'approved' });
    expect(status.status).toBe(400); // todo nace en draft

    const totals = await request(app)
      .post('/api/v1/sales/quotes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerId, lines: LINES, total: 1 });
    expect(totals.status).toBe(400);

    const approval = await request(app)
      .post('/api/v1/sales/quotes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerId, lines: LINES, approvedBy: 'yo-mismo' });
    expect(approval.status).toBe(400);

    const lineComputed = await request(app)
      .post('/api/v1/sales/quotes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        customerId,
        lines: [{ description: 'X', quantity: 1, unitPrice: 10, subtotal: 999, total: 999 }],
      });
    expect(lineComputed.status).toBe(400); // subtotales solo del servidor
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
        .post('/api/v1/sales/quotes')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ customerId, lines: testCase.lines });
      expect(res.status, testCase.name).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('ids y queries con formato inválido → 400 (nunca 500)', async () => {
    const get = await request(app)
      .get('/api/v1/sales/quotes/not-an-id')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(get.status).toBe(400);

    const patch = await request(app)
      .patch('/api/v1/sales/orders/xyz')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'confirmed' });
    expect(patch.status).toBe(400);

    const badStatus = await request(app)
      .get('/api/v1/sales/invoices?status=hacked')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badStatus.status).toBe(400);

    const badArchived = await request(app)
      .get('/api/v1/sales/quotes?archived=yes')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badArchived.status).toBe(400);

    const badCustomer = await request(app)
      .get('/api/v1/sales/quotes?customerId=xyz')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badCustomer.status).toBe(400);

    const badPage = await request(app)
      .get('/api/v1/sales/quotes?page=0&limit=1000')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badPage.status).toBe(400);
  });

  it('las respuestas de sales no filtran tenantId internos ni secretos', async () => {
    const list = await request(app)
      .get('/api/v1/sales/quotes?limit=100')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    const raw = JSON.stringify(list.body);
    expect(raw).not.toContain('tenantId');
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('$argon2id');
  });
});
