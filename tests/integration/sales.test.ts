/**
 * Integración Sales — FASE 9.
 * Contra MongoDB real (memory server): numeración secuencial por
 * tenant+tipo+año, líneas con importes calculados en el servidor, máquinas
 * de estado, aprobación de cotización con permiso propio, FKs del mismo
 * tenant (404 uniforme), soft-delete y aislamiento cruzado.
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
    { path: '/api/v1/audit', router: createAuditRouter(deps) },
    ...createCrmRouters(deps),
    ...createSalesRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';
const YEAR = new Date().getUTCFullYear();

const LINES = [
  { description: 'Servicio de consultoría', quantity: 2, unitPrice: 100, taxRate: 21 },
];

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

describe('sales: documentos de venta con numeración, líneas y estados', () => {
  let tokenA = '';
  let tokenB = '';
  let ownerAUserId = '';
  let customerAId = '';
  let customerBId = '';
  let opportunityAId = '';
  let quoteAId = '';
  let quoteDraftId = '';
  let orderIdA = '';
  let invoiceId = '';
  let deliveryId = '';

  const postA = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const patchA = (path: string, body: object) =>
    request(app).patch(path).set('Authorization', `Bearer ${tokenA}`).send(body);

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_sales'), logger);
    const a = await provision('sales-tenant-a', 'owner-a@sales.example');
    const b = await provision('sales-tenant-b', 'owner-b@sales.example');
    tokenA = a.token;
    tokenB = b.token;
    ownerAUserId = a.userId;

    const customerA = await postA('/api/v1/customers', { code: 'C-A1', name: 'Cliente A' });
    expect(customerA.status).toBe(201);
    customerAId = customerA.body.data.id as string;

    const customerB = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ code: 'C-B1', name: 'Cliente B' });
    expect(customerB.status).toBe(201);
    customerBId = customerB.body.data.id as string;

    const opp = await postA('/api/v1/opportunities', {
      name: 'Oportunidad',
      customerId: customerAId,
    });
    expect(opp.status).toBe(201);
    opportunityAId = opp.body.data.id as string;
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('crea una cotización: numeración QT-YYYY-000001, importes del servidor y sin tenantId', async () => {
    const res = await postA('/api/v1/sales/quotes', {
      customerId: customerAId,
      lines: LINES,
    });
    expect(res.status).toBe(201);
    const quote = res.body.data;
    expect(quote.kind).toBe('sales.quote');
    expect(quote.number).toBe(`QT-${YEAR}-000001`);
    expect(quote.status).toBe('draft');
    expect(quote.currency).toBe('USD');
    // 2 × 100 = 200 · IVA 21% = 42 · total = 242 (calculado, no aceptado del cliente)
    expect(quote.subtotal).toBe(200);
    expect(quote.tax).toBe(42);
    expect(quote.total).toBe(242);
    expect(quote.lines[0].subtotal).toBe(200);
    expect(quote.lines[0].total).toBe(242);
    expect(quote.approvedBy).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('tenantId');
    quoteAId = quote.id as string;

    const second = await postA('/api/v1/sales/quotes', { customerId: customerAId, lines: LINES });
    expect(second.status).toBe(201);
    expect(second.body.data.number).toBe(`QT-${YEAR}-000002`);
    quoteDraftId = second.body.data.id as string;
  });

  it('la serie es por tenant: B empieza en 000001 y no ve los números de A', async () => {
    const res = await request(app)
      .post('/api/v1/sales/quotes')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ customerId: customerBId, lines: LINES });
    expect(res.status).toBe(201);
    expect(res.body.data.number).toBe(`QT-${YEAR}-000001`);
    expect(res.body.data.id).not.toBe(quoteAId);
  });

  it('recalcula líneas en PATCH (descuento antes del impuesto) y rechaza importes del cliente', async () => {
    const updated = await patchA(`/api/v1/sales/quotes/${quoteAId}`, {
      lines: [{ description: 'Ajuste', quantity: 1, unitPrice: 50, taxRate: 10, discountPct: 10 }],
    });
    expect(updated.status).toBe(200);
    // 50 − 10% = 45 · IVA 10% = 4.5 · total = 49.5
    expect(updated.body.data.subtotal).toBe(45);
    expect(updated.body.data.tax).toBe(4.5);
    expect(updated.body.data.total).toBe(49.5);

    const clientSubtotal = await patchA(`/api/v1/sales/quotes/${quoteAId}`, {
      lines: [{ description: 'X', quantity: 1, unitPrice: 10, subtotal: 999 }],
    });
    expect(clientSubtotal.status).toBe(400); // campo calculado no es editable

    const zeroQty = await postA('/api/v1/sales/quotes', {
      customerId: customerAId,
      lines: [{ description: 'X', quantity: 0, unitPrice: 10 }],
    });
    expect(zeroQty.status).toBe(400);

    const noLines = await postA('/api/v1/sales/quotes', { customerId: customerAId, lines: [] });
    expect(noLines.status).toBe(400);
  });

  it('cotización: enviada → aprobada SOLO vía endpoint; estado y bloqueo posterior', async () => {
    const sent = await patchA(`/api/v1/sales/quotes/${quoteAId}`, { status: 'sent' });
    expect(sent.status).toBe(200);
    expect(sent.body.data.status).toBe('sent');

    // El PATCH nunca aprueba (el enum no incluye 'approved': exige permiso propio).
    const viaPatch = await patchA(`/api/v1/sales/quotes/${quoteAId}`, { status: 'approved' });
    expect(viaPatch.status).toBe(400);

    const fromDraft = await postA(`/api/v1/sales/quotes/${quoteDraftId}/approve`, {});
    expect(fromDraft.status).toBe(409); // draft → approved no existe

    const approved = await postA(`/api/v1/sales/quotes/${quoteAId}/approve`, {});
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('approved');
    expect(approved.body.data.approvedBy).toBe(ownerAUserId);
    expect(approved.body.data.approvedAt).not.toBeNull();

    const again = await postA(`/api/v1/sales/quotes/${quoteAId}/approve`, {});
    expect(again.status).toBe(409); // ya aprobada (solo sent se aprueba)

    const editLines = await patchA(`/api/v1/sales/quotes/${quoteAId}`, { lines: LINES });
    expect(editLines.status).toBe(409); // solo borradores editables

    const reject = await patchA(`/api/v1/sales/quotes/${quoteAId}`, { status: 'rejected' });
    expect(reject.status).toBe(409); // approved es terminal
  });

  it('referencias: oportunidad y cliente solo del mismo tenant; validUntil coherente', async () => {
    const withOpp = await postA('/api/v1/sales/quotes', {
      customerId: customerAId,
      opportunityId: opportunityAId,
      lines: LINES,
      currency: 'eur',
    });
    expect(withOpp.status).toBe(201);
    expect(withOpp.body.data.opportunityId).toBe(opportunityAId);
    expect(withOpp.body.data.currency).toBe('EUR');

    const unknownOpp = await postA('/api/v1/sales/quotes', {
      customerId: customerAId,
      opportunityId: MISSING_ID,
      lines: LINES,
    });
    expect(unknownOpp.status).toBe(404);

    const foreignCustomer = await postA('/api/v1/sales/quotes', {
      customerId: customerBId, // cliente del tenant B
      lines: LINES,
    });
    expect(foreignCustomer.status).toBe(404); // 404 uniforme (no revela existencia)

    const pastValidUntil = await postA('/api/v1/sales/quotes', {
      customerId: customerAId,
      lines: LINES,
      validUntil: '2020-01-01',
    });
    expect(pastValidUntil.status).toBe(400);

    const badCurrency = await postA('/api/v1/sales/quotes', {
      customerId: customerAId,
      lines: LINES,
      currency: 'dollars',
    });
    expect(badCurrency.status).toBe(400);
  });

  it('pedido: numeración SO-*, salto de estado → 409 y kind aísla los documentos', async () => {
    const order = await postA('/api/v1/sales/orders', {
      customerId: customerAId,
      quoteId: quoteAId,
      lines: LINES,
    });
    expect(order.status).toBe(201);
    expect(order.body.data.number).toBe(`SO-${YEAR}-000001`);
    expect(order.body.data.quoteId).toBe(quoteAId);
    orderIdA = order.body.data.id as string;

    const jump = await patchA(`/api/v1/sales/orders/${orderIdA}`, { status: 'fulfilled' });
    expect(jump.status).toBe(409); // draft → fulfilled no existe

    const confirmed = await patchA(`/api/v1/sales/orders/${orderIdA}`, { status: 'confirmed' });
    expect(confirmed.status).toBe(200);

    const unknownQuote = await postA('/api/v1/sales/orders', {
      customerId: customerAId,
      quoteId: MISSING_ID,
      lines: LINES,
    });
    expect(unknownQuote.status).toBe(404);

    // Un id de cotización no es un pedido: el `kind` filtra (404, no datos cruzados).
    const crossKind = await request(app)
      .get(`/api/v1/sales/orders/${quoteAId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(crossKind.status).toBe(404);

    const validUntilOnOrder = await patchA(`/api/v1/sales/orders/${orderIdA}`, {
      validUntil: '2030-01-01',
    });
    expect(validUntilOnOrder.status).toBe(400); // exclusive de cotizaciones
  });

  it('envío: exige pedido y deriva el cliente (no acepta customerId en el body)', async () => {
    const noOrder = await postA('/api/v1/sales/deliveries', { lines: LINES });
    expect(noOrder.status).toBe(400);

    const unknownOrder = await postA('/api/v1/sales/deliveries', {
      orderId: MISSING_ID,
      lines: LINES,
    });
    expect(unknownOrder.status).toBe(404);

    const created = await postA('/api/v1/sales/deliveries', { orderId: orderIdA, lines: LINES });
    expect(created.status).toBe(201);
    expect(created.body.data.number).toBe(`DL-${YEAR}-000001`);
    expect(created.body.data.customerId).toBe(customerAId); // derivado del pedido
    deliveryId = created.body.data.id as string;

    const customerInjected = await patchA(`/api/v1/sales/deliveries/${deliveryId}`, {
      customerId: customerBId,
    });
    expect(customerInjected.status).toBe(400); // customerId no se edita en envíos

    const list = await request(app)
      .get(`/api/v1/sales/deliveries?orderId=${orderIdA}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].id).toBe(deliveryId);
  });

  it('factura: draft → issued → paid y bloqueo de edición fuera del borrador', async () => {
    const invoice = await postA('/api/v1/sales/invoices', {
      customerId: customerAId,
      orderId: orderIdA,
      lines: LINES,
    });
    expect(invoice.status).toBe(201);
    expect(invoice.body.data.number).toBe(`IV-${YEAR}-000001`);
    invoiceId = invoice.body.data.id as string;

    const issued = await patchA(`/api/v1/sales/invoices/${invoiceId}`, { status: 'issued' });
    expect(issued.status).toBe(200);

    const editLines = await patchA(`/api/v1/sales/invoices/${invoiceId}`, { lines: LINES });
    expect(editLines.status).toBe(409); // solo borradores

    const paid = await patchA(`/api/v1/sales/invoices/${invoiceId}`, { status: 'paid' });
    expect(paid.status).toBe(200);

    const reverse = await patchA(`/api/v1/sales/invoices/${invoiceId}`, { status: 'issued' });
    expect(reverse.status).toBe(409); // paid es terminal

    const same = await patchA(`/api/v1/sales/invoices/${invoiceId}`, { status: 'paid' });
    expect(same.status).toBe(409); // mismo estado
  });

  it('devolución: rama lineal draft → received → refunded y FK de factura', async () => {
    const unknownInvoice = await postA('/api/v1/sales/returns', {
      customerId: customerAId,
      invoiceId: MISSING_ID,
      lines: LINES,
    });
    expect(unknownInvoice.status).toBe(404);

    const created = await postA('/api/v1/sales/returns', {
      customerId: customerAId,
      invoiceId,
      lines: LINES,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.number).toBe(`RT-${YEAR}-000001`);
    const returnId = created.body.data.id as string;

    const jump = await patchA(`/api/v1/sales/returns/${returnId}`, { status: 'refunded' });
    expect(jump.status).toBe(409);

    const received = await patchA(`/api/v1/sales/returns/${returnId}`, { status: 'received' });
    expect(received.status).toBe(200);

    const refunded = await patchA(`/api/v1/sales/returns/${returnId}`, { status: 'refunded' });
    expect(refunded.status).toBe(200);
  });

  it('soft-delete: archivar, doble archive → 409, listados y restore', async () => {
    const empty = await patchA(`/api/v1/sales/orders/${orderIdA}`, {});
    expect(empty.status).toBe(400);

    const archived = await request(app)
      .delete(`/api/v1/sales/orders/${orderIdA}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(archived.status).toBe(200);
    expect(archived.body.data.archived).toBe(true);

    const twice = await request(app)
      .delete(`/api/v1/sales/orders/${orderIdA}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(twice.status).toBe(409);

    const trueList = await request(app)
      .get('/api/v1/sales/orders?archived=true&limit=100')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(trueList.status).toBe(200);
    expect((trueList.body.data as Array<{ id: string }>).some((o) => o.id === orderIdA)).toBe(true);

    const restored = await patchA(`/api/v1/sales/orders/${orderIdA}`, { archived: false });
    expect(restored.status).toBe(200);
    expect(restored.body.data.archived).toBe(false);
  });

  it('aislamiento: el tenant B no ve ni toca documentos de A y no puede usar sus FKs', async () => {
    const get = await request(app)
      .get(`/api/v1/sales/quotes/${quoteAId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(get.status).toBe(404);

    const patch = await request(app)
      .patch(`/api/v1/sales/quotes/${quoteAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ notes: 'hack' });
    expect(patch.status).toBe(404);

    const remove = await request(app)
      .delete(`/api/v1/sales/quotes/${quoteAId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(remove.status).toBe(404);

    const fkToA = await request(app)
      .post('/api/v1/sales/orders')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ customerId: customerAId, lines: LINES });
    expect(fkToA.status).toBe(404);

    const listB = await request(app)
      .get('/api/v1/sales/quotes?limit=100')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(listB.status).toBe(200);
    expect((listB.body.data as Array<{ id: string }>).every((q) => q.id !== quoteAId)).toBe(true);
  });

  it('auditoría: creaciones, cambios de estado y aprobación por tenant', async () => {
    const created = await request(app)
      .get('/api/v1/audit?action=sales.quote.create&limit=50')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(created.status).toBe(200);
    expect(
      (created.body.data as Array<{ entityId: string }>).some((e) => e.entityId === quoteAId),
    ).toBe(true);

    const statusChange = await request(app)
      .get(`/api/v1/audit?action=sales.invoice.update&entityId=${invoiceId}&limit=50`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(statusChange.status).toBe(200);
    expect(
      (statusChange.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'status:issued',
      ),
    ).toBe(true);

    const approved = await request(app)
      .get('/api/v1/audit?action=sales.quote.approve&limit=50')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(approved.status).toBe(200);
    expect(
      (approved.body.data as Array<{ entityId: string }>).some((e) => e.entityId === quoteAId),
    ).toBe(true);

    const fromB = await request(app)
      .get('/api/v1/audit?action=sales.quote.create&limit=50')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(fromB.status).toBe(200);
    expect(
      (fromB.body.data as Array<{ entityId: string }>).every((e) => e.entityId !== quoteAId),
    ).toBe(true);
  });
});
