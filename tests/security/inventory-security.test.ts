/**
 * Seguridad Inventory — FASE 11.
 * 401 en las 5 rutas, 403 con `details.permission` por recurso, separación
 * explícita de `stock.count:approve` (actualizar ≠ aprobar), token con `pv`
 * obsoleta, validación estricta (tenantId/number/status/campos del ledger),
 * cantidades inválidas, queries inválidas y ausencia de datos internos.
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
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';
let editorToken = '';
let warehouseId = '';
let productId = '';
let countId = '';

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

describe('inventory security: permisos por recurso, approve propio y ledger estricto', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_inventory_sec'), logger);

    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'INVSEC',
        slug: 'inv-sec',
        owner: { email: 'invsec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(res.status).toBe(201);
    ownerToken = await login('invsec-owner@example.com');

    // Cadena organization→company→branch→warehouse (FK de almacén).
    const post = (path: string, body: object) =>
      request(app).post(path).set('Authorization', `Bearer ${ownerToken}`).send(body);
    const org = await post('/api/v1/organizations', { code: 'ORG-SEC', name: 'Org Sec' });
    expect(org.status).toBe(201);
    const comp = await post('/api/v1/companies', {
      code: 'COMP-SEC',
      name: 'Comp Sec',
      parentId: org.body.data.id as string,
    });
    expect(comp.status).toBe(201);
    const branch = await post('/api/v1/branches', {
      code: 'BR-SEC',
      name: 'Branch Sec',
      parentId: comp.body.data.id as string,
    });
    expect(branch.status).toBe(201);
    const warehouse = await post('/api/v1/warehouses', {
      code: 'WH-SEC',
      name: 'Warehouse Sec',
      parentId: branch.body.data.id as string,
    });
    expect(warehouse.status).toBe(201);
    warehouseId = warehouse.body.data.id as string;

    const product = await post('/api/v1/inventory/products', {
      code: 'sec-01',
      name: 'Producto Seguridad',
    });
    expect(product.status).toBe(201);
    productId = product.body.data.id as string;

    const count = await post('/api/v1/inventory/counts', {
      warehouseId,
      lines: [{ productId, countedQty: 3 }],
    });
    expect(count.status).toBe(201);
    countId = count.body.data.id as string;

    // Sin roles → sin permisos (denegación por defecto).
    const reader = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'invsec-reader@example.com',
        password: PASSWORD,
        displayName: 'Reader',
        roles: [],
      });
    expect(reader.status).toBe(201);
    readerToken = await login('invsec-reader@example.com');

    // Editor de conteos: puede crear/editar, pero NO aprobar (permiso separado).
    const role = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        key: 'count-editor',
        name: 'Count Editor',
        permissions: ['stock.count:read', 'stock.count:create', 'stock.count:update'],
      });
    expect(role.status).toBe(201);
    const editor = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'invsec-editor@example.com',
        password: PASSWORD,
        displayName: 'Editor',
        roles: ['count-editor'],
      });
    expect(editor.status).toBe(201);
    editorToken = await login('invsec-editor@example.com');
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 en las 5 rutas sin token y con token manipulado', async () => {
    const lists = [
      '/api/v1/inventory/products',
      '/api/v1/inventory/stock',
      '/api/v1/inventory/movements',
      '/api/v1/inventory/transfers',
      '/api/v1/inventory/counts',
    ];
    for (const path of lists) {
      const anon = await request(app).get(path);
      expect(anon.status, path).toBe(401);
      expect(anon.body.error.code).toBe('UNAUTHENTICATED');
    }

    const product = await request(app)
      .post('/api/v1/inventory/products')
      .send({ code: 'anon', name: 'Anon' });
    expect(product.status).toBe(401);

    const movement = await request(app)
      .post('/api/v1/inventory/movements')
      .send({ productId, warehouseId, type: 'manual_in', quantity: 1, reason: 'X' });
    expect(movement.status).toBe(401);

    const transfer = await request(app)
      .post('/api/v1/inventory/transfers')
      .send({
        fromWarehouseId: warehouseId,
        toWarehouseId: MISSING_ID,
        lines: [{ productId, quantity: 1 }],
      });
    expect(transfer.status).toBe(401);

    const count = await request(app)
      .post('/api/v1/inventory/counts')
      .send({ warehouseId, lines: [{ productId, countedQty: 1 }] });
    expect(count.status).toBe(401);

    const approve = await request(app).post(`/api/v1/inventory/counts/${countId}/approve`);
    expect(approve.status).toBe(401);

    const tampered = await request(app)
      .get('/api/v1/inventory/products')
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
      { method: 'get', path: '/api/v1/inventory/products', permission: 'product:read' },
      {
        method: 'post',
        path: '/api/v1/inventory/products',
        permission: 'product:create',
        body: { code: 'nope', name: 'Nope' },
      },
      {
        method: 'delete',
        path: `/api/v1/inventory/products/${MISSING_ID}`,
        permission: 'product:delete',
      },
      { method: 'get', path: '/api/v1/inventory/stock', permission: 'stock.movement:read' },
      { method: 'get', path: '/api/v1/inventory/movements', permission: 'stock.movement:read' },
      {
        method: 'post',
        path: '/api/v1/inventory/movements',
        permission: 'stock.movement:create',
        body: {
          productId,
          warehouseId,
          type: 'manual_in',
          quantity: 1,
          reason: 'X',
        },
      },
      { method: 'get', path: '/api/v1/inventory/transfers', permission: 'stock.transfer:read' },
      {
        method: 'post',
        path: '/api/v1/inventory/transfers',
        permission: 'stock.transfer:create',
        body: {
          fromWarehouseId: warehouseId,
          toWarehouseId: MISSING_ID,
          lines: [{ productId, quantity: 1 }],
        },
      },
      {
        method: 'patch',
        path: `/api/v1/inventory/transfers/${MISSING_ID}`,
        permission: 'stock.transfer:update',
        body: { status: 'in_transit' },
      },
      { method: 'get', path: '/api/v1/inventory/counts', permission: 'stock.count:read' },
      {
        method: 'post',
        path: '/api/v1/inventory/counts',
        permission: 'stock.count:create',
        body: { warehouseId, lines: [{ productId, countedQty: 1 }] },
      },
      {
        method: 'patch',
        path: `/api/v1/inventory/counts/${MISSING_ID}`,
        permission: 'stock.count:update',
        body: { notes: 'x' },
      },
      {
        method: 'post',
        path: `/api/v1/inventory/counts/${countId}/approve`,
        permission: 'stock.count:approve',
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

  it('aprobar NO es actualizar: el editor modifica conteos pero no los aprueba', async () => {
    const created = await request(app)
      .post('/api/v1/inventory/counts')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ warehouseId, lines: [{ productId, countedQty: 1 }] });
    expect(created.status).toBe(201); // stock.count:create ✓
    const editorCountId = created.body.data.id as string;

    const updated = await request(app)
      .patch(`/api/v1/inventory/counts/${editorCountId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ notes: 'nota del editor' });
    expect(updated.status).toBe(200); // stock.count:update ✓

    const approve = await request(app)
      .post(`/api/v1/inventory/counts/${editorCountId}/approve`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({});
    expect(approve.status).toBe(403); // stock.count:approve ✗ (aunque update exista)
    expect(approve.body.error.details.permission).toBe('stock.count:approve');

    const otherResource = await request(app)
      .get('/api/v1/inventory/products')
      .set('Authorization', `Bearer ${editorToken}`);
    expect(otherResource.status).toBe(403);
    expect(otherResource.body.error.details.permission).toBe('product:read');
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
      .get('/api/v1/inventory/products')
      .set('Authorization', `Bearer ${stale}`);
    expect(list.status).toBe(403);
    expect(list.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(200); // solo-autenticada sigue operativa
  });

  it('tenantId, number, status y campos del ledger inyectados → 400', async () => {
    const tenant = await request(app)
      .post('/api/v1/inventory/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'inj-1', name: 'X', tenantId: 'otro-tenant' });
    expect(tenant.status).toBe(400);
    expect(tenant.body.error.code).toBe('VALIDATION_ERROR');

    const archivedProduct = await request(app)
      .post('/api/v1/inventory/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'inj-2', name: 'X', archived: true });
    expect(archivedProduct.status).toBe(400); // todo nace activo

    const productStatus = await request(app)
      .post('/api/v1/inventory/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'inj-3', name: 'X', status: 'archived' });
    expect(productStatus.status).toBe(400);

    const balance = await request(app)
      .post('/api/v1/inventory/movements')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        productId,
        warehouseId,
        type: 'manual_in',
        quantity: 1,
        reason: 'X',
        balanceAfter: 9999,
      });
    expect(balance.status).toBe(400); // el saldo lo deriva SOLO el servidor

    const movementTenant = await request(app)
      .post('/api/v1/inventory/movements')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        productId,
        warehouseId,
        type: 'manual_in',
        quantity: 1,
        reason: 'X',
        tenantId: 'otro-tenant',
      });
    expect(movementTenant.status).toBe(400);

    const number = await request(app)
      .post('/api/v1/inventory/transfers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fromWarehouseId: warehouseId,
        toWarehouseId: MISSING_ID,
        lines: [{ productId, quantity: 1 }],
        number: 'TR-1999-000001',
      });
    expect(number.status).toBe(400); // la numeración es del servidor

    const transferStatus = await request(app)
      .post('/api/v1/inventory/transfers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fromWarehouseId: warehouseId,
        toWarehouseId: MISSING_ID,
        lines: [{ productId, quantity: 1 }],
        status: 'completed',
      });
    expect(transferStatus.status).toBe(400); // todo nace en draft

    const transferArchived = await request(app)
      .post('/api/v1/inventory/transfers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fromWarehouseId: warehouseId,
        toWarehouseId: MISSING_ID,
        lines: [{ productId, quantity: 1 }],
        archived: true,
      });
    expect(transferArchived.status).toBe(400);

    const countStatus = await request(app)
      .post('/api/v1/inventory/counts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        warehouseId,
        lines: [{ productId, countedQty: 1 }],
        status: 'approved',
      });
    expect(countStatus.status).toBe(400); // la aprobación solo por endpoint propio
  });

  it('cantidades y líneas inválidas → 400 (nunca 500 ni negativos)', async () => {
    const movementCases: ReadonlyArray<{ readonly name: string; readonly body: object }> = [
      { name: 'cantidad cero', body: { quantity: 0 } },
      { name: 'cantidad negativa', body: { quantity: -5 } },
      { name: 'tipo del sistema', body: { type: 'receipt' } },
      { name: 'tipo inexistente', body: { type: 'teleport' } },
      { name: 'sin razón', body: { reason: '' } },
    ];
    for (const testCase of movementCases) {
      const res = await request(app)
        .post('/api/v1/inventory/movements')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          productId,
          warehouseId,
          type: 'manual_in',
          ...testCase.body,
        });
      expect(res.status, testCase.name).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }

    const sameWarehouse = await request(app)
      .post('/api/v1/inventory/transfers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fromWarehouseId: warehouseId,
        toWarehouseId: warehouseId,
        lines: [{ productId, quantity: 1 }],
      });
    expect(sameWarehouse.status).toBe(400);

    const noLines = await request(app)
      .post('/api/v1/inventory/transfers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fromWarehouseId: warehouseId, toWarehouseId: MISSING_ID, lines: [] });
    expect(noLines.status).toBe(400);

    const negativeCount = await request(app)
      .post('/api/v1/inventory/counts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId, lines: [{ productId, countedQty: -1 }] });
    expect(negativeCount.status).toBe(400);

    const emptyCountLines = await request(app)
      .post('/api/v1/inventory/counts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId, lines: [] });
    expect(emptyCountLines.status).toBe(400);
  });

  it('ids y queries con formato inválido → 400 (nunca 500)', async () => {
    const movement = await request(app)
      .get('/api/v1/inventory/movements/not-an-id')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(movement.status).toBe(400);

    const patch = await request(app)
      .patch('/api/v1/inventory/transfers/xyz')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'in_transit' });
    expect(patch.status).toBe(400);

    const badWarehouse = await request(app)
      .get('/api/v1/inventory/stock?warehouseId=xyz')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badWarehouse.status).toBe(400);

    const badType = await request(app)
      .get('/api/v1/inventory/movements?type=hacked')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badType.status).toBe(400);

    const badStatus = await request(app)
      .get('/api/v1/inventory/transfers?status=hacked')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badStatus.status).toBe(400);

    const badArchived = await request(app)
      .get('/api/v1/inventory/products?archived=yes')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badArchived.status).toBe(400);

    const badPage = await request(app)
      .get('/api/v1/inventory/products?page=0&limit=1000')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badPage.status).toBe(400);
  });

  it('las respuestas de inventory no filtran tenantId internos ni secretos', async () => {
    const lists = [
      '/api/v1/inventory/products?limit=100',
      '/api/v1/inventory/stock?limit=100',
      '/api/v1/inventory/movements?limit=100',
      '/api/v1/inventory/transfers?limit=100',
      '/api/v1/inventory/counts?limit=100',
    ];
    for (const path of lists) {
      const list = await request(app).get(path).set('Authorization', `Bearer ${ownerToken}`);
      expect(list.status, path).toBe(200);
      const raw = JSON.stringify(list.body);
      expect(raw, path).not.toContain('tenantId');
      expect(raw, path).not.toContain('passwordHash');
      expect(raw, path).not.toContain('$argon2id');
    }
  });
});
