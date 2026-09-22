/**
 * Integración Purchasing — FASE 10.
 * Contra MongoDB real (memory server): maestro de proveedores (código único
 * por tenant e inmutable), numeración secuencial por tenant+tipo+año,
 * líneas con importes calculados en el servidor, máquinas de estado,
 * recepción sin ruta DELETE (solo PATCH {archived}), FKs del mismo tenant
 * (404 uniforme) y aislamiento cruzado.
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
    ...createPurchasingRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';
const YEAR = new Date().getUTCFullYear();

const LINES = [{ description: 'Materia prima', quantity: 2, unitPrice: 100, taxRate: 21 }];

let mongod: MongoMemoryServer | undefined;

interface Provisioned {
  readonly token: string;
  readonly userId: string;
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
  return {
    token: login.body.data.accessToken as string,
    userId: login.body.data.user.id as string,
  };
}

describe('purchasing: maestro de proveedores y documentos de compra', () => {
  let tokenA = '';
  let tokenB = '';
  let supplierAId = '';
  let requestId1 = '';
  let requestId2 = '';
  let orderId1 = '';
  let invoiceId1 = '';
  let receiptId1 = '';

  const postA = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const patchA = (path: string, body: object) =>
    request(app).patch(path).set('Authorization', `Bearer ${tokenA}`).send(body);

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_purchasing'), logger);
    const a = await provision('purch-tenant-a', 'owner-a@purch.example');
    const b = await provision('purch-tenant-b', 'owner-b@purch.example');
    tokenA = a.token;
    tokenB = b.token;
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('proveedor: código normalizado, único por tenant, email en minúsculas y sin tenantId', async () => {
    const created = await postA('/api/v1/suppliers', {
      code: 'acme corp',
      name: 'ACME Corp',
      email: 'VENDOR@Example.COM',
      taxId: 'mx-tax123',
      address: { city: 'Guadalajara', country: 'mx' },
    });
    expect(created.status).toBe(201);
    const supplier = created.body.data;
    expect(supplier.code).toBe('ACME-CORP'); // mayúsculas y espacios → guiones
    expect(supplier.email).toBe('vendor@example.com');
    expect(supplier.taxId).toBe('MX-TAX123');
    expect(supplier.address.city).toBe('Guadalajara');
    expect(supplier.address.country).toBe('MX');
    expect(supplier.archived).toBe(false);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    supplierAId = supplier.id as string;

    const duplicate = await postA('/api/v1/suppliers', { code: 'ACME CORP', name: 'Otra' });
    expect(duplicate.status).toBe(409); // mismo tenant, mismo código normalizado

    const foreignTenant = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ code: 'acme corp', name: 'ACME B' });
    expect(foreignTenant.status).toBe(201); // unicidad POR tenant (ADR-002)

    const patchCode = await patchA(`/api/v1/suppliers/${supplierAId}`, { code: 'OTRO' });
    expect(patchCode.status).toBe(400); // código inmutable (campo no existe en PATCH)

    const invalidCode = await postA('/api/v1/suppliers', { code: 'x', name: 'X' });
    expect(invalidCode.status).toBe(400);
  });

  it('solicitud: numeración RQ-*, máquina de estados y aprobación vía PATCH', async () => {
    const created = await postA('/api/v1/purchasing/requests', {
      supplierId: supplierAId,
      lines: LINES,
    });
    expect(created.status).toBe(201);
    const request1 = created.body.data;
    expect(request1.number).toBe(`RQ-${YEAR}-000001`);
    expect(request1.kind).toBe('purchase.request');
    expect(request1.status).toBe('draft');
    expect(request1.currency).toBe('USD');
    expect(request1.subtotal).toBe(200); // 2 × 100
    expect(request1.tax).toBe(42); // IVA 21%
    expect(request1.total).toBe(242); // calculado por el servidor
    requestId1 = request1.id as string;

    const submitted = await patchA(`/api/v1/purchasing/requests/${requestId1}`, {
      status: 'submitted',
    });
    expect(submitted.status).toBe(200);

    const approved = await patchA(`/api/v1/purchasing/requests/${requestId1}`, {
      status: 'approved',
    });
    expect(approved.status).toBe(200); // el catálogo no tiene :approve en compras
    expect(approved.body.data.status).toBe('approved');

    const same = await patchA(`/api/v1/purchasing/requests/${requestId1}`, { status: 'approved' });
    expect(same.status).toBe(409);

    const editLines = await patchA(`/api/v1/purchasing/requests/${requestId1}`, { lines: LINES });
    expect(editLines.status).toBe(409); // solo borradores editables

    // Segunda solicitud para el salto de estado.
    const second = await postA('/api/v1/purchasing/requests', {
      supplierId: supplierAId,
      lines: LINES,
    });
    expect(second.status).toBe(201);
    expect(second.body.data.number).toBe(`RQ-${YEAR}-000002`);
    requestId2 = second.body.data.id as string;

    const jump = await patchA(`/api/v1/purchasing/requests/${requestId2}`, { status: 'approved' });
    expect(jump.status).toBe(409); // draft → approved no existe
  });

  it('la serie es por tenant y por tipo: orden PO-* y B empieza en RQ-000001', async () => {
    const order = await postA('/api/v1/purchasing/orders', {
      supplierId: supplierAId,
      requestId: requestId2,
      lines: LINES,
    });
    expect(order.status).toBe(201);
    expect(order.body.data.number).toBe(`PO-${YEAR}-000001`); // serie propia, no RQ-000003
    expect(order.body.data.requestId).toBe(requestId2);
    orderId1 = order.body.data.id as string;

    const unknownRequest = await postA('/api/v1/purchasing/orders', {
      supplierId: supplierAId,
      requestId: MISSING_ID,
      lines: LINES,
    });
    expect(unknownRequest.status).toBe(404);

    const unknownSupplier = await postA('/api/v1/purchasing/orders', {
      supplierId: MISSING_ID,
      lines: LINES,
    });
    expect(unknownSupplier.status).toBe(404);

    const jump = await patchA(`/api/v1/purchasing/orders/${orderId1}`, { status: 'completed' });
    expect(jump.status).toBe(409); // draft → completed no existe

    const confirmed = await patchA(`/api/v1/purchasing/orders/${orderId1}`, {
      status: 'confirmed',
    });
    expect(confirmed.status).toBe(200);

    // Un id de solicitud no es una orden: el `kind` filtra (404).
    const crossKind = await request(app)
      .get(`/api/v1/purchasing/orders/${requestId1}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(crossKind.status).toBe(404);

    const fromB = await request(app)
      .post('/api/v1/purchasing/requests')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ supplierId: MISSING_ID, lines: LINES });
    expect(fromB.status).toBe(404); // FK de A/B inexistente → 404 (no 500)

    const requestFromB = await request(app)
      .post('/api/v1/purchasing/requests')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ lines: LINES });
    expect(requestFromB.status).toBe(400); // supplierId es obligatorio (menos receipts)

    // B tiene su propia serie independiente (su proveedor ya existe).
    const supplierBList = await request(app)
      .get('/api/v1/suppliers?limit=100')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(supplierBList.status).toBe(200);
    const supplierBId = (supplierBList.body.data as Array<{ id: string }>)[0]?.id ?? '';
    const requestB = await request(app)
      .post('/api/v1/purchasing/requests')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ supplierId: supplierBId, lines: LINES });
    expect(requestB.status).toBe(201);
    expect(requestB.body.data.number).toBe(`RQ-${YEAR}-000001`);
    expect(requestB.body.data.id).not.toBe(requestId1);
  });

  it('recepción: exige orden, deriva el proveedor y NO tiene ruta DELETE', async () => {
    const noOrder = await postA('/api/v1/purchasing/receipts', { lines: LINES });
    expect(noOrder.status).toBe(400);

    const unknownOrder = await postA('/api/v1/purchasing/receipts', {
      orderId: MISSING_ID,
      lines: LINES,
    });
    expect(unknownOrder.status).toBe(404);

    const created = await postA('/api/v1/purchasing/receipts', {
      orderId: orderId1,
      lines: LINES,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.number).toBe(`GR-${YEAR}-000001`);
    expect(created.body.data.supplierId).toBe(supplierAId); // derivado de la orden
    expect(created.body.data.orderId).toBe(orderId1);
    receiptId1 = created.body.data.id as string;

    const supplierInjected = await patchA(`/api/v1/purchasing/receipts/${receiptId1}`, {
      supplierId: MISSING_ID,
    });
    expect(supplierInjected.status).toBe(400); // el proveedor no se edita en recepciones

    // Sin permiso `goods.receipt:delete` en el catálogo: NO se publica DELETE.
    const del = await request(app)
      .delete(`/api/v1/purchasing/receipts/${receiptId1}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(404);

    const archived = await patchA(`/api/v1/purchasing/receipts/${receiptId1}`, {
      archived: true,
    });
    expect(archived.status).toBe(200); // archivar vía PATCH {archived} (update)
    expect(archived.body.data.archived).toBe(true);

    const restored = await patchA(`/api/v1/purchasing/receipts/${receiptId1}`, {
      archived: false,
    });
    expect(restored.status).toBe(200);
    expect(restored.body.data.archived).toBe(false);

    const received = await patchA(`/api/v1/purchasing/receipts/${receiptId1}`, {
      status: 'received',
    });
    expect(received.status).toBe(200);

    const posted = await patchA(`/api/v1/purchasing/receipts/${receiptId1}`, { status: 'posted' });
    expect(posted.status).toBe(200); // listo para el ledger de stock (FASE 11)

    const second = await postA('/api/v1/purchasing/receipts', {
      orderId: orderId1,
      lines: LINES,
    });
    expect(second.status).toBe(201);
    const jump = await patchA(`/api/v1/purchasing/receipts/${second.body.data.id as string}`, {
      status: 'posted',
    });
    expect(jump.status).toBe(409);

    const list = await request(app)
      .get(`/api/v1/purchasing/receipts?orderId=${orderId1}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(2);
  });

  it('factura de proveedor: draft → issued → paid, bloqueo y soft-delete', async () => {
    const created = await postA('/api/v1/purchasing/invoices', {
      supplierId: supplierAId,
      orderId: orderId1,
      lines: LINES,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.number).toBe(`PI-${YEAR}-000001`);
    invoiceId1 = created.body.data.id as string;

    const issued = await patchA(`/api/v1/purchasing/invoices/${invoiceId1}`, {
      status: 'issued',
    });
    expect(issued.status).toBe(200);

    const editLines = await patchA(`/api/v1/purchasing/invoices/${invoiceId1}`, { lines: LINES });
    expect(editLines.status).toBe(409); // solo borradores

    const paid = await patchA(`/api/v1/purchasing/invoices/${invoiceId1}`, { status: 'paid' });
    expect(paid.status).toBe(200);

    const reverse = await patchA(`/api/v1/purchasing/invoices/${invoiceId1}`, {
      status: 'issued',
    });
    expect(reverse.status).toBe(409); // paid es terminal

    const del = await request(app)
      .delete(`/api/v1/purchasing/invoices/${invoiceId1}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(200);
    expect(del.body.data.archived).toBe(true);

    const twice = await request(app)
      .delete(`/api/v1/purchasing/invoices/${invoiceId1}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(twice.status).toBe(409);
  });

  it('devolución: rama lineal draft → received → refunded y FK de factura', async () => {
    const unknownInvoice = await postA('/api/v1/purchasing/returns', {
      supplierId: supplierAId,
      invoiceId: MISSING_ID,
      lines: LINES,
    });
    expect(unknownInvoice.status).toBe(404);

    const created = await postA('/api/v1/purchasing/returns', {
      supplierId: supplierAId,
      invoiceId: invoiceId1,
      lines: LINES,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.number).toBe(`RET-${YEAR}-000001`);
    const returnId = created.body.data.id as string;

    const jump = await patchA(`/api/v1/purchasing/returns/${returnId}`, { status: 'refunded' });
    expect(jump.status).toBe(409);

    const received = await patchA(`/api/v1/purchasing/returns/${returnId}`, {
      status: 'received',
    });
    expect(received.status).toBe(200);

    const refunded = await patchA(`/api/v1/purchasing/returns/${returnId}`, { status: 'refunded' });
    expect(refunded.status).toBe(200);
  });

  it('líneas: recálculo en PATCH y campos calculados rechazados', async () => {
    const updated = await patchA(`/api/v1/purchasing/requests/${requestId2}`, {
      lines: [{ description: 'Ajuste', quantity: 1, unitPrice: 50, taxRate: 10, discountPct: 10 }],
    });
    expect(updated.status).toBe(200);
    // 50 − 10% = 45 · IVA 10% = 4.5 · total = 49.5
    expect(updated.body.data.subtotal).toBe(45);
    expect(updated.body.data.tax).toBe(4.5);
    expect(updated.body.data.total).toBe(49.5);

    const clientSubtotal = await patchA(`/api/v1/purchasing/requests/${requestId2}`, {
      lines: [{ description: 'X', quantity: 1, unitPrice: 10, subtotal: 999 }],
    });
    expect(clientSubtotal.status).toBe(400); // campo calculado no es editable

    const zeroQty = await postA('/api/v1/purchasing/requests', {
      supplierId: supplierAId,
      lines: [{ description: 'X', quantity: 0, unitPrice: 10 }],
    });
    expect(zeroQty.status).toBe(400);

    const noLines = await postA('/api/v1/purchasing/requests', {
      supplierId: supplierAId,
      lines: [],
    });
    expect(noLines.status).toBe(400);

    const empty = await patchA(`/api/v1/purchasing/requests/${requestId2}`, {});
    expect(empty.status).toBe(400);
  });

  it('aislamiento: el tenant B no ve ni toca documentos/proveedores de A', async () => {
    const get = await request(app)
      .get(`/api/v1/purchasing/requests/${requestId1}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(get.status).toBe(404);

    const patch = await request(app)
      .patch(`/api/v1/purchasing/requests/${requestId1}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ notes: 'hack' });
    expect(patch.status).toBe(404);

    const remove = await request(app)
      .delete(`/api/v1/purchasing/requests/${requestId1}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(remove.status).toBe(404);

    const supplier = await request(app)
      .get(`/api/v1/suppliers/${supplierAId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(supplier.status).toBe(404);

    const fkToA = await request(app)
      .post('/api/v1/purchasing/orders')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ supplierId: supplierAId, lines: LINES });
    expect(fkToA.status).toBe(404);

    const listB = await request(app)
      .get('/api/v1/purchasing/requests?limit=100')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(listB.status).toBe(200);
    expect((listB.body.data as Array<{ id: string }>).every((r) => r.id !== requestId1)).toBe(true);
  });

  it('auditoría: creaciones, aprobación de solicitud y archivado por tenant', async () => {
    const created = await request(app)
      .get('/api/v1/audit?action=purchase.request.create&limit=50')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(created.status).toBe(200);
    expect(
      (created.body.data as Array<{ entityId: string }>).some((e) => e.entityId === requestId1),
    ).toBe(true);

    const approved = await request(app)
      .get('/api/v1/audit?action=purchase.request.update&limit=50')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(approved.status).toBe(200);
    expect(
      (approved.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'status:approved',
      ),
    ).toBe(true);

    const archived = await request(app)
      .get(`/api/v1/audit?action=supplier.invoice.archive&entityId=${invoiceId1}&limit=50`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(archived.status).toBe(200);
    expect((archived.body.data as unknown[]).length).toBeGreaterThanOrEqual(1);

    const fromB = await request(app)
      .get('/api/v1/audit?action=purchase.request.create&limit=50')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(fromB.status).toBe(200);
    expect(
      (fromB.body.data as Array<{ entityId: string }>).every((e) => e.entityId !== requestId1),
    ).toBe(true);
  });
});
