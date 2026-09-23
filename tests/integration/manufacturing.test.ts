/**
 * Integración Manufacturing — FASE 16.
 * Contra MongoDB real (memory server): BOM con clave natural única por tenant
 * e inmutable, líneas POR UNIDAD (producto terminado nunca componente),
 * órdenes MO-* numeradas secuencialmente, máquina de estados
 * draft→in_progress→completed/cancelled (409 en saltos y repetidos), alta de
 * orden desde BOM (snapshot) o líneas explícitas (XOR), completar con
 * pre-chequeo de saldo (422 DOMAIN_ERROR sin escribir nada) + movimientos
 * production_out/production_in con sourceType 'production.order', archivado
 * sin ruta DELETE (404), auditoría con reason de transición y aislamiento
 * cruzado (tenant B no ve ni mueve nada de A).
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
    { path: '/api/v1/audit', router: createAuditRouter(deps) },
    // Cadena de organización (org→company→branch→warehouse) para las FKs.
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
const YEAR = new Date().getUTCFullYear();

let mongod: MongoMemoryServer | undefined;

interface Provisioned {
  readonly token: string;
}

async function provision(slug: string, email: string): Promise<Provisioned> {
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
  return { token: login.body.data.accessToken as string };
}

describe('manufacturing: BOM y órdenes de producción', () => {
  let tokenA = '';
  let tokenB = '';
  let warehouseAId = '';
  let warehouseBId = '';
  let compAId = '';
  let compBId = '';
  let outAId = '';
  let tempAId = '';
  let compB1Id = '';
  let outB1Id = '';
  let bomAId = '';
  let bomA2Id = '';
  let bomBId = '';
  let order1Id = '';
  let order2Id = '';
  let order3Id = '';
  let order4Id = '';
  let order5Id = '';
  let order1Number = '';

  const postA = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const getA = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenA}`);
  const patchA = (path: string, body: object) =>
    request(app).patch(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const postB = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenB}`).send(body);
  const getB = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenB}`);

  async function createProduct(token: string, code: string, name: string): Promise<string> {
    const res = await request(app)
      .post('/api/v1/inventory/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ code, name });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as string;
  }

  async function createWarehouseChain(token: string, suffix: string): Promise<string> {
    const org = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MFG-ORG-${suffix}`, name: `Org ${suffix}` });
    expect(org.status).toBe(201);
    const company = await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MFG-CO-${suffix}`,
        name: `Company ${suffix}`,
        parentId: org.body.data.id,
      });
    expect(company.status).toBe(201);
    const branch = await request(app)
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MFG-BR-${suffix}`, name: `Branch ${suffix}`, parentId: company.body.data.id });
    expect(branch.status).toBe(201);
    const warehouse = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MFG-WH-${suffix}`,
        name: `Warehouse ${suffix}`,
        parentId: branch.body.data.id,
      });
    expect(warehouse.status).toBe(201);
    return warehouse.body.data.id as string;
  }

  async function stockQty(token: string, product: string, warehouse: string): Promise<number> {
    const res = await request(app)
      .get(`/api/v1/inventory/stock?productId=${product}&warehouseId=${warehouse}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    if ((res.body.data as unknown[]).length === 0) {
      return 0;
    }
    return (res.body.data as Array<{ qty: number }>)[0]?.qty ?? 0;
  }

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_manufacturing'), logger);
    const a = await provision('mfg-tenant-a', 'owner-a@mfg.example');
    const b = await provision('mfg-tenant-b', 'owner-b@mfg.example');
    tokenA = a.token;
    tokenB = b.token;
    warehouseAId = await createWarehouseChain(tokenA, 'A');
    warehouseBId = await createWarehouseChain(tokenB, 'B');
    compAId = await createProduct(tokenA, 'comp-a', 'Componente A');
    compBId = await createProduct(tokenA, 'comp-b', 'Componente B');
    outAId = await createProduct(tokenA, 'out-a', 'Producto Terminado A');
    tempAId = await createProduct(tokenA, 'temp-a', 'Producto temporal A');
    compB1Id = await createProduct(tokenB, 'comp-b1', 'Componente B1');
    outB1Id = await createProduct(tokenB, 'out-b1', 'Terminado B1');
    // Stock inicial del componente A (entrada manual +10).
    const stock = await postA('/api/v1/inventory/movements', {
      productId: compAId,
      warehouseId: warehouseAId,
      type: 'manual_in',
      quantity: 10,
      reason: 'Entrada inicial',
    });
    expect(stock.status).toBe(201);
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('BOM: código normalizado, único POR tenant y sin tenantId en la respuesta', async () => {
    const created = await postA('/api/v1/manufacturing/boms', {
      code: 'caja kit',
      name: 'Kit caja',
      productId: outAId,
      lines: [{ productId: compAId, quantity: 0.5 }],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const bom = created.body.data;
    expect(bom.code).toBe('CAJA-KIT'); // mayúsculas y espacios → guiones
    expect(bom.lines).toEqual([{ productId: compAId, quantity: 0.5 }]);
    expect(bom.archived).toBe(false);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    bomAId = bom.id as string;

    const duplicate = await postA('/api/v1/manufacturing/boms', {
      code: 'CAJA-KIT',
      name: 'Otra',
      productId: outAId,
      lines: [{ productId: compAId, quantity: 1 }],
    });
    expect(duplicate.status).toBe(409); // índice único (tenantId, code)

    // Mismo código en OTRO tenant → permitido (unicidad por tenant).
    const fromB = await postB('/api/v1/manufacturing/boms', {
      code: 'CAJA-KIT',
      name: 'Kit B',
      productId: outB1Id,
      lines: [{ productId: compB1Id, quantity: 1 }],
    });
    expect(fromB.status).toBe(201);
    bomBId = fromB.body.data.id as string;
  });

  it('BOM: FKs de producto 404/409 y reglas de líneas 400', async () => {
    const unknownOutput = await postA('/api/v1/manufacturing/boms', {
      code: 'kit-404',
      name: 'X',
      productId: MISSING_ID,
      lines: [{ productId: compAId, quantity: 1 }],
    });
    expect(unknownOutput.status).toBe(404);

    const unknownComponent = await postA('/api/v1/manufacturing/boms', {
      code: 'kit-404b',
      name: 'X',
      productId: outAId,
      lines: [{ productId: MISSING_ID, quantity: 1 }],
    });
    expect(unknownComponent.status).toBe(404);

    const selfRef = await postA('/api/v1/manufacturing/boms', {
      code: 'kit-auto',
      name: 'Auto',
      productId: outAId,
      lines: [{ productId: outAId, quantity: 1 }],
    });
    expect(selfRef.status).toBe(400);
    expect(JSON.stringify(selfRef.body)).toContain('Output product cannot be a component');

    const duplicated = await postA('/api/v1/manufacturing/boms', {
      code: 'kit-dup',
      name: 'Dup',
      productId: outAId,
      lines: [
        { productId: compAId, quantity: 1 },
        { productId: compAId, quantity: 2 },
      ],
    });
    expect(duplicated.status).toBe(400);
    expect(JSON.stringify(duplicated.body)).toContain('Duplicate component product');

    // Producto archivado como salida → 409 (no se arma un kit sobre él).
    const archived = await patchA(`/api/v1/inventory/products/${tempAId}`, { archived: true });
    expect(archived.status).toBe(200);
    const onArchived = await postA('/api/v1/manufacturing/boms', {
      code: 'kit-arch',
      name: 'X',
      productId: tempAId,
      lines: [{ productId: compAId, quantity: 1 }],
    });
    expect(onArchived.status).toBe(409);
    expect(JSON.stringify(onArchived.body)).toContain('Product is archived');

    const invalidCode = await postA('/api/v1/manufacturing/boms', {
      code: 'x',
      name: 'X',
      productId: outAId,
      lines: [{ productId: compAId, quantity: 1 }],
    });
    expect(invalidCode.status).toBe(400);
    expect(JSON.stringify(invalidCode.body)).toContain('Invalid code');
  });

  it('BOM: PATCH de nombre/líneas, code inmutable, archivar/restaurar y sin DELETE', async () => {
    const renamed = await patchA(`/api/v1/manufacturing/boms/${bomAId}`, { name: 'Kit caja v2' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe('Kit caja v2');

    const patchCode = await patchA(`/api/v1/manufacturing/boms/${bomAId}`, { code: 'OTRO' });
    expect(patchCode.status).toBe(400); // clave natural inmutable (no está en el PATCH)

    const relined = await patchA(`/api/v1/manufacturing/boms/${bomAId}`, {
      lines: [{ productId: compAId, quantity: 0.25 }],
    });
    expect(relined.status).toBe(200);
    expect(relined.body.data.lines).toEqual([{ productId: compAId, quantity: 0.25 }]);

    const selfRefPatch = await patchA(`/api/v1/manufacturing/boms/${bomAId}`, {
      lines: [{ productId: outAId, quantity: 1 }],
    });
    expect(selfRefPatch.status).toBe(400);
    expect(JSON.stringify(selfRefPatch.body)).toContain('Output product cannot be a component');

    // El catálogo no define `bom:delete` → la ruta DELETE NO existe.
    const deleted = await request(app)
      .delete(`/api/v1/manufacturing/boms/${bomAId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(deleted.status).toBe(404);

    const archived = await patchA(`/api/v1/manufacturing/boms/${bomAId}`, { archived: true });
    expect(archived.status).toBe(200);
    expect(archived.body.data.archived).toBe(true);
    const again = await patchA(`/api/v1/manufacturing/boms/${bomAId}`, { archived: true });
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain('BOM is already archived');
    const restored = await patchA(`/api/v1/manufacturing/boms/${bomAId}`, { archived: false });
    expect(restored.status).toBe(200);
    expect(restored.body.data.archived).toBe(false);
  });

  it('orden: alta desde BOM (snapshot POR UNIDAD, MO secuencial) y validaciones XOR/FK', async () => {
    const created = await postA('/api/v1/manufacturing/orders', {
      productId: outAId,
      quantity: 3,
      warehouseId: warehouseAId,
      bomId: bomAId,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const order = created.body.data;
    expect(order.number).toBe(`MO-${YEAR}-000001`);
    expect(order.status).toBe('draft');
    expect(order.bomId).toBe(bomAId);
    // Líneas POR UNIDAD (sin escalar por quantity=3): es el plan de la BOM.
    expect(order.lines).toEqual([{ productId: compAId, quantity: 0.25 }]);
    expect(order.notes).toBeNull();
    expect(order.archived).toBe(false);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    order1Id = order.id as string;
    order1Number = order.number as string;

    const both = await postA('/api/v1/manufacturing/orders', {
      productId: outAId,
      quantity: 1,
      warehouseId: warehouseAId,
      bomId: bomAId,
      lines: [{ productId: compAId, quantity: 1 }],
    });
    expect(both.status).toBe(400);
    expect(JSON.stringify(both.body)).toContain('Provide either bomId or lines, not both');

    const neither = await postA('/api/v1/manufacturing/orders', {
      productId: outAId,
      quantity: 1,
      warehouseId: warehouseAId,
    });
    expect(neither.status).toBe(400);
    expect(JSON.stringify(neither.body)).toContain('Either bomId or lines is required');

    const unknownBom = await postA('/api/v1/manufacturing/orders', {
      productId: outAId,
      quantity: 1,
      warehouseId: warehouseAId,
      bomId: MISSING_ID,
    });
    expect(unknownBom.status).toBe(404);

    const foreignBom = await postA('/api/v1/manufacturing/orders', {
      productId: outB1Id,
      quantity: 1,
      warehouseId: warehouseBId,
      bomId: bomAId, // BOM del tenant A → 404 uniforme
    });
    expect(foreignBom.status).toBe(404);

    // BOM con OTRA salida → 409 con la espera declarada.
    const otherBom = await postA('/api/v1/manufacturing/boms', {
      code: 'kit-x',
      name: 'Kit X',
      productId: compBId,
      lines: [{ productId: compAId, quantity: 1 }],
    });
    expect(otherBom.status).toBe(201);
    bomA2Id = otherBom.body.data.id as string;
    const mismatch = await postA('/api/v1/manufacturing/orders', {
      productId: outAId,
      quantity: 1,
      warehouseId: warehouseAId,
      bomId: bomA2Id,
    });
    expect(mismatch.status).toBe(409);
    expect(JSON.stringify(mismatch.body)).toContain('BOM does not match the output product');

    const unknownProduct = await postA('/api/v1/manufacturing/orders', {
      productId: MISSING_ID,
      quantity: 1,
      warehouseId: warehouseAId,
      lines: [{ productId: compAId, quantity: 1 }],
    });
    expect(unknownProduct.status).toBe(404);

    const unknownWarehouse = await postA('/api/v1/manufacturing/orders', {
      productId: outAId,
      quantity: 1,
      warehouseId: MISSING_ID,
      lines: [{ productId: compAId, quantity: 1 }],
    });
    expect(unknownWarehouse.status).toBe(404);

    const injected = await postA('/api/v1/manufacturing/orders', {
      productId: outAId,
      quantity: 1,
      warehouseId: warehouseAId,
      lines: [{ productId: compAId, quantity: 1 }],
      tenantId: 'evil',
    });
    expect(injected.status).toBe(400); // esquema estricto: tenantId solo del JWT

    const explicit = await postA('/api/v1/manufacturing/orders', {
      productId: outAId,
      quantity: 2,
      warehouseId: warehouseAId,
      lines: [{ productId: compAId, quantity: 1 }],
    });
    expect(explicit.status, JSON.stringify(explicit.body)).toBe(201);
    expect(explicit.body.data.number).toBe(`MO-${YEAR}-000002`); // secuencial sin huecos
    expect(explicit.body.data.bomId).toBeNull();
    order2Id = explicit.body.data.id as string;

    const unknownComponent = await postA('/api/v1/manufacturing/orders', {
      productId: outAId,
      quantity: 1,
      warehouseId: warehouseAId,
      lines: [{ productId: MISSING_ID, quantity: 1 }],
    });
    expect(unknownComponent.status).toBe(404);

    // BOM archivada no admite nuevas órdenes (409), pero sigue siendo legible.
    const archBom = await patchA(`/api/v1/manufacturing/boms/${bomA2Id}`, { archived: true });
    expect(archBom.status).toBe(200);
    const fromArchivedBom = await postA('/api/v1/manufacturing/orders', {
      productId: compBId,
      quantity: 1,
      warehouseId: warehouseAId,
      bomId: bomA2Id,
    });
    expect(fromArchivedBom.status).toBe(409);
    expect(JSON.stringify(fromArchivedBom.body)).toContain('BOM is archived');
  });

  it('orden: máquina de estados (edición solo en draft, saltos y repetidos → 409)', async () => {
    const editedQuantity = await patchA(`/api/v1/manufacturing/orders/${order1Id}`, {
      quantity: 5,
    });
    expect(editedQuantity.status).toBe(200);
    expect(editedQuantity.body.data.quantity).toBe(5);

    const editedNotes = await patchA(`/api/v1/manufacturing/orders/${order1Id}`, {
      notes: 'Lote 1',
    });
    expect(editedNotes.status).toBe(200);
    expect(editedNotes.body.data.notes).toBe('Lote 1');

    const skip = await patchA(`/api/v1/manufacturing/orders/${order2Id}`, {
      status: 'completed',
    });
    expect(skip.status).toBe(409); // draft → completed no existe
    expect(JSON.stringify(skip.body)).toContain('Invalid status transition');

    const started = await patchA(`/api/v1/manufacturing/orders/${order1Id}`, {
      status: 'in_progress',
    });
    expect(started.status).toBe(200);
    expect(started.body.data.status).toBe('in_progress');

    const businessEdit = await patchA(`/api/v1/manufacturing/orders/${order1Id}`, {
      notes: 'cambio tardío',
    });
    expect(businessEdit.status).toBe(409); // fuera de draft
    expect(JSON.stringify(businessEdit.body)).toContain('Only draft documents can be edited');

    const repeated = await patchA(`/api/v1/manufacturing/orders/${order1Id}`, {
      status: 'in_progress',
    });
    expect(repeated.status).toBe(409);
    expect(JSON.stringify(repeated.body)).toContain('Status is already the requested one');

    const bogusStatus = await patchA(`/api/v1/manufacturing/orders/${order1Id}`, {
      status: 'bogus',
    });
    expect(bogusStatus.status).toBe(400); // enum de estados

    const cancelled = await patchA(`/api/v1/manufacturing/orders/${order2Id}`, {
      status: 'cancelled',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('cancelled');

    const uncancel = await patchA(`/api/v1/manufacturing/orders/${order2Id}`, {
      status: 'draft',
    });
    expect(uncancel.status).toBe(409); // cancelado es terminal
    expect(JSON.stringify(uncancel.body)).toContain('Invalid status transition');
  });

  it('orden completada: pre-chequeo → estado → movimientos production_out/in en el ledger', async () => {
    const completed = await patchA(`/api/v1/manufacturing/orders/${order1Id}`, {
      status: 'completed',
    });
    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
    expect(completed.body.data.status).toBe('completed');

    // 0.25/unidad × 5 unidades = 1.25 consumidos; +5 del producto terminado.
    expect(await stockQty(tokenA, compAId, warehouseAId)).toBe(8.75); // 10 − 1.25
    expect(await stockQty(tokenA, outAId, warehouseAId)).toBe(5);

    const outs = await getA('/api/v1/inventory/movements?type=production_out');
    expect(outs.status).toBe(200);
    expect(outs.body.meta.total).toBe(1);
    const outMovement = (
      outs.body.data as Array<{
        productId: string;
        qty: number;
        balanceAfter: number;
        sourceType: string;
        sourceId: string;
        reason: string;
      }>
    )[0];
    expect(outMovement?.productId).toBe(compAId);
    expect(outMovement?.qty).toBe(-1.25);
    expect(outMovement?.balanceAfter).toBe(8.75);
    expect(outMovement?.sourceType).toBe('production.order');
    expect(outMovement?.sourceId).toBe(order1Id);
    expect(outMovement?.reason).toBe(`Production order ${order1Number}`);

    const ins = await getA('/api/v1/inventory/movements?type=production_in');
    expect(ins.status).toBe(200);
    expect(ins.body.meta.total).toBe(1);
    const inMovement = (
      ins.body.data as Array<{
        productId: string;
        qty: number;
        balanceAfter: number;
        sourceType: string;
        sourceId: string;
      }>
    )[0];
    expect(inMovement?.productId).toBe(outAId);
    expect(inMovement?.qty).toBe(5);
    expect(inMovement?.balanceAfter).toBe(5);
    expect(inMovement?.sourceType).toBe('production.order');
    expect(inMovement?.sourceId).toBe(order1Id);

    // Guardia de at-most-once: el estado terminal rechaza re-disparar.
    const again = await patchA(`/api/v1/manufacturing/orders/${order1Id}`, {
      status: 'completed',
    });
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain('Status is already the requested one');
    const outsAfter = await getA('/api/v1/inventory/movements?type=production_out');
    expect(outsAfter.body.meta.total).toBe(1); // sin movimientos duplicados
  });

  it('orden con saldo insuficiente → 422 sin estado ni movimientos nuevos', async () => {
    const created = await postA('/api/v1/manufacturing/orders', {
      productId: outAId,
      quantity: 1,
      warehouseId: warehouseAId,
      lines: [{ productId: compAId, quantity: 100 }],
    });
    expect(created.status).toBe(201);
    order3Id = created.body.data.id as string;
    expect(created.body.data.number).toBe(`MO-${YEAR}-000003`);

    const started = await patchA(`/api/v1/manufacturing/orders/${order3Id}`, {
      status: 'in_progress',
    });
    expect(started.status).toBe(200);

    const completed = await patchA(`/api/v1/manufacturing/orders/${order3Id}`, {
      status: 'completed',
    });
    expect(completed.status).toBe(422);
    expect(completed.body.error.code).toBe('DOMAIN_ERROR');
    expect(completed.body.error.message).toBe('Insufficient stock');
    expect(completed.body.error.details).toEqual({
      productId: compAId,
      warehouseId: warehouseAId,
      available: 8.75,
      required: 100,
    });

    // Ni estado ni movimientos: el pre-chequeo va ANTES de escribir.
    const fetched = await getA(`/api/v1/manufacturing/orders/${order3Id}`);
    expect(fetched.body.data.status).toBe('in_progress');
    expect(await stockQty(tokenA, compAId, warehouseAId)).toBe(8.75); // intacto
    const outs = await getA('/api/v1/inventory/movements?type=production_out');
    expect(outs.body.meta.total).toBe(1); // sigue solo el de la orden 1
  });

  it('cancelar no mueve stock; completar escala con la cantidad final del draft', async () => {
    const created = await postA('/api/v1/manufacturing/orders', {
      productId: outAId,
      quantity: 1,
      warehouseId: warehouseAId,
      lines: [{ productId: compAId, quantity: 0.25 }],
    });
    expect(created.status).toBe(201);
    order4Id = created.body.data.id as string;
    expect(created.body.data.number).toBe(`MO-${YEAR}-000004`);

    const started = await patchA(`/api/v1/manufacturing/orders/${order4Id}`, {
      status: 'in_progress',
    });
    expect(started.status).toBe(200);
    const cancelled = await patchA(`/api/v1/manufacturing/orders/${order4Id}`, {
      status: 'cancelled',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('cancelled');
    expect(await stockQty(tokenA, compAId, warehouseAId)).toBe(8.75); // sin consumo
    const outsCancelled = await getA('/api/v1/inventory/movements?type=production_out');
    expect(outsCancelled.body.meta.total).toBe(1); // sin movimientos nuevos

    // Orden 5: cantidades 0.1/unidad, quantity 1 → 4 en draft → completar.
    const created5 = await postA('/api/v1/manufacturing/orders', {
      productId: outAId,
      quantity: 1,
      warehouseId: warehouseAId,
      lines: [{ productId: compAId, quantity: 0.1 }],
    });
    expect(created5.status).toBe(201);
    order5Id = created5.body.data.id as string;
    expect(created5.body.data.number).toBe(`MO-${YEAR}-000005`);

    const scaled = await patchA(`/api/v1/manufacturing/orders/${order5Id}`, { quantity: 4 });
    expect(scaled.status).toBe(200);
    const started5 = await patchA(`/api/v1/manufacturing/orders/${order5Id}`, {
      status: 'in_progress',
    });
    expect(started5.status).toBe(200);
    const completed5 = await patchA(`/api/v1/manufacturing/orders/${order5Id}`, {
      status: 'completed',
    });
    expect(completed5.status).toBe(200);

    // 0.1 × 4 = 0.4 exacto (redondeo a 6 decimales, sin polvo flotante).
    expect(await stockQty(tokenA, compAId, warehouseAId)).toBe(8.35); // 8.75 − 0.4
    expect(await stockQty(tokenA, outAId, warehouseAId)).toBe(9); // 5 + 4

    const outs = await getA('/api/v1/inventory/movements?type=production_out');
    expect(outs.body.meta.total).toBe(2);
    const latestOut = (
      outs.body.data as Array<{ qty: number; sourceId: string; reason: string }>
    )[0];
    expect(latestOut?.qty).toBe(-0.4);
    expect(latestOut?.sourceId).toBe(order5Id);
    expect(latestOut?.reason).toBe(`Production order ${created5.body.data.number}`);
    const ins = await getA('/api/v1/inventory/movements?type=production_in');
    expect(ins.body.meta.total).toBe(2);
  });

  it('filtros de cola ?status/?archived y rutas DELETE inexistentes (404)', async () => {
    const cancelled = await getA('/api/v1/manufacturing/orders?status=cancelled');
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.meta.total).toBe(2); // órdenes 2 y 4

    const completed = await getA('/api/v1/manufacturing/orders?status=completed');
    expect(completed.status).toBe(200);
    expect(completed.body.meta.total).toBe(2); // órdenes 1 y 5

    const archived = await patchA(`/api/v1/manufacturing/orders/${order2Id}`, {
      archived: true,
    });
    expect(archived.status).toBe(200);
    const archivedList = await getA('/api/v1/manufacturing/orders?archived=true');
    expect(archivedList.body.meta.total).toBe(1);
    const again = await patchA(`/api/v1/manufacturing/orders/${order2Id}`, { archived: true });
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain('Production order is already archived');

    const bomsArchived = await getA('/api/v1/manufacturing/boms?archived=true');
    expect(bomsArchived.status).toBe(200);
    expect(bomsArchived.body.meta.total).toBe(1); // kit-x (archivada en el alta de órdenes)

    // Sin `:delete` en NINGUNO de los dos catálogos → ruta DELETE inexistente.
    const deleteOrder = await request(app)
      .delete(`/api/v1/manufacturing/orders/${order1Id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(deleteOrder.status).toBe(404);
    const deleteBom = await request(app)
      .delete(`/api/v1/manufacturing/boms/${bomAId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(deleteBom.status).toBe(404);
  });

  it('aislamiento: B no ve ni edita documentos de A y su ledger queda en cero', async () => {
    const orderFromB = await getB(`/api/v1/manufacturing/orders/${order1Id}`);
    expect(orderFromB.status).toBe(404); // inexistente y ajeno → 404 uniforme
    const bomFromB = await getB(`/api/v1/manufacturing/boms/${bomAId}`);
    expect(bomFromB.status).toBe(404);

    const ordersB = await getB('/api/v1/manufacturing/orders');
    expect(ordersB.status).toBe(200);
    expect(ordersB.body.meta.total).toBe(0); // B nunca creó órdenes

    const bomsB = await getB('/api/v1/manufacturing/boms');
    expect(bomsB.body.meta.total).toBe(1); // solo la suya
    const ownBom = await getB(`/api/v1/manufacturing/boms/${bomBId}`);
    expect(ownBom.status).toBe(200); // su BOM propia sigue legible
    expect(ownBom.body.data.id).toBe(bomBId);

    const patchFromB = await request(app)
      .patch(`/api/v1/manufacturing/orders/${order1Id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ notes: 'hack' });
    expect(patchFromB.status).toBe(404);

    const foreignBomCreate = await postB('/api/v1/manufacturing/orders', {
      productId: outB1Id,
      quantity: 1,
      warehouseId: warehouseBId,
      bomId: bomAId, // BOM de A → 404 (nunca resuelve entre tenants)
    });
    expect(foreignBomCreate.status).toBe(404);

    const movementsB = await getB('/api/v1/inventory/movements');
    expect(movementsB.status).toBe(200);
    expect(movementsB.body.meta.total).toBe(0); // B no movió stock propio
    expect(await stockQty(tokenB, compB1Id, warehouseBId)).toBe(0);
    expect(await stockQty(tokenB, outB1Id, warehouseBId)).toBe(0);
  });

  it('auditoría: altas y transiciones de estado con reason por tenant', async () => {
    const bomAudit = await getA('/api/v1/audit?action=bom.create&limit=50');
    expect(bomAudit.status).toBe(200);
    expect(
      (bomAudit.body.data as Array<{ entityId: string }>).some((e) => e.entityId === bomAId),
    ).toBe(true);

    const orderCreates = await getA('/api/v1/audit?action=production.order.create&limit=50');
    expect(orderCreates.status).toBe(200);
    expect(orderCreates.body.meta.total).toBe(5); // solo intentos exitosos

    const updates = await getA(
      `/api/v1/audit?action=production.order.update&entityId=${order1Id}&limit=50`,
    );
    expect(updates.status).toBe(200);
    expect(
      (
        updates.body.data as Array<{
          metadata?: { reason?: string };
        }>
      ).some((e) => e.metadata?.reason === 'status:completed'),
    ).toBe(true);

    // El mismo filtro en el tenant B no devuelve nada de A.
    const updatesFromB = await getB(
      `/api/v1/audit?action=production.order.update&entityId=${order1Id}&limit=50`,
    );
    expect(updatesFromB.status).toBe(200);
    expect(updatesFromB.body.meta.total).toBe(0);
  });
});
