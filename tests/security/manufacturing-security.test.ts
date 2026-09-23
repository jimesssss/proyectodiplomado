/**
 * Seguridad Manufacturing — FASE 16.
 * 401 en las 8 rutas sin token/token manipulado, 403 con `details.permission`
 * por recurso (bom ≠ production.order: permisos separados), leer ≠ actualizar,
 * token con `pv` obsoleta (catálogo v1→v2 tras el alta de permisos), entrada
 * estricta (tenantId/number/campos inmutables `code`/`lines`, XOR bomId vs
 * líneas), rutas DELETE inexistentes (404) y ausencia de `tenantId` en
 * respuestas.
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
import {
  createOrgRouter,
  ORG_KINDS_BY_PATH,
  ORG_ROUTE_PATHS,
} from '../../apps/api/src/modules/organization/index.js';
import { createTenantRouter, isTenantActive } from '../../apps/api/src/modules/tenancy/index.js';
import { createInventoryRouters } from '../../apps/api/src/modules/inventory/index.js';
import { createManufacturingRouters } from '../../apps/api/src/modules/manufacturing/index.js';

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
    ...ORG_KINDS_BY_PATH.map((kind) => ({
      path: `/api/v1/${ORG_ROUTE_PATHS[kind]}`,
      router: createOrgRouter(deps, kind),
    })),
    ...createInventoryRouters(deps),
    ...createManufacturingRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';
const ID_PATH = '0123456789abcdef01234567';

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';
let bomReaderToken = '';
let orderReaderToken = '';
let bomId = '';
let orderId = '';
let warehouseId = '';
let compId = '';
let outId = '';

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

describe('manufacturing security: permisos por recurso, sin DELETE y entrada estricta', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_manufacturing_sec'), logger);

    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'MFGSEC',
        slug: 'mfg-sec',
        owner: { email: 'mfgsec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(res.status).toBe(201);
    ownerToken = await login('mfgsec-owner@example.com');

    // Fixtures para los 200 de lectura: cadena organization→company→branch→warehouse.
    const org = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'SEC-ORG', name: 'Org Seguridad' });
    expect(org.status, JSON.stringify(org.body)).toBe(201);
    const company = await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'SEC-CO', name: 'Co Seguridad', parentId: org.body.data.id });
    expect(company.status, JSON.stringify(company.body)).toBe(201);
    const branch = await request(app)
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'SEC-BR', name: 'Br Seguridad', parentId: company.body.data.id });
    expect(branch.status).toBe(201);
    const warehouse = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'SEC-WH', name: 'Wh Seguridad', parentId: branch.body.data.id });
    expect(warehouse.status).toBe(201);
    warehouseId = warehouse.body.data.id as string;

    const comp = await request(app)
      .post('/api/v1/inventory/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'sec-comp', name: 'Componente Sec' });
    expect(comp.status).toBe(201);
    compId = comp.body.data.id as string;
    const out = await request(app)
      .post('/api/v1/inventory/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'sec-out', name: 'Terminado Sec' });
    expect(out.status).toBe(201);
    outId = out.body.data.id as string;

    const bom = await request(app)
      .post('/api/v1/manufacturing/boms')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        code: 'sec-kit',
        name: 'Kit Seguridad',
        productId: out.body.data.id,
        lines: [{ productId: comp.body.data.id, quantity: 1 }],
      });
    expect(bom.status, JSON.stringify(bom.body)).toBe(201);
    bomId = bom.body.data.id as string;

    const order = await request(app)
      .post('/api/v1/manufacturing/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        productId: out.body.data.id,
        quantity: 1,
        warehouseId,
        bomId,
      });
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    orderId = order.body.data.id as string;

    // Roles con permisos EXACTOS (denegación por defecto) y lectores separados.
    await createRole(ownerToken, 'bom-reader', ['bom:read']);
    await createRole(ownerToken, 'order-reader', ['production.order:read']);
    readerToken = await createUser(ownerToken, 'mfgsec-reader@example.com', []);
    bomReaderToken = await createUser(ownerToken, 'mfgsec-bomreader@example.com', ['bom-reader']);
    orderReaderToken = await createUser(ownerToken, 'mfgsec-orderreader@example.com', [
      'order-reader',
    ]);
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 UNAUTHENTICATED en las 8 rutas sin token y con token manipulado', async () => {
    const cases: ReadonlyArray<{
      readonly method: 'get' | 'post' | 'patch';
      readonly path: string;
    }> = [
      { method: 'get', path: '/api/v1/manufacturing/boms' },
      { method: 'post', path: '/api/v1/manufacturing/boms' },
      { method: 'get', path: `/api/v1/manufacturing/boms/${ID_PATH}` },
      { method: 'patch', path: `/api/v1/manufacturing/boms/${ID_PATH}` },
      { method: 'get', path: '/api/v1/manufacturing/orders' },
      { method: 'post', path: '/api/v1/manufacturing/orders' },
      { method: 'get', path: `/api/v1/manufacturing/orders/${ID_PATH}` },
      { method: 'patch', path: `/api/v1/manufacturing/orders/${ID_PATH}` },
    ];
    for (const c of cases) {
      const anon = await (c.method === 'get'
        ? request(app).get(c.path)
        : c.method === 'post'
          ? request(app).post(c.path).send({})
          : request(app).patch(c.path).send({}));
      expect(anon.status, `${c.method} ${c.path}`).toBe(401);
      expect(anon.body.error.code).toBe('UNAUTHENTICATED');
    }
    const tampered = await request(app)
      .get('/api/v1/manufacturing/orders')
      .set('Authorization', `Bearer ${ownerToken.slice(0, -4)}beef`);
    expect(tampered.status).toBe(401);
  });

  it('403 FORBIDDEN con details.permission en lectura y escritura de cada recurso', async () => {
    const cases: ReadonlyArray<{
      readonly method: 'get' | 'post' | 'patch';
      readonly path: string;
      readonly permission: string;
    }> = [
      { method: 'get', path: '/api/v1/manufacturing/boms', permission: 'bom:read' },
      { method: 'post', path: '/api/v1/manufacturing/boms', permission: 'bom:create' },
      {
        method: 'patch',
        path: `/api/v1/manufacturing/boms/${bomId}`,
        permission: 'bom:update',
      },
      { method: 'get', path: '/api/v1/manufacturing/orders', permission: 'production.order:read' },
      {
        method: 'post',
        path: '/api/v1/manufacturing/orders',
        permission: 'production.order:create',
      },
      {
        method: 'patch',
        path: `/api/v1/manufacturing/orders/${orderId}`,
        permission: 'production.order:update',
      },
    ];
    for (const c of cases) {
      const res = await (
        c.method === 'get'
          ? request(app).get(c.path)
          : c.method === 'post'
            ? request(app).post(c.path).send({})
            : request(app).patch(c.path).send({ notes: 'x' })
      ).set('Authorization', `Bearer ${readerToken}`); // roles: [] → sin permisos
      expect(res.status, `${c.method} ${c.path}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('Missing permission');
      expect(res.body.error.details.permission).toBe(c.permission);
    }
  });

  it('bom y production.order son permisos separados; leer no implica actualizar', async () => {
    // Solo `bom:read`: puede leer BOMs pero ni tocar órdenes.
    const boms = await request(app)
      .get('/api/v1/manufacturing/boms')
      .set('Authorization', `Bearer ${bomReaderToken}`);
    expect(boms.status).toBe(200);
    const ordersFromBomReader = await request(app)
      .get('/api/v1/manufacturing/orders')
      .set('Authorization', `Bearer ${bomReaderToken}`);
    expect(ordersFromBomReader.status).toBe(403);
    expect(ordersFromBomReader.body.error.details.permission).toBe('production.order:read');
    const createOrderFromBomReader = await request(app)
      .post('/api/v1/manufacturing/orders')
      .set('Authorization', `Bearer ${bomReaderToken}`)
      .send({});
    expect(createOrderFromBomReader.status).toBe(403);
    expect(createOrderFromBomReader.body.error.details.permission).toBe('production.order:create');
    const patchBomFromBomReader = await request(app)
      .patch(`/api/v1/manufacturing/boms/${bomId}`)
      .set('Authorization', `Bearer ${bomReaderToken}`)
      .send({ name: 'x' });
    expect(patchBomFromBomReader.status).toBe(403); // leer ≠ actualizar
    expect(patchBomFromBomReader.body.error.details.permission).toBe('bom:update');

    // Solo `production.order:read`: espejo exacto.
    const orders = await request(app)
      .get('/api/v1/manufacturing/orders')
      .set('Authorization', `Bearer ${orderReaderToken}`);
    expect(orders.status).toBe(200);
    const bomsFromOrderReader = await request(app)
      .get('/api/v1/manufacturing/boms')
      .set('Authorization', `Bearer ${orderReaderToken}`);
    expect(bomsFromOrderReader.status).toBe(403);
    expect(bomsFromOrderReader.body.error.details.permission).toBe('bom:read');
    const patchOrderFromOrderReader = await request(app)
      .patch(`/api/v1/manufacturing/orders/${orderId}`)
      .set('Authorization', `Bearer ${orderReaderToken}`)
      .send({ notes: 'x' });
    expect(patchOrderFromOrderReader.status).toBe(403);
    expect(patchOrderFromOrderReader.body.error.details.permission).toBe('production.order:update');
  });

  it('token con pv obsoleta → 403 de re-autenticación en ambos recursos; /auth/me 200', async () => {
    expect(PERMISSION_CATALOG_VERSION).toBe(2); // v1→v2 por el alta bom/production.order
    const ownerClaims = jwt.verifyAccessToken(ownerToken);
    const stale = jwt.signAccessToken({
      userId: ownerClaims.sub,
      tenantId: ownerClaims.tenantId,
      roles: ownerClaims.roles,
      permissions: [...ownerClaims.permissions],
      permVersion: PERMISSION_CATALOG_VERSION - 1,
      sessionId: ownerClaims.sid,
    });

    const boms = await request(app)
      .get('/api/v1/manufacturing/boms')
      .set('Authorization', `Bearer ${stale}`);
    expect(boms.status).toBe(403);
    expect(boms.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const orders = await request(app)
      .get('/api/v1/manufacturing/orders')
      .set('Authorization', `Bearer ${stale}`);
    expect(orders.status).toBe(403);
    expect(orders.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(200); // solo-autenticada sigue operativa
  });

  it('entrada estricta: XOR bomId/lines, campos inmutables y sin DELETE (404)', async () => {
    const injectedTenant = await request(app)
      .post('/api/v1/manufacturing/boms')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tenantId: 'evil' });
    expect(injectedTenant.status).toBe(400); // estricto: tenantId solo del JWT

    const both = await request(app)
      .post('/api/v1/manufacturing/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        productId: MISSING_ID,
        quantity: 1,
        warehouseId: MISSING_ID,
        bomId: ID_PATH,
        lines: [{ productId: ID_PATH, quantity: 1 }],
      });
    expect(both.status).toBe(400);
    expect(JSON.stringify(both.body)).toContain('Provide either bomId or lines, not both');

    const neither = await request(app)
      .post('/api/v1/manufacturing/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId: ID_PATH, quantity: 1, warehouseId: ID_PATH });
    expect(neither.status).toBe(400);
    expect(JSON.stringify(neither.body)).toContain('Either bomId or lines is required');

    const unknownKey = await request(app)
      .post('/api/v1/manufacturing/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId: ID_PATH, quantity: 1, warehouseId: ID_PATH, hack: true });
    expect(unknownKey.status).toBe(400);

    const patchCode = await request(app)
      .patch(`/api/v1/manufacturing/boms/${bomId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'NEWCODE' });
    expect(patchCode.status).toBe(400); // `code` es clave natural inmutable

    const patchLines = await request(app)
      .patch(`/api/v1/manufacturing/orders/${orderId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ lines: [{ productId: ID_PATH, quantity: 1 }] });
    expect(patchLines.status).toBe(400); // `lines` se fija al crear la orden

    const badId = await request(app)
      .patch('/api/v1/manufacturing/orders/not-an-id')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ notes: 'x' });
    expect(badId.status).toBe(400);

    const unknownRoute = await request(app)
      .get('/api/v1/manufacturing/unknown')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(unknownRoute.status).toBe(404);

    const deleteBom = await request(app)
      .delete(`/api/v1/manufacturing/boms/${bomId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deleteBom.status).toBe(404); // sin `bom:delete` en el catálogo
    const deleteOrder = await request(app)
      .delete(`/api/v1/manufacturing/orders/${orderId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deleteOrder.status).toBe(404); // sin `production.order:delete` en el catálogo
  });

  it('las respuestas nunca filtran tenantId', async () => {
    const boms = await request(app)
      .get('/api/v1/manufacturing/boms')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(boms.status).toBe(200);
    expect(JSON.stringify(boms.body)).not.toContain('tenantId');

    const orders = await request(app)
      .get('/api/v1/manufacturing/orders')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(orders.status).toBe(200);
    expect(JSON.stringify(orders.body)).not.toContain('tenantId');

    const created = await request(app)
      .post('/api/v1/manufacturing/boms')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        code: 'sec-kit-2',
        name: 'Kit 2',
        productId: outId,
        lines: [{ productId: compId, quantity: 2 }],
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');

    const order = await request(app)
      .get(`/api/v1/manufacturing/orders/${orderId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(order.status).toBe(200);
    expect(JSON.stringify(order.body)).not.toContain('tenantId');
  });
});
