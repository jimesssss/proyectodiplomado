/**
 * Integración Inventory — FASE 11 (+ composición con Purchasing).
 * Contra MongoDB real (memory server): maestro de productos (código único por
 * tenant e inmutable), ledger append-only de movimientos con saldos que nunca
 * quedan negativos (422 DOMAIN_ERROR), transferencias TR-* con pre-chequeo de
 * saldo, conteos CT-* aprobados con permiso propio, posting de recepciones
 * `posted` → stock, FKs inexistentes/ajenas → 404 uniforme y aislamiento
 * cruzado.
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
    { path: '/api/v1/audit', router: createAuditRouter(deps) },
    ...ORG_KINDS_BY_PATH.map((kind) => ({
      path: `/api/v1/${ORG_ROUTE_PATHS[kind]}`,
      router: createOrgRouter(deps, kind),
    })),
    ...createInventoryRouters(deps),
    ...createPurchasingRouters(deps),
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

describe('inventory: productos, ledger, transferencias, conteos y posting', () => {
  let tokenA = '';
  let tokenB = '';
  let warehouseAId = '';
  let warehouseBId = '';
  let productId = ''; // TORNILLO-M6 (productA de A)
  let archivedProductId = ''; // SCRAP-01 (archivado)
  let tenantBProductId = '';
  let firstMovementId = '';
  let transferId1 = '';
  let countId1 = '';
  let receiptId = '';

  const postA = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const patchA = (path: string, body: object) =>
    request(app).patch(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const getA = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenA}`);

  /** Crea organization→company→branch→warehouse y devuelve el almacén. */
  async function createWarehouseChain(token: string, suffix: string): Promise<string> {
    const post = (path: string, body: object) =>
      request(app).post(path).set('Authorization', `Bearer ${token}`).send(body);
    const org = await post('/api/v1/organizations', {
      code: `ORG-${suffix}`,
      name: `Org ${suffix}`,
    });
    expect(org.status).toBe(201);
    const comp = await post('/api/v1/companies', {
      code: `COMP-${suffix}`,
      name: `Comp ${suffix}`,
      parentId: org.body.data.id as string,
    });
    expect(comp.status).toBe(201);
    const branch = await post('/api/v1/branches', {
      code: `BR-${suffix}`,
      name: `Branch ${suffix}`,
      parentId: comp.body.data.id as string,
    });
    expect(branch.status).toBe(201);
    const warehouse = await post('/api/v1/warehouses', {
      code: `WH-${suffix}`,
      name: `Warehouse ${suffix}`,
      parentId: branch.body.data.id as string,
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
    await connectDatabase(mongod.getUri('erp_inventory'), logger);
    const a = await provision('inv-tenant-a', 'owner-a@inv.example');
    const b = await provision('inv-tenant-b', 'owner-b@inv.example');
    tokenA = a.token;
    tokenB = b.token;
    warehouseAId = await createWarehouseChain(tokenA, 'A');
    warehouseBId = await createWarehouseChain(tokenA, 'B');
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('producto: código normalizado/único por tenant, inmutable, dinero redondeado y archivado', async () => {
    const created = await postA('/api/v1/inventory/products', {
      code: ' tornillo m6 ',
      name: 'Tornillo M6',
      cost: 10.556,
      price: 20,
      minStock: 5,
    });
    expect(created.status).toBe(201);
    const product = created.body.data;
    expect(product.code).toBe('TORNILLO-M6'); // mayúsculas y espacios → guiones
    expect(product.unit).toBe('unit'); // default
    expect(product.cost).toBe(10.56); // redondeo comercial a 2 decimales
    expect(product.minStock).toBe(5);
    expect(product.archived).toBe(false);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    productId = product.id as string;

    const duplicate = await postA('/api/v1/inventory/products', {
      code: 'tornillo m6',
      name: 'Otro',
    });
    expect(duplicate.status).toBe(409); // mismo tenant, mismo código normalizado

    const foreignTenant = await request(app)
      .post('/api/v1/inventory/products')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ code: 'tornillo m6', name: 'Tornillo B' });
    expect(foreignTenant.status).toBe(201); // unicidad POR tenant (ADR-002)
    tenantBProductId = foreignTenant.body.data.id as string;

    const patchCode = await patchA(`/api/v1/inventory/products/${productId}`, { code: 'OTRO' });
    expect(patchCode.status).toBe(400); // código inmutable (no existe en PATCH)

    const updated = await patchA(`/api/v1/inventory/products/${productId}`, { cost: 11.116 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.cost).toBe(11.12);

    const invalidCode = await postA('/api/v1/inventory/products', { code: 'x', name: 'X' });
    expect(invalidCode.status).toBe(400);

    // Archivar = soft-delete (product:delete); doble archive → 409.
    const toArchive = await postA('/api/v1/inventory/products', {
      code: 'scrap-01',
      name: 'Chatarra',
    });
    expect(toArchive.status).toBe(201);
    archivedProductId = toArchive.body.data.id as string;
    const archived = await request(app)
      .delete(`/api/v1/inventory/products/${archivedProductId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(archived.status).toBe(200);
    expect(archived.body.data.archived).toBe(true);
    const twice = await request(app)
      .delete(`/api/v1/inventory/products/${archivedProductId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(twice.status).toBe(409);

    const archivedList = await getA('/api/v1/inventory/products?archived=true');
    expect(archivedList.status).toBe(200);
    expect(
      (archivedList.body.data as Array<{ id: string }>).some((p) => p.id === archivedProductId),
    ).toBe(true);
    const activeList = await getA('/api/v1/inventory/products?archived=false');
    expect(
      (activeList.body.data as Array<{ id: string }>).some((p) => p.id === archivedProductId),
    ).toBe(false);
  });

  it('movimientos: ledger append-only con saldo nunca negativo (422 en salida insuficiente)', async () => {
    const in10 = await postA('/api/v1/inventory/movements', {
      productId,
      warehouseId: warehouseAId,
      type: 'manual_in',
      quantity: 10,
      reason: 'Entrada inicial',
    });
    expect(in10.status).toBe(201);
    expect(in10.body.data.qty).toBe(10); // con signo: + entrada
    expect(in10.body.data.balanceAfter).toBe(10);
    expect(in10.body.data.sourceType).toBeNull(); // manual: sin documento origen
    firstMovementId = in10.body.data.id as string;
    expect(await stockQty(tokenA, productId, warehouseAId)).toBe(10);

    const fetched = await getA(`/api/v1/inventory/movements/${firstMovementId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.balanceAfter).toBe(10);

    const out10 = await postA('/api/v1/inventory/movements', {
      productId,
      warehouseId: warehouseAId,
      type: 'manual_out',
      quantity: 10,
      reason: 'Merma',
    });
    expect(out10.status).toBe(201);
    expect(out10.body.data.qty).toBe(-10); // con signo: − salida
    expect(out10.body.data.balanceAfter).toBe(0);
    expect(await stockQty(tokenA, productId, warehouseAId)).toBe(0);

    // Salida insuficiente → 422 DOMAIN_ERROR y el saldo NO cambia.
    const negative = await postA('/api/v1/inventory/movements', {
      productId,
      warehouseId: warehouseAId,
      type: 'manual_out',
      quantity: 1,
      reason: 'Intento de robo',
    });
    expect(negative.status).toBe(422);
    expect(negative.body.error.code).toBe('DOMAIN_ERROR');
    expect(negative.body.error.details.available).toBe(0);
    expect(negative.body.error.details.required).toBe(1);
    expect(await stockQty(tokenA, productId, warehouseAId)).toBe(0);

    // Repone 8 unidades para las transferencias siguientes.
    const in8 = await postA('/api/v1/inventory/movements', {
      productId,
      warehouseId: warehouseAId,
      type: 'manual_in',
      quantity: 8,
      reason: 'Reposición',
    });
    expect(in8.status).toBe(201);
    expect(in8.body.data.balanceAfter).toBe(8);
    expect(await stockQty(tokenA, productId, warehouseAId)).toBe(8);

    // Solo el ledger manda: no hay PATCH/DELETE de movimientos.
    const patch = await patchA(`/api/v1/inventory/movements/${firstMovementId}`, { qty: 999 });
    expect(patch.status).toBe(404); // ruta no publicada (append-only)
    const remove = await request(app)
      .delete(`/api/v1/inventory/movements/${firstMovementId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(remove.status).toBe(404);

    // Tipos del sistema NO se crean por API (solo los manuales).
    const systemType = await postA('/api/v1/inventory/movements', {
      productId,
      warehouseId: warehouseAId,
      type: 'receipt',
      quantity: 5,
      reason: 'Fake receipt',
    });
    expect(systemType.status).toBe(400);

    const zeroQty = await postA('/api/v1/inventory/movements', {
      productId,
      warehouseId: warehouseAId,
      type: 'manual_in',
      quantity: 0,
      reason: 'Cero',
    });
    expect(zeroQty.status).toBe(400);

    const noReason = await postA('/api/v1/inventory/movements', {
      productId,
      warehouseId: warehouseAId,
      type: 'manual_in',
      quantity: 1,
    });
    expect(noReason.status).toBe(400);

    // FKs: producto inexistente → 404; producto archivado → 409; almacén ajeno → 404.
    const unknownProduct = await postA('/api/v1/inventory/movements', {
      productId: MISSING_ID,
      warehouseId: warehouseAId,
      type: 'manual_in',
      quantity: 1,
      reason: 'X',
    });
    expect(unknownProduct.status).toBe(404);

    const archivedProduct = await postA('/api/v1/inventory/movements', {
      productId: archivedProductId,
      warehouseId: warehouseAId,
      type: 'manual_in',
      quantity: 1,
      reason: 'X',
    });
    expect(archivedProduct.status).toBe(409);

    const foreignWarehouse = await postA('/api/v1/inventory/movements', {
      productId,
      warehouseId: MISSING_ID,
      type: 'manual_in',
      quantity: 1,
      reason: 'X',
    });
    expect(foreignWarehouse.status).toBe(404);

    // Filtros del ledger.
    const ins = await getA('/api/v1/inventory/movements?type=manual_in');
    expect(ins.status).toBe(200);
    expect(ins.body.meta.total).toBe(2); // entrada inicial + reposición
    const byProduct = await getA(`/api/v1/inventory/movements?productId=${productId}`);
    expect(byProduct.status).toBe(200);
    expect(byProduct.body.meta.total).toBe(3);
    const missing = await getA(`/api/v1/inventory/movements/${MISSING_ID}`);
    expect(missing.status).toBe(404);
  });

  it('transferencia: TR-*, draft→in_transit→completed, stock movido y pre-chequeo 422', async () => {
    const sameWarehouse = await postA('/api/v1/inventory/transfers', {
      fromWarehouseId: warehouseAId,
      toWarehouseId: warehouseAId,
      lines: [{ productId, quantity: 1 }],
    });
    expect(sameWarehouse.status).toBe(400); // origen ≠ destino

    const unknownWarehouse = await postA('/api/v1/inventory/transfers', {
      fromWarehouseId: MISSING_ID,
      toWarehouseId: warehouseBId,
      lines: [{ productId, quantity: 1 }],
    });
    expect(unknownWarehouse.status).toBe(404);

    const created = await postA('/api/v1/inventory/transfers', {
      fromWarehouseId: warehouseAId,
      toWarehouseId: warehouseBId,
      lines: [{ productId, quantity: 4 }],
      notes: 'Reposición de sucursal',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.number).toBe(`TR-${YEAR}-000001`);
    expect(created.body.data.status).toBe('draft');
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    transferId1 = created.body.data.id as string;

    const inTransit = await patchA(`/api/v1/inventory/transfers/${transferId1}`, {
      status: 'in_transit',
    });
    expect(inTransit.status).toBe(200);

    const editAfterDeparture = await patchA(`/api/v1/inventory/transfers/${transferId1}`, {
      notes: 'intentando editar',
    });
    expect(editAfterDeparture.status).toBe(409); // solo borradores editables

    const completed = await patchA(`/api/v1/inventory/transfers/${transferId1}`, {
      status: 'completed',
    });
    expect(completed.status).toBe(200);
    expect(completed.body.data.status).toBe('completed');
    expect(await stockQty(tokenA, productId, warehouseAId)).toBe(4); // 8 − 4
    expect(await stockQty(tokenA, productId, warehouseBId)).toBe(4);

    const outMovements = await getA('/api/v1/inventory/movements?type=transfer_out');
    expect(outMovements.body.meta.total).toBe(1);
    expect((outMovements.body.data as Array<{ balanceAfter: number }>)[0]?.balanceAfter).toBe(4);
    const inMovements = await getA('/api/v1/inventory/movements?type=transfer_in');
    expect(inMovements.body.meta.total).toBe(1);
    expect((inMovements.body.data as Array<{ balanceAfter: number }>)[0]?.balanceAfter).toBe(4);

    // Pre-chequeo: saldo insuficiente → 422 SIN escribir estado ni movimientos.
    const tooMuch = await postA('/api/v1/inventory/transfers', {
      fromWarehouseId: warehouseAId,
      toWarehouseId: warehouseBId,
      lines: [{ productId, quantity: 100 }],
    });
    expect(tooMuch.status).toBe(201);
    const transferId2 = tooMuch.body.data.id as string;
    const depart2 = await patchA(`/api/v1/inventory/transfers/${transferId2}`, {
      status: 'in_transit',
    });
    expect(depart2.status).toBe(200);
    const failComplete = await patchA(`/api/v1/inventory/transfers/${transferId2}`, {
      status: 'completed',
    });
    expect(failComplete.status).toBe(422);
    expect(failComplete.body.error.code).toBe('DOMAIN_ERROR');
    const stillInTransit = await getA(`/api/v1/inventory/transfers/${transferId2}`);
    expect(stillInTransit.body.data.status).toBe('in_transit'); // nada se movió
    expect(await stockQty(tokenA, productId, warehouseAId)).toBe(4); // intacto

    const cancel2 = await patchA(`/api/v1/inventory/transfers/${transferId2}`, {
      status: 'cancelled',
    });
    expect(cancel2.status).toBe(200);

    const created3 = await postA('/api/v1/inventory/transfers', {
      fromWarehouseId: warehouseAId,
      toWarehouseId: warehouseBId,
      lines: [{ productId, quantity: 1 }],
    });
    const transferId3 = created3.body.data.id as string;
    const cancel3 = await patchA(`/api/v1/inventory/transfers/${transferId3}`, {
      status: 'cancelled',
    });
    expect(cancel3.status).toBe(200);
    const fromCancelled = await patchA(`/api/v1/inventory/transfers/${transferId3}`, {
      status: 'in_transit',
    });
    expect(fromCancelled.status).toBe(409); // cancelled es terminal

    const created4 = await postA('/api/v1/inventory/transfers', {
      fromWarehouseId: warehouseAId,
      toWarehouseId: warehouseBId,
      lines: [{ productId, quantity: 1 }],
    });
    const transferId4 = created4.body.data.id as string;
    const jump = await patchA(`/api/v1/inventory/transfers/${transferId4}`, {
      status: 'completed',
    });
    expect(jump.status).toBe(409); // draft → completed no existe
    const same = await patchA(`/api/v1/inventory/transfers/${transferId4}`, { status: 'draft' });
    expect(same.status).toBe(409); // mismo estado

    // Sin `stock.transfer:delete` en el catálogo: NO se publica DELETE.
    const del = await request(app)
      .delete(`/api/v1/inventory/transfers/${transferId4}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(404);

    const archived = await patchA(`/api/v1/inventory/transfers/${transferId1}`, {
      archived: true,
    });
    expect(archived.status).toBe(200); // archivar vía PATCH {archived} (update)
    const archivedTwice = await patchA(`/api/v1/inventory/transfers/${transferId1}`, {
      archived: true,
    });
    expect(archivedTwice.status).toBe(409);
  });

  it('conteo: CT-*, aprobación con permiso propio ajusta el saldo y diff 0 no mueve nada', async () => {
    const invalidQty = await postA('/api/v1/inventory/counts', {
      warehouseId: warehouseAId,
      lines: [{ productId, countedQty: -1 }],
    });
    expect(invalidQty.status).toBe(400);

    const unknownProduct = await postA('/api/v1/inventory/counts', {
      warehouseId: warehouseAId,
      lines: [{ productId: MISSING_ID, countedQty: 1 }],
    });
    expect(unknownProduct.status).toBe(404);

    const created = await postA('/api/v1/inventory/counts', {
      warehouseId: warehouseAId,
      lines: [{ productId, countedQty: 2 }],
      notes: 'Ciclo de conteo A',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.number).toBe(`CT-${YEAR}-000001`);
    expect(created.body.data.status).toBe('draft');
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    countId1 = created.body.data.id as string;

    // La aprobación NO es un PATCH de estado (patrón de sales.quote:approve).
    const viaPatch = await patchA(`/api/v1/inventory/counts/${countId1}`, {
      status: 'approved',
    });
    expect(viaPatch.status).toBe(409);
    expect(viaPatch.body.error.message).toBe('Approval requires the approve endpoint');

    // Sistema = 4 (tras la transferencia); contado = 2 → ajuste −2.
    expect(await stockQty(tokenA, productId, warehouseAId)).toBe(4);
    const approved = await postA(`/api/v1/inventory/counts/${countId1}/approve`, {});
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('approved');
    expect(await stockQty(tokenA, productId, warehouseAId)).toBe(2);

    const adjustments = await getA('/api/v1/inventory/movements?type=count_adjustment');
    expect(adjustments.body.meta.total).toBe(1);
    const adjustment = (
      adjustments.body.data as Array<{
        qty: number;
        balanceAfter: number;
        reason: string;
        sourceType: string;
        sourceId: string;
      }>
    )[0];
    expect(adjustment?.qty).toBe(-2);
    expect(adjustment?.balanceAfter).toBe(2);
    expect(adjustment?.reason).toContain('system 4');
    expect(adjustment?.reason).toContain('counted 2');
    expect(adjustment?.sourceType).toBe('stock.count');
    expect(adjustment?.sourceId).toBe(countId1);

    const approveAgain = await postA(`/api/v1/inventory/counts/${countId1}/approve`, {});
    expect(approveAgain.status).toBe(409); // solo borradores

    const editAfterApproval = await patchA(`/api/v1/inventory/counts/${countId1}`, {
      warehouseId: warehouseBId,
    });
    expect(editAfterApproval.status).toBe(409); // campos de negocio tras aprobar

    // Diferencia 0 → el sistema congela sin crear movimiento.
    const before = await getA('/api/v1/inventory/movements?type=count_adjustment');
    const created2 = await postA('/api/v1/inventory/counts', {
      warehouseId: warehouseAId,
      lines: [{ productId, countedQty: 2 }],
    });
    const approved2 = await postA(
      `/api/v1/inventory/counts/${created2.body.data.id as string}/approve`,
      {},
    );
    expect(approved2.status).toBe(200);
    expect(await stockQty(tokenA, productId, warehouseAId)).toBe(2); // sin cambio
    const after = await getA('/api/v1/inventory/movements?type=count_adjustment');
    expect(after.body.meta.total).toBe(before.body.meta.total); // 0 diferencias → 0 movimientos

    // Cancelado no se aprueba; sin DELETE (catálogo sin stock.count:delete).
    const created3 = await postA('/api/v1/inventory/counts', {
      warehouseId: warehouseAId,
      lines: [{ productId, countedQty: 9 }],
    });
    const countId3 = created3.body.data.id as string;
    const cancelled = await patchA(`/api/v1/inventory/counts/${countId3}`, {
      status: 'cancelled',
    });
    expect(cancelled.status).toBe(200);
    const approveCancelled = await postA(`/api/v1/inventory/counts/${countId3}/approve`, {});
    expect(approveCancelled.status).toBe(409); // cancelled → approved no existe
    expect(await stockQty(tokenA, productId, warehouseAId)).toBe(2); // intacto

    const del = await request(app)
      .delete(`/api/v1/inventory/counts/${countId1}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(404);

    const empty = await patchA(`/api/v1/inventory/counts/${countId1}`, {});
    expect(empty.status).toBe(400);
  });

  it('recepción posted → stock: líneas con producto alimentan el ledger (FASE 10 → 11)', async () => {
    const product = await postA('/api/v1/inventory/products', {
      code: 'prod-p',
      name: 'Producto P',
    });
    expect(product.status).toBe(201);
    const productPId = product.body.data.id as string;

    const supplier = await postA('/api/v1/suppliers', { code: 'sup-p', name: 'Proveedor P' });
    expect(supplier.status).toBe(201);

    const order = await postA('/api/v1/purchasing/orders', {
      supplierId: supplier.body.data.id as string,
      lines: [{ description: 'Pedido P', quantity: 10, unitPrice: 5 }],
    });
    expect(order.status).toBe(201);
    const orderId = order.body.data.id as string;

    const jump = await postA('/api/v1/purchasing/receipts', {
      orderId,
      warehouseId: warehouseAId,
      lines: [{ description: 'P', quantity: 7, unitPrice: 5, productId: productPId }],
    });
    expect(jump.status).toBe(201); // nace en draft
    const draftReceiptId = jump.body.data.id as string;
    const jumpPosted = await patchA(`/api/v1/purchasing/receipts/${draftReceiptId}`, {
      status: 'posted',
    });
    expect(jumpPosted.status).toBe(409); // draft → posted no existe

    const created = await postA('/api/v1/purchasing/receipts', {
      orderId,
      warehouseId: warehouseAId,
      lines: [{ description: 'P', quantity: 7, unitPrice: 5, productId: productPId }],
    });
    expect(created.status).toBe(201);
    expect(created.body.data.warehouseId).toBe(warehouseAId);
    receiptId = created.body.data.id as string;

    const received = await patchA(`/api/v1/purchasing/receipts/${receiptId}`, {
      status: 'received',
    });
    expect(received.status).toBe(200);

    const beforePost = await stockQty(tokenA, productPId, warehouseAId);
    expect(beforePost).toBe(0); // el stock SOLO cambia al `posted`

    const posted = await patchA(`/api/v1/purchasing/receipts/${receiptId}`, { status: 'posted' });
    expect(posted.status).toBe(200);
    expect(await stockQty(tokenA, productPId, warehouseAId)).toBe(7);

    const receipts = await getA('/api/v1/inventory/movements?type=receipt');
    expect(receipts.body.meta.total).toBe(1);
    const movement = (
      receipts.body.data as Array<{
        qty: number;
        balanceAfter: number;
        sourceType: string;
        sourceId: string;
        reason: string;
      }>
    )[0];
    expect(movement?.qty).toBe(7);
    expect(movement?.balanceAfter).toBe(7);
    expect(movement?.sourceType).toBe('goods.receipt');
    expect(movement?.sourceId).toBe(receiptId);
    expect(movement?.reason).toContain(created.body.data.number as string);

    // `posted` es terminal: no se re-postea (guarda at-most-once).
    const rePost = await patchA(`/api/v1/purchasing/receipts/${receiptId}`, { status: 'posted' });
    expect(rePost.status).toBe(409);

    // Línea SIN producto: solo trazabilidad textual, no mueve stock.
    const plain = await postA('/api/v1/purchasing/receipts', {
      orderId,
      warehouseId: warehouseAId,
      lines: [{ description: 'Sin producto vinculado', quantity: 3, unitPrice: 2 }],
    });
    expect(plain.status).toBe(201);
    const plainId = plain.body.data.id as string;
    await patchA(`/api/v1/purchasing/receipts/${plainId}`, { status: 'received' });
    const plainPosted = await patchA(`/api/v1/purchasing/receipts/${plainId}`, {
      status: 'posted',
    });
    expect(plainPosted.status).toBe(200);
    expect(await stockQty(tokenA, productPId, warehouseAId)).toBe(7); // sin cambio
    const receiptsAfter = await getA('/api/v1/inventory/movements?type=receipt');
    expect(receiptsAfter.body.meta.total).toBe(1); // sigue habiendo 1

    // Línea con producto archivado → 409 en el alta de la recepción.
    const archivedLine = await postA('/api/v1/purchasing/receipts', {
      orderId,
      warehouseId: warehouseAId,
      lines: [{ description: 'X', quantity: 1, unitPrice: 1, productId: archivedProductId }],
    });
    expect(archivedLine.status).toBe(409);
  });

  it('aislamiento: B no ve ni toca productos, saldos, movimientos, transferencias ni conteos de A', async () => {
    const product = await request(app)
      .get(`/api/v1/inventory/products/${productId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(product.status).toBe(404);

    const movement = await request(app)
      .get(`/api/v1/inventory/movements/${firstMovementId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(movement.status).toBe(404);

    const transfer = await request(app)
      .get(`/api/v1/inventory/transfers/${transferId1}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(transfer.status).toBe(404);

    const count = await request(app)
      .get(`/api/v1/inventory/counts/${countId1}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(count.status).toBe(404);

    const approve = await request(app)
      .post(`/api/v1/inventory/counts/${countId1}/approve`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({});
    expect(approve.status).toBe(404); // el recurso no existe para B (no 403)

    const movementIntoA = await request(app)
      .post('/api/v1/inventory/movements')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        productId: tenantBProductId,
        warehouseId: warehouseAId, // almacén de A → 404
        type: 'manual_in',
        quantity: 5,
        reason: 'Hack',
      });
    expect(movementIntoA.status).toBe(404);

    const stockB = await request(app)
      .get('/api/v1/inventory/stock?limit=100')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(stockB.status).toBe(200);
    expect(stockB.body.meta.total).toBe(0); // B no tiene movimientos propios

    const movementsB = await request(app)
      .get('/api/v1/inventory/movements?limit=100')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(movementsB.status).toBe(200);
    expect(movementsB.body.meta.total).toBe(0);

    // Recepción de B con almacén de A → 404 (FK cruzada de almacén).
    const supplierB = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ code: 'sup-b', name: 'Proveedor B' });
    expect(supplierB.status).toBe(201);
    const orderB = await request(app)
      .post('/api/v1/purchasing/orders')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        supplierId: supplierB.body.data.id as string,
        lines: [{ description: 'B', quantity: 1, unitPrice: 1 }],
      });
    expect(orderB.status).toBe(201);
    const receiptB = await request(app)
      .post('/api/v1/purchasing/receipts')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        orderId: orderB.body.data.id as string,
        warehouseId: warehouseAId,
        lines: [{ description: 'B', quantity: 1, unitPrice: 1 }],
      });
    expect(receiptB.status).toBe(404);

    // Almacén archivado → 409 en movimientos nuevos (se restaura al final).
    const archiveWarehouse = await patchA(`/api/v1/warehouses/${warehouseBId}`, {
      status: 'archived',
    });
    expect(archiveWarehouse.status).toBe(200);
    const toArchivedWarehouse = await postA('/api/v1/inventory/movements', {
      productId,
      warehouseId: warehouseBId,
      type: 'manual_in',
      quantity: 1,
      reason: 'X',
    });
    expect(toArchivedWarehouse.status).toBe(409);
    const restoreWarehouse = await patchA(`/api/v1/warehouses/${warehouseBId}`, {
      status: 'active',
    });
    expect(restoreWarehouse.status).toBe(200);
  });

  it('auditoría: creaciones, movimientos manuales, aprobación de conteo y posting por tenant', async () => {
    const products = await getA('/api/v1/audit?action=product.create&limit=50');
    expect(products.status).toBe(200);
    expect(
      (products.body.data as Array<{ entityId: string }>).some((e) => e.entityId === productId),
    ).toBe(true);

    const movements = await getA('/api/v1/audit?action=stock.movement.create&limit=50');
    expect(movements.status).toBe(200);
    expect(
      (movements.body.data as Array<{ entityId: string }>).some(
        (e) => e.entityId === firstMovementId,
      ),
    ).toBe(true);

    const approval = await getA('/api/v1/audit?action=stock.count.approve&limit=50');
    expect(approval.status).toBe(200);
    expect(
      (approval.body.data as Array<{ entityId: string; metadata?: { reason?: string } }>).some(
        (e) => e.entityId === countId1 && e.metadata?.reason === 'status:approved',
      ),
    ).toBe(true);

    const posting = await getA(
      `/api/v1/audit?action=goods.receipt.update&entityId=${receiptId}&limit=50`,
    );
    expect(posting.status).toBe(200);
    expect(
      (posting.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'status:posted',
      ),
    ).toBe(true);

    const fromB = await request(app)
      .get('/api/v1/audit?action=product.create&limit=50')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(fromB.status).toBe(200);
    expect(
      (fromB.body.data as Array<{ entityId: string }>).every((e) => e.entityId !== productId),
    ).toBe(true);
  });
});
