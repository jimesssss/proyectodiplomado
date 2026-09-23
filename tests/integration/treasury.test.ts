/**
 * Integración Treasury — FASE 13.
 * Contra MongoDB real (memory server): cuentas de tesorería (banco/caja en
 * UNA colección, `code` único por tenant e inmutable, saldo = apertura +
 * ledger, DELETE ausente), guardia de saldo NUNCA negativo (422 con
 * compensación), máquina `draft→posted|cancelled` (publicar mueve dinero con
 * `:update`, patrón goods.receipt), FKs a facturas (404 uniforme),
 * transacciones de banco (solo tipo `bank`, NO mueven saldo) y
 * conciliaciones `REC-*` con validación/emparejamiento de líneas +
 * aislamiento cruzado + auditoría.
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
import { createPurchasingRouters } from '../../apps/api/src/modules/purchasing/index.js';
import { createTreasuryRouters } from '../../apps/api/src/modules/treasury/index.js';

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
    // CRM (customers) + Sales/Purchasing: fixtures de facturas para las FKs.
    ...createCrmRouters(deps),
    ...createSalesRouters(deps),
    ...createPurchasingRouters(deps),
    ...createTreasuryRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';
const YEAR = new Date().getUTCFullYear();
const PURCHASE_LINES = [{ description: 'Materia prima', quantity: 2, unitPrice: 100, taxRate: 21 }];
const SALE_LINES = [
  { description: 'Servicio de consultoría', quantity: 2, unitPrice: 100, taxRate: 21 },
];

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

describe('treasury: cuentas, dinero, banco y conciliaciones', () => {
  let tokenA = '';
  let tokenB = '';
  // Cuentas (A)
  let bank1Id = '';
  let bank1IdB = ''; // misma clave natural en el tenant B (unicidad POR tenant)
  let cashId = '';
  let bank2Id = '';
  let scrapId = ''; // queda archivada (FK de cuenta archivada → 409)
  // FKs de facturas
  let supplierInvoiceAId = '';
  let salesInvoiceAId = '';
  let supplierInvoiceBId = '';
  // Documentos de dinero
  let payId1 = ''; // intento fallido (queda draft)
  let payId2 = ''; // publicado
  let payId3 = ''; // cancelado
  let rcpId1 = ''; // publicado
  let rcpId2 = ''; // cancelado
  // Banco y conciliaciones
  let tx1 = '';
  let tx2 = '';
  let tx3 = '';
  let txOther = ''; // de OTRA cuenta
  let recon1Id = '';

  const postA = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const patchA = (path: string, body: object) =>
    request(app).patch(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const getA = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenA}`);

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_treasury'), logger);
    const a = await provision('tre-tenant-a', 'owner-a@tre.example');
    const b = await provision('tre-tenant-b', 'owner-b@tre.example');
    tokenA = a.token;
    tokenB = b.token;

    // Fixtures FK para A: factura de proveedor (PI-*) y factura de venta (IV-*).
    const supplierA = await postA('/api/v1/suppliers', { code: 'SUP-A', name: 'Proveedor A' });
    expect(supplierA.status).toBe(201);
    const invoiceA = await postA('/api/v1/purchasing/invoices', {
      supplierId: supplierA.body.data.id as string,
      lines: PURCHASE_LINES,
    });
    expect(invoiceA.status).toBe(201);
    supplierInvoiceAId = invoiceA.body.data.id as string;

    const customerA = await postA('/api/v1/customers', { code: 'CLI-A', name: 'Cliente A' });
    expect(customerA.status).toBe(201);
    const salesIvA = await postA('/api/v1/sales/invoices', {
      customerId: customerA.body.data.id as string,
      lines: SALE_LINES,
    });
    expect(salesIvA.status).toBe(201);
    salesInvoiceAId = salesIvA.body.data.id as string;

    // Fixture FK para B (para el 404 cruzado del pago).
    const supplierB = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ code: 'SUP-B', name: 'Proveedor B' });
    expect(supplierB.status).toBe(201);
    const invoiceB = await request(app)
      .post('/api/v1/purchasing/invoices')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ supplierId: supplierB.body.data.id as string, lines: PURCHASE_LINES });
    expect(invoiceB.status).toBe(201);
    supplierInvoiceBId = invoiceB.body.data.id as string;
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('cuentas: banco/caja, código único e inmutable, apertura en ledger y sin DELETE', async () => {
    const created = await postA('/api/v1/treasury/accounts', {
      type: 'bank',
      code: ' banco 1 ',
      name: 'Banco Uno',
      accountNumber: 'ES99-0001',
      currency: 'mxn',
      openingBalance: 1_000,
    });
    expect(created.status).toBe(201);
    const account = created.body.data;
    expect(account.code).toBe('BANCO-1'); // mayúsculas y espacios → guiones
    expect(account.type).toBe('bank');
    expect(account.currency).toBe('MXN'); // normalizada
    expect(account.openingBalance).toBe(1_000);
    expect(account.balance).toBe(1_000); // proyección parte de la apertura
    expect(account.archived).toBe(false);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    bank1Id = account.id as string;

    // El asiento de apertura queda en el extracto (ledger = fuente de verdad).
    const extract = await getA(`/api/v1/treasury/accounts/${bank1Id}/movements`);
    expect(extract.status).toBe(200);
    expect(extract.body.meta.total).toBe(1);
    const [opening] = extract.body.data as Array<{
      sourceType: string;
      amount: number;
      balanceAfter: number;
    }>;
    expect(opening?.sourceType).toBe('opening');
    expect(opening?.amount).toBe(1_000);
    expect(opening?.balanceAfter).toBe(1_000);
    expect(JSON.stringify(extract.body)).not.toContain('tenantId');

    const duplicate = await postA('/api/v1/treasury/accounts', {
      type: 'bank',
      code: 'banco 1',
      name: 'Dup',
    });
    expect(duplicate.status).toBe(409); // mismo tenant, mismo código
    expect(duplicate.body.error.message).toBe('Code already exists');

    const foreignTenant = await request(app)
      .post('/api/v1/treasury/accounts')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ type: 'bank', code: 'banco 1', name: 'Banco B', openingBalance: 500 });
    expect(foreignTenant.status).toBe(201); // unicidad POR tenant (ADR-002)
    bank1IdB = foreignTenant.body.data.id as string;

    const cash = await postA('/api/v1/treasury/accounts', {
      type: 'cash',
      code: 'CAJA-1',
      name: 'Caja chica',
      openingBalance: 0,
    });
    expect(cash.status).toBe(201);
    expect(cash.body.data.balance).toBe(0);
    cashId = cash.body.data.id as string;

    const bank2 = await postA('/api/v1/treasury/accounts', {
      type: 'bank',
      code: 'BANCO-2',
      name: 'Banco Segundo',
      openingBalance: 0,
    });
    expect(bank2.status).toBe(201);
    bank2Id = bank2.body.data.id as string;

    const scrap = await postA('/api/v1/treasury/accounts', {
      type: 'cash',
      code: 'SCRAP-1',
      name: 'Cuenta obsoleta',
    });
    expect(scrap.status).toBe(201);
    scrapId = scrap.body.data.id as string;

    // Inmutables: el PATCH ni siquiera los admite → 400.
    expect((await patchA(`/api/v1/treasury/accounts/${bank1Id}`, { code: 'OTRO' })).status).toBe(
      400,
    );
    expect((await patchA(`/api/v1/treasury/accounts/${bank1Id}`, { type: 'cash' })).status).toBe(
      400,
    );
    expect((await patchA(`/api/v1/treasury/accounts/${bank1Id}`, { currency: 'EUR' })).status).toBe(
      400,
    );
    expect(
      (await patchA(`/api/v1/treasury/accounts/${bank1Id}`, { openingBalance: 5 })).status,
    ).toBe(400);
    expect((await patchA(`/api/v1/treasury/accounts/${bank1Id}`, { balance: 999 })).status).toBe(
      400,
    );
    expect(
      (await patchA(`/api/v1/treasury/accounts/${bank1Id}`, { accountNumber: 'X' })).status,
    ).toBe(400);

    const updated = await patchA(`/api/v1/treasury/accounts/${bank1Id}`, { name: 'Banco 1' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('Banco 1');

    // Valores inválidos → 400; campos SOLO-del-servidor inyectados → 400.
    const badType = await postA('/api/v1/treasury/accounts', {
      type: 'hacked',
      code: 'BAD-1',
      name: 'X',
    });
    expect(badType.status).toBe(400);
    const negative = await postA('/api/v1/treasury/accounts', {
      type: 'cash',
      code: 'BAD-2',
      name: 'X',
      openingBalance: -5,
    });
    expect(negative.status).toBe(400);
    const badCode = await postA('/api/v1/treasury/accounts', {
      type: 'cash',
      code: 'x',
      name: 'X',
    });
    expect(badCode.status).toBe(400);
    const tenantInjection = await postA('/api/v1/treasury/accounts', {
      type: 'cash',
      code: 'BAD-3',
      name: 'X',
      tenantId: 'otro-tenant',
    });
    expect(tenantInjection.status).toBe(400);
    const archivedInjection = await postA('/api/v1/treasury/accounts', {
      type: 'cash',
      code: 'BAD-4',
      name: 'X',
      archived: true,
    });
    expect(archivedInjection.status).toBe(400);
    const balanceInjection = await postA('/api/v1/treasury/accounts', {
      type: 'cash',
      code: 'BAD-5',
      name: 'X',
      balance: 500,
    });
    expect(balanceInjection.status).toBe(400);

    // Sin `bank.account:delete` en el catálogo: DELETE NO publicado.
    const del = await request(app)
      .delete(`/api/v1/treasury/accounts/${bank1Id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(404);

    // Archivar vía PATCH {archived}; doble archivar/restore → 409.
    const archived = await patchA(`/api/v1/treasury/accounts/${scrapId}`, { archived: true });
    expect(archived.status).toBe(200);
    expect(archived.body.data.archived).toBe(true);
    const twice = await patchA(`/api/v1/treasury/accounts/${scrapId}`, { archived: true });
    expect(twice.status).toBe(409);
    const archivedList = await getA('/api/v1/treasury/accounts?archived=true');
    expect((archivedList.body.data as Array<{ id: string }>).some((a) => a.id === scrapId)).toBe(
      true,
    );
    const activeList = await getA('/api/v1/treasury/accounts?archived=false');
    expect((activeList.body.data as Array<{ id: string }>).some((a) => a.id === scrapId)).toBe(
      false,
    );
    const restored = await patchA(`/api/v1/treasury/accounts/${scrapId}`, { archived: false });
    expect(restored.status).toBe(200);
    const restoredTwice = await patchA(`/api/v1/treasury/accounts/${scrapId}`, {
      archived: false,
    });
    expect(restoredTwice.status).toBe(409);
    // Vuelve a archivarse: queda así para el 409 de "cuenta archivada".
    const reArchive = await patchA(`/api/v1/treasury/accounts/${scrapId}`, { archived: true });
    expect(reArchive.status).toBe(200);

    const byType = await getA('/api/v1/treasury/accounts?type=bank');
    expect(byType.status).toBe(200);
    expect((byType.body.data as Array<{ id: string }>).some((a) => a.id === bank1Id)).toBe(true);
    expect((byType.body.data as Array<{ id: string }>).some((a) => a.id === cashId)).toBe(false);

    const unknown = await getA(`/api/v1/treasury/accounts/${MISSING_ID}`);
    expect(unknown.status).toBe(404);
    const unknownExtract = await getA(`/api/v1/treasury/accounts/${MISSING_ID}/movements`);
    expect(unknownExtract.status).toBe(404);
  });

  it('guardia de saldo: pago mayor que el saldo → 422 y NO escribe nada', async () => {
    const created = await postA('/api/v1/treasury/payments', { accountId: cashId, amount: 50 });
    expect(created.status).toBe(201);
    expect(created.body.data.number).toBe(`PAY-${YEAR}-000001`);
    expect(created.body.data.status).toBe('draft');
    payId1 = created.body.data.id as string;

    const post = await patchA(`/api/v1/treasury/payments/${payId1}`, { status: 'posted' });
    expect(post.status).toBe(422);
    expect(post.body.error.code).toBe('DOMAIN_ERROR');
    expect(post.body.error.message).toBe('Insufficient funds');
    expect(post.body.error.details).toEqual({ available: 0, required: 50 });

    // Sin efectos: sigue draft, saldo intacto y sin apunte en el ledger.
    const still = await getA(`/api/v1/treasury/payments/${payId1}`);
    expect(still.body.data.status).toBe('draft');
    const cash = await getA(`/api/v1/treasury/accounts/${cashId}`);
    expect(cash.body.data.balance).toBe(0);
    const extract = await getA(`/api/v1/treasury/accounts/${cashId}/movements`);
    expect(extract.body.meta.total).toBe(1); // solo la apertura
  });

  it('pagos: PAY-*, draft editable y publicación mueve saldo + ledger', async () => {
    const created = await postA('/api/v1/treasury/payments', {
      accountId: bank1Id,
      amount: 125.5,
      date: '2026-03-15',
      reference: 'REF-77',
      notes: 'Pago proveedor',
    });
    expect(created.status).toBe(201);
    const payment = created.body.data;
    expect(payment.number).toBe(`PAY-${YEAR}-000002`);
    expect(payment.status).toBe('draft');
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    payId2 = payment.id as string;

    // El borrador es editable más allá de su estado.
    const edited = await patchA(`/api/v1/treasury/payments/${payId2}`, {
      notes: 'nota en borrador',
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data.notes).toBe('nota en borrador');

    const emptyPatch = await patchA(`/api/v1/treasury/payments/${payId2}`, {});
    expect(emptyPatch.status).toBe(400);

    const posted = await patchA(`/api/v1/treasury/payments/${payId2}`, { status: 'posted' });
    expect(posted.status).toBe(200);
    expect(posted.body.data.status).toBe('posted');

    const account = await getA(`/api/v1/treasury/accounts/${bank1Id}`);
    expect(account.body.data.balance).toBe(874.5); // 1000 − 125.5

    // Ledger: −125.5 con el saldo resultante.
    const extract = await getA(`/api/v1/treasury/accounts/${bank1Id}/movements`);
    expect(extract.body.meta.total).toBe(2);
    const [latest] = extract.body.data as Array<{
      sourceType: string;
      amount: number;
      balanceAfter: number;
      sourceId: string;
      reason: string;
    }>;
    expect(latest?.sourceType).toBe('payment');
    expect(latest?.amount).toBe(-125.5);
    expect(latest?.balanceAfter).toBe(874.5);
    expect(latest?.sourceId).toBe(payId2);
    expect(latest?.reason).toBe(`Payment PAY-${YEAR}-000002`);

    // `posted` es terminal e inmutable.
    const editPosted = await patchA(`/api/v1/treasury/payments/${payId2}`, { notes: 'hack' });
    expect(editPosted.status).toBe(409);
    expect(editPosted.body.error.message).toBe('Only draft documents can be edited');
    const cancelPosted = await patchA(`/api/v1/treasury/payments/${payId2}`, {
      status: 'cancelled',
    });
    expect(cancelPosted.status).toBe(409);
    const doublePost = await patchA(`/api/v1/treasury/payments/${payId2}`, { status: 'posted' });
    expect(doublePost.status).toBe(409);
    expect(doublePost.body.error.message).toBe('Status is already the requested one');

    const postedList = await getA('/api/v1/treasury/payments?status=posted');
    expect((postedList.body.data as Array<{ id: string }>).some((p) => p.id === payId2)).toBe(true);

    const zero = await postA('/api/v1/treasury/payments', { accountId: bank1Id, amount: 0 });
    expect(zero.status).toBe(400);
    const negative = await postA('/api/v1/treasury/payments', { accountId: bank1Id, amount: -5 });
    expect(negative.status).toBe(400);
  });

  it('cancelación: draft → cancelled sin mover dinero (terminal)', async () => {
    const created = await postA('/api/v1/treasury/payments', {
      accountId: bank1Id,
      amount: 10,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.number).toBe(`PAY-${YEAR}-000003`);
    payId3 = created.body.data.id as string;

    const cancelled = await patchA(`/api/v1/treasury/payments/${payId3}`, {
      status: 'cancelled',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('cancelled');

    // Sin movimiento de dinero: saldo y ledger intactos.
    const account = await getA(`/api/v1/treasury/accounts/${bank1Id}`);
    expect(account.body.data.balance).toBe(874.5);
    const extract = await getA(`/api/v1/treasury/accounts/${bank1Id}/movements`);
    expect(extract.body.meta.total).toBe(2);

    const edit = await patchA(`/api/v1/treasury/payments/${payId3}`, { notes: 'x' });
    expect(edit.status).toBe(409);
    const sameState = await patchA(`/api/v1/treasury/payments/${payId3}`, {
      status: 'cancelled',
    });
    expect(sameState.status).toBe(409);
    const postCancelled = await patchA(`/api/v1/treasury/payments/${payId3}`, {
      status: 'posted',
    });
    expect(postCancelled.status).toBe(409);
    expect(postCancelled.body.error.message).toBe('Invalid status transition');

    const cancelledList = await getA('/api/v1/treasury/payments?status=cancelled');
    expect((cancelledList.body.data as Array<{ id: string }>).some((p) => p.id === payId3)).toBe(
      true,
    );
  });

  it('FK de pagos: factura de proveedor (404 uniforme) y cuenta archivada (409)', async () => {
    const withInvoice = await postA('/api/v1/treasury/payments', {
      accountId: bank1Id,
      amount: 5,
      invoiceId: supplierInvoiceAId,
    });
    expect(withInvoice.status).toBe(201);
    expect(withInvoice.body.data.invoiceId).toBe(supplierInvoiceAId);

    const unknownInvoice = await postA('/api/v1/treasury/payments', {
      accountId: bank1Id,
      amount: 5,
      invoiceId: MISSING_ID,
    });
    expect(unknownInvoice.status).toBe(404);

    // De OTRO kind (factura de venta en vez de proveedor) → 404 uniforme.
    const wrongKind = await postA('/api/v1/treasury/payments', {
      accountId: bank1Id,
      amount: 5,
      invoiceId: salesInvoiceAId,
    });
    expect(wrongKind.status).toBe(404);

    // De OTRO tenant → 404 (aislamiento de la FK).
    const crossTenant = await postA('/api/v1/treasury/payments', {
      accountId: bank1Id,
      amount: 5,
      invoiceId: supplierInvoiceBId,
    });
    expect(crossTenant.status).toBe(404);

    const archivedAccount = await postA('/api/v1/treasury/payments', {
      accountId: scrapId,
      amount: 1,
    });
    expect(archivedAccount.status).toBe(409);
    expect(archivedAccount.body.error.message).toBe('Account is archived');

    const unknownAccount = await postA('/api/v1/treasury/payments', {
      accountId: MISSING_ID,
      amount: 1,
    });
    expect(unknownAccount.status).toBe(404);
  });

  it('cobros: RCP-* publicado suma saldo; cancelado no (terminal)', async () => {
    const created = await postA('/api/v1/treasury/receipts', {
      accountId: bank1Id,
      amount: 349.5,
      invoiceId: salesInvoiceAId,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.number).toBe(`RCP-${YEAR}-000001`);
    expect(created.body.data.status).toBe('draft');
    rcpId1 = created.body.data.id as string;

    const posted = await patchA(`/api/v1/treasury/receipts/${rcpId1}`, { status: 'posted' });
    expect(posted.status).toBe(200);
    const account = await getA(`/api/v1/treasury/accounts/${bank1Id}`);
    expect(account.body.data.balance).toBe(1_224); // 874.5 + 349.5

    const extract = await getA(`/api/v1/treasury/accounts/${bank1Id}/movements`);
    expect(extract.body.meta.total).toBe(3);
    const [latest] = extract.body.data as Array<{
      sourceType: string;
      amount: number;
      balanceAfter: number;
      reason: string;
    }>;
    expect(latest?.sourceType).toBe('receipt');
    expect(latest?.amount).toBe(349.5);
    expect(latest?.balanceAfter).toBe(1_224);
    expect(latest?.reason).toBe(`Receipt RCP-${YEAR}-000001`);

    const editPosted = await patchA(`/api/v1/treasury/receipts/${rcpId1}`, { notes: 'hack' });
    expect(editPosted.status).toBe(409);
    const doublePost = await patchA(`/api/v1/treasury/receipts/${rcpId1}`, { status: 'posted' });
    expect(doublePost.status).toBe(409);

    // Cancelado: sin movimiento de dinero.
    const second = await postA('/api/v1/treasury/receipts', {
      accountId: bank1Id,
      amount: 20,
    });
    expect(second.status).toBe(201);
    expect(second.body.data.number).toBe(`RCP-${YEAR}-000002`);
    rcpId2 = second.body.data.id as string;
    const cancelled = await patchA(`/api/v1/treasury/receipts/${rcpId2}`, {
      status: 'cancelled',
    });
    expect(cancelled.status).toBe(200);
    const afterCancel = await getA(`/api/v1/treasury/accounts/${bank1Id}`);
    expect(afterCancel.body.data.balance).toBe(1_224);
    const extractAfter = await getA(`/api/v1/treasury/accounts/${bank1Id}/movements`);
    expect(extractAfter.body.meta.total).toBe(3);

    // FKs del cobro y cuenta archivada.
    const unknownInvoice = await postA('/api/v1/treasury/receipts', {
      accountId: bank1Id,
      amount: 5,
      invoiceId: MISSING_ID,
    });
    expect(unknownInvoice.status).toBe(404);
    const wrongKind = await postA('/api/v1/treasury/receipts', {
      accountId: bank1Id,
      amount: 5,
      invoiceId: supplierInvoiceAId,
    });
    expect(wrongKind.status).toBe(404);
    const archivedAccount = await postA('/api/v1/treasury/receipts', {
      accountId: scrapId,
      amount: 5,
    });
    expect(archivedAccount.status).toBe(409);

    const postedList = await getA('/api/v1/treasury/receipts?status=posted');
    expect((postedList.body.data as Array<{ id: string }>).some((r) => r.id === rcpId1)).toBe(true);
  });

  it('líneas de banco: solo cuentas tipo bank y NO mueven saldo interno', async () => {
    const onCash = await postA('/api/v1/treasury/bank-transactions', {
      accountId: cashId,
      amount: -40,
    });
    expect(onCash.status).toBe(422);
    expect(onCash.body.error.code).toBe('DOMAIN_ERROR');
    expect(onCash.body.error.message).toBe('Bank transactions require a bank account');
    expect(onCash.body.error.details).toEqual({ type: 'cash' });

    const created = await postA('/api/v1/treasury/bank-transactions', {
      accountId: bank1Id,
      amount: -40,
      date: '2026-03-20',
      externalId: 'EXT-1',
      description: 'Retiro',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.reconciled).toBe(false);
    expect(created.body.data.reconciliationId).toBeNull();
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    tx1 = created.body.data.id as string;

    // El registro externo NO mueve el saldo interno.
    const account = await getA(`/api/v1/treasury/accounts/${bank1Id}`);
    expect(account.body.data.balance).toBe(1_224);

    const zero = await postA('/api/v1/treasury/bank-transactions', {
      accountId: bank1Id,
      amount: 0,
    });
    expect(zero.status).toBe(400);
    const reconInjection = await postA('/api/v1/treasury/bank-transactions', {
      accountId: bank1Id,
      amount: -10,
      reconciliationId: MISSING_ID,
    });
    expect(reconInjection.status).toBe(400); // server-only
    const tenantInjection = await postA('/api/v1/treasury/bank-transactions', {
      accountId: bank1Id,
      amount: -10,
      tenantId: 'otro-tenant',
    });
    expect(tenantInjection.status).toBe(400);

    const edited = await patchA(`/api/v1/treasury/bank-transactions/${tx1}`, {
      description: 'Retiro ATM',
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data.description).toBe('Retiro ATM');
    const amountImmutable = await patchA(`/api/v1/treasury/bank-transactions/${tx1}`, {
      amount: -50,
    });
    expect(amountImmutable.status).toBe(400); // el hecho bancario es inmutable

    const deposit = await postA('/api/v1/treasury/bank-transactions', {
      accountId: bank1Id,
      amount: 100,
      description: 'Depósito',
    });
    expect(deposit.status).toBe(201);
    tx2 = deposit.body.data.id as string;
    const fee = await postA('/api/v1/treasury/bank-transactions', {
      accountId: bank1Id,
      amount: -20,
    });
    expect(fee.status).toBe(201);
    tx3 = fee.body.data.id as string;
    const other = await postA('/api/v1/treasury/bank-transactions', {
      accountId: bank2Id,
      amount: -30,
    });
    expect(other.status).toBe(201);
    txOther = other.body.data.id as string;

    const pending = await getA('/api/v1/treasury/bank-transactions?reconciled=false');
    expect(pending.status).toBe(200);
    expect((pending.body.data as Array<{ id: string }>).some((t) => t.id === tx1)).toBe(true);
    const reconciled = await getA('/api/v1/treasury/bank-transactions?reconciled=true');
    expect((reconciled.body.data as Array<{ id: string }>).some((t) => t.id === tx1)).toBe(false);
    const byAccount = await getA(`/api/v1/treasury/bank-transactions?accountId=${bank1Id}`);
    expect(byAccount.status).toBe(200);
    expect(byAccount.body.meta.total).toBe(3);

    const unknown = await getA(`/api/v1/treasury/bank-transactions/${MISSING_ID}`);
    expect(unknown.status).toBe(404);
  });

  it('conciliaciones: REC-*, validación de líneas y marca/desmarca idempotente', async () => {
    // Movimiento del ledger a emparejar (del pago publicado en bank1).
    const extract = await getA(`/api/v1/treasury/accounts/${bank1Id}/movements`);
    const movements = extract.body.data as Array<{ id: string; sourceType: string }>;
    const paymentMovement = movements.find((m) => m.sourceType === 'payment');
    expect(paymentMovement).toBeDefined();

    const created = await postA('/api/v1/treasury/reconciliations', {
      accountId: bank1Id,
      reconciledAt: '2026-03-31',
      lines: [{ bankTransactionId: tx1, movementId: paymentMovement?.id }],
      notes: 'Conciliación de marzo',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.number).toBe(`REC-${YEAR}-000001`);
    expect(created.body.data.lines).toHaveLength(1);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    recon1Id = created.body.data.id as string;

    // La línea quedó marcada en la transacción.
    const tx = await getA(`/api/v1/treasury/bank-transactions/${tx1}`);
    expect(tx.body.data.reconciled).toBe(true);
    expect(tx.body.data.reconciliationId).toBe(recon1Id);

    const duplicate = await postA('/api/v1/treasury/reconciliations', {
      accountId: bank1Id,
      lines: [{ bankTransactionId: tx1 }, { bankTransactionId: tx1 }],
    });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.message).toBe('Duplicate bank transaction in lines');

    const already = await postA('/api/v1/treasury/reconciliations', {
      accountId: bank1Id,
      lines: [{ bankTransactionId: tx1 }],
    });
    expect(already.status).toBe(409);
    expect(already.body.error.message).toBe('Bank transaction is already reconciled');

    const otherAccountLine = await postA('/api/v1/treasury/reconciliations', {
      accountId: bank1Id,
      lines: [{ bankTransactionId: txOther }],
    });
    expect(otherAccountLine.status).toBe(409);
    expect(otherAccountLine.body.error.message).toBe('Bank transaction belongs to another account');

    const onCash = await postA('/api/v1/treasury/reconciliations', {
      accountId: cashId,
      lines: [{ bankTransactionId: tx2 }],
    });
    expect(onCash.status).toBe(422);
    expect(onCash.body.error.message).toBe('Reconciliations require a bank account');

    // Ledger de OTRA cuenta como pareja → 409.
    const cashExtract = await getA(`/api/v1/treasury/accounts/${cashId}/movements`);
    const cashOpening = (cashExtract.body.data as Array<{ id: string }>)[0];
    const foreignMovement = await postA('/api/v1/treasury/reconciliations', {
      accountId: bank1Id,
      lines: [{ bankTransactionId: tx2, movementId: cashOpening?.id }],
    });
    expect(foreignMovement.status).toBe(409);
    expect(foreignMovement.body.error.message).toBe('Movement belongs to another account');

    const unknownMovement = await postA('/api/v1/treasury/reconciliations', {
      accountId: bank1Id,
      lines: [{ bankTransactionId: tx2, movementId: MISSING_ID }],
    });
    expect(unknownMovement.status).toBe(404);
    const unknownTx = await postA('/api/v1/treasury/reconciliations', {
      accountId: bank1Id,
      lines: [{ bankTransactionId: MISSING_ID }],
    });
    expect(unknownTx.status).toBe(404);

    const numberInjection = await postA('/api/v1/treasury/reconciliations', {
      accountId: bank1Id,
      number: `REC-1999-000001`,
      lines: [{ bankTransactionId: tx2 }],
    });
    expect(numberInjection.status).toBe(400); // la numeración es del servidor

    // PATCH de líneas: reemplaza el set (desmarca las salientes, reclama las entrantes).
    const replaced = await patchA(`/api/v1/treasury/reconciliations/${recon1Id}`, {
      lines: [{ bankTransactionId: tx3 }],
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.lines).toHaveLength(1);
    const txAfterReplace = await getA(`/api/v1/treasury/bank-transactions/${tx1}`);
    expect(txAfterReplace.body.data.reconciled).toBe(false); // desmarcada
    const tx3After = await getA(`/api/v1/treasury/bank-transactions/${tx3}`);
    expect(tx3After.body.data.reconciled).toBe(true); // reclamada

    // Re-editar líneas propias (tx3) + re-añadir una libre (tx1) es válido.
    const reAdd = await patchA(`/api/v1/treasury/reconciliations/${recon1Id}`, {
      lines: [{ bankTransactionId: tx1 }, { bankTransactionId: tx3 }],
    });
    expect(reAdd.status).toBe(200);
    expect(reAdd.body.data.lines).toHaveLength(2);
    const tx1Again = await getA(`/api/v1/treasury/bank-transactions/${tx1}`);
    expect(tx1Again.body.data.reconciled).toBe(true);

    const notesOnly = await patchA(`/api/v1/treasury/reconciliations/${recon1Id}`, {
      notes: 'ok',
    });
    expect(notesOnly.status).toBe(200);
    const emptyPatch = await patchA(`/api/v1/treasury/reconciliations/${recon1Id}`, {});
    expect(emptyPatch.status).toBe(400);

    const byAccount = await getA(`/api/v1/treasury/reconciliations?accountId=${bank1Id}`);
    expect((byAccount.body.data as Array<{ id: string }>).some((r) => r.id === recon1Id)).toBe(
      true,
    );
    const unknown = await getA(`/api/v1/treasury/reconciliations/${MISSING_ID}`);
    expect(unknown.status).toBe(404);
  });

  it('aislamiento: B no ve ni toca cuentas, dinero, líneas ni conciliaciones de A', async () => {
    const account = await request(app)
      .get(`/api/v1/treasury/accounts/${bank1Id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(account.status).toBe(404);

    const extract = await request(app)
      .get(`/api/v1/treasury/accounts/${bank1Id}/movements`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(extract.status).toBe(404);

    const payment = await request(app)
      .get(`/api/v1/treasury/payments/${payId2}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(payment.status).toBe(404);

    const receipt = await request(app)
      .get(`/api/v1/treasury/receipts/${rcpId1}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(receipt.status).toBe(404);

    const tx = await request(app)
      .get(`/api/v1/treasury/bank-transactions/${tx1}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(tx.status).toBe(404);

    const recon = await request(app)
      .get(`/api/v1/treasury/reconciliations/${recon1Id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(recon.status).toBe(404);

    const patchPayment = await request(app)
      .patch(`/api/v1/treasury/payments/${payId2}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ notes: 'hack' });
    expect(patchPayment.status).toBe(404);

    // FKs contra recursos de A → 404 uniforme (nada se escribe).
    const crossPayment = await request(app)
      .post('/api/v1/treasury/payments')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ accountId: bank1Id, amount: 10 });
    expect(crossPayment.status).toBe(404);
    const crossReceipt = await request(app)
      .post('/api/v1/treasury/receipts')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ accountId: bank1Id, amount: 10 });
    expect(crossReceipt.status).toBe(404);
    const crossTx = await request(app)
      .post('/api/v1/treasury/bank-transactions')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ accountId: bank1Id, amount: -10 });
    expect(crossTx.status).toBe(404);
    const crossRecon = await request(app)
      .post('/api/v1/treasury/reconciliations')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ accountId: bank1Id, lines: [{ bankTransactionId: tx1 }] });
    expect(crossRecon.status).toBe(404);

    // Listas de B vacías de dinero (nada del intento cruzado se materializó).
    const paymentsB = await request(app)
      .get('/api/v1/treasury/payments?limit=100')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(paymentsB.body.meta.total).toBe(0);
    const receiptsB = await request(app)
      .get('/api/v1/treasury/receipts?limit=100')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(receiptsB.body.meta.total).toBe(0);
    const txsB = await request(app)
      .get('/api/v1/treasury/bank-transactions?limit=100')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(txsB.body.meta.total).toBe(0);
    const reconsB = await request(app)
      .get('/api/v1/treasury/reconciliations?limit=100')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(reconsB.body.meta.total).toBe(0);

    // Contadores POR tenant: el primer pago de B también es PAY-…000001.
    const ownPayment = await request(app)
      .post('/api/v1/treasury/payments')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ accountId: bank1IdB, amount: 10 });
    expect(ownPayment.status).toBe(201);
    expect(ownPayment.body.data.number).toBe(`PAY-${YEAR}-000001`);
  });

  it('auditoría: creaciones, archivados, publicaciones y conciliaciones por tenant', async () => {
    const accounts = await getA('/api/v1/audit?action=bank.account.create&limit=50');
    expect(accounts.status).toBe(200);
    expect(
      (accounts.body.data as Array<{ entityId: string }>).some((e) => e.entityId === bank1Id),
    ).toBe(true);

    const archive = await getA(
      `/api/v1/audit?action=bank.account.update&entityId=${scrapId}&limit=50`,
    );
    expect(archive.status).toBe(200);
    expect(
      (archive.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'archived:true',
      ),
    ).toBe(true);

    const restore = await getA(
      `/api/v1/audit?action=bank.account.restore&entityId=${scrapId}&limit=50`,
    );
    expect(restore.status).toBe(200);
    expect(
      (restore.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'archived:false',
      ),
    ).toBe(true);

    const paymentPost = await getA(
      `/api/v1/audit?action=payment.update&entityId=${payId2}&limit=50`,
    );
    expect(paymentPost.status).toBe(200);
    expect(
      (paymentPost.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'status:posted',
      ),
    ).toBe(true);

    const receiptPost = await getA(
      `/api/v1/audit?action=receipt.update&entityId=${rcpId1}&limit=50`,
    );
    expect(receiptPost.status).toBe(200);
    expect(
      (receiptPost.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'status:posted',
      ),
    ).toBe(true);

    const txCreate = await getA(
      `/api/v1/audit?action=bank.transaction.create&entityId=${tx1}&limit=50`,
    );
    expect(txCreate.status).toBe(200);
    expect(txCreate.body.data.length).toBeGreaterThan(0);

    const reconCreate = await getA(
      `/api/v1/audit?action=reconciliation.create&entityId=${recon1Id}&limit=50`,
    );
    expect(reconCreate.status).toBe(200);
    expect(
      (reconCreate.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'lines:1',
      ),
    ).toBe(true);

    const reconUpdate = await getA(
      `/api/v1/audit?action=reconciliation.update&entityId=${recon1Id}&limit=50`,
    );
    expect(reconUpdate.status).toBe(200);
    expect(
      (reconUpdate.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'lines:2',
      ),
    ).toBe(true);

    const fromB = await request(app)
      .get('/api/v1/audit?action=bank.account.create&limit=50')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(fromB.status).toBe(200);
    expect(
      (fromB.body.data as Array<{ entityId: string }>).every((e) => e.entityId !== bank1Id),
    ).toBe(true);
  });
});
