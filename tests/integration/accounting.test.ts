/**
 * Integración Accounting — FASE 12.
 * Contra MongoDB real (memory server): plan contable (`code` único por
 * tenant e inmutable, saldo normal DERIVADO, sin DELETE publicado), maestro
 * de impuestos, períodos fiscales sin solape con máquina `open→closed` y
 * asientos de partida doble con invariante DEBIT=CREDIT (422), numeración
 * `JE-*`, publicación con permiso propio que resuelve el período fiscal
 * (sin período → 422; cerrado → 409) y aislamiento cruzado.
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
import { createAccountingRouters } from '../../apps/api/src/modules/accounting/index.js';

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
    ...createAccountingRouters(deps),
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

/** Asiento balanceado de 2 líneas (activo ↔ ingreso) para reutilizar. */
function balancedLines(accountId: string, revenueId: string, amount: number) {
  return [
    { accountId, debit: amount, credit: 0 },
    { accountId: revenueId, debit: 0, credit: amount },
  ];
}

describe('accounting: plan contable, períodos y asientos de partida doble', () => {
  let tokenA = '';
  let tokenB = '';
  let accountId = '';
  let revenueId = '';
  let archivedAccountId = '';
  let taxId = '';
  let period1Id = ''; // 2026-01 (queda abierta para publicar)
  let period2Id = ''; // 2026-02
  let entryId = '';
  let entry2Id = '';

  const postA = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const patchA = (path: string, body: object) =>
    request(app).patch(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const getA = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenA}`);

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_accounting'), logger);
    const a = await provision('acc-tenant-a', 'owner-a@acc.example');
    const b = await provision('acc-tenant-b', 'owner-b@acc.example');
    tokenA = a.token;
    tokenB = b.token;
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('cuentas: código normalizado/único e inmutable, saldo normal derivado y sin DELETE', async () => {
    const created = await postA('/api/v1/accounting/accounts', {
      code: ' caja 5 ',
      name: 'Caja chica',
      nature: 'asset',
      description: 'Efectivo en oficina',
    });
    expect(created.status).toBe(201);
    const account = created.body.data;
    expect(account.code).toBe('CAJA-5'); // mayúsculas y espacios → guiones
    expect(account.nature).toBe('asset');
    expect(account.normalBalance).toBe('debit'); // DERIVADO en el servidor
    expect(account.archived).toBe(false);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    accountId = account.id as string;

    const duplicate = await postA('/api/v1/accounting/accounts', {
      code: 'caja 5',
      name: 'Otra',
      nature: 'asset',
    });
    expect(duplicate.status).toBe(409); // mismo tenant, mismo código

    const foreignTenant = await request(app)
      .post('/api/v1/accounting/accounts')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ code: 'caja 5', name: 'Caja B', nature: 'asset' });
    expect(foreignTenant.status).toBe(201); // unicidad POR tenant (ADR-002)

    const revenue = await postA('/api/v1/accounting/accounts', {
      code: '4100',
      name: 'Ingresos de ventas',
      nature: 'revenue',
    });
    expect(revenue.status).toBe(201);
    expect(revenue.body.data.normalBalance).toBe('credit');
    revenueId = revenue.body.data.id as string;

    const patchCode = await patchA(`/api/v1/accounting/accounts/${accountId}`, { code: 'OTRO' });
    expect(patchCode.status).toBe(400); // código inmutable (no existe en PATCH)
    const patchNature = await patchA(`/api/v1/accounting/accounts/${accountId}`, {
      nature: 'liability',
    });
    expect(patchNature.status).toBe(400); // naturaleza inmutable
    const patchNormalBalance = await patchA(`/api/v1/accounting/accounts/${accountId}`, {
      normalBalance: 'credit',
    });
    expect(patchNormalBalance.status).toBe(400); // jamás es escribible

    const updated = await patchA(`/api/v1/accounting/accounts/${accountId}`, { name: 'Caja' });
    expect(updated.status).toBe(200);

    const invalidCode = await postA('/api/v1/accounting/accounts', {
      code: 'x',
      name: 'X',
      nature: 'asset',
    });
    expect(invalidCode.status).toBe(400);
    const invalidNature = await postA('/api/v1/accounting/accounts', {
      code: 'otra-cta',
      name: 'X',
      nature: 'hacked',
    });
    expect(invalidNature.status).toBe(400);

    // Sin `accounting.account:delete` en el catálogo: DELETE NO publicado.
    const del = await request(app)
      .delete(`/api/v1/accounting/accounts/${accountId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(404); // ruta ausente incluso para owner

    // Archivar vía PATCH {archived} (update); doble archivar → 409.
    const scrap = await postA('/api/v1/accounting/accounts', {
      code: 'scrap-acc',
      name: 'Cuenta obsoleta',
      nature: 'expense',
    });
    expect(scrap.status).toBe(201);
    archivedAccountId = scrap.body.data.id as string;
    const archived = await patchA(`/api/v1/accounting/accounts/${archivedAccountId}`, {
      archived: true,
    });
    expect(archived.status).toBe(200);
    expect(archived.body.data.archived).toBe(true);
    const twice = await patchA(`/api/v1/accounting/accounts/${archivedAccountId}`, {
      archived: true,
    });
    expect(twice.status).toBe(409);
    const restored = await patchA(`/api/v1/accounting/accounts/${archivedAccountId}`, {
      archived: false,
    });
    expect(restored.status).toBe(200);
    const restoredTwice = await patchA(`/api/v1/accounting/accounts/${archivedAccountId}`, {
      archived: false,
    });
    expect(restoredTwice.status).toBe(409);
    const reArchive = await patchA(`/api/v1/accounting/accounts/${archivedAccountId}`, {
      archived: true,
    });
    expect(reArchive.status).toBe(200); // queda archivada para el test de líneas

    const archivedList = await getA('/api/v1/accounting/accounts?archived=true');
    expect(archivedList.status).toBe(200);
    expect(
      (archivedList.body.data as Array<{ id: string }>).some((a) => a.id === archivedAccountId),
    ).toBe(true);
    const activeList = await getA('/api/v1/accounting/accounts?archived=false');
    expect(
      (activeList.body.data as Array<{ id: string }>).some((a) => a.id === archivedAccountId),
    ).toBe(false);

    const unknown = await getA(`/api/v1/accounting/accounts/${MISSING_ID}`);
    expect(unknown.status).toBe(404);
  });

  it('impuestos: tasas 0-100, código inmutable/único y archivado sin DELETE', async () => {
    const created = await postA('/api/v1/accounting/taxes', {
      code: ' vat 16 ',
      name: 'IVA 16%',
      rate: 16,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.code).toBe('VAT-16');
    expect(created.body.data.rate).toBe(16);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    taxId = created.body.data.id as string;

    const duplicate = await postA('/api/v1/accounting/taxes', {
      code: 'vat-16', // normaliza a VAT-16 (el ya creado)
      name: 'Dup',
      rate: 10,
    });
    expect(duplicate.status).toBe(409);

    const tooHigh = await postA('/api/v1/accounting/taxes', {
      code: 'vat-999',
      name: 'Nope',
      rate: 150,
    });
    expect(tooHigh.status).toBe(400);
    const negative = await postA('/api/v1/accounting/taxes', {
      code: 'vat-neg',
      name: 'Nope',
      rate: -5,
    });
    expect(negative.status).toBe(400);

    const updated = await patchA(`/api/v1/accounting/taxes/${taxId}`, {
      rate: 19,
      name: 'IVA 19%',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.rate).toBe(19);

    const patchCode = await patchA(`/api/v1/accounting/taxes/${taxId}`, { code: 'OTRO' });
    expect(patchCode.status).toBe(400); // inmutable

    const del = await request(app)
      .delete(`/api/v1/accounting/taxes/${taxId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(404); // sin `accounting.tax:delete` → ruta ausente

    const archived = await patchA(`/api/v1/accounting/taxes/${taxId}`, { archived: true });
    expect(archived.status).toBe(200);
    const twice = await patchA(`/api/v1/accounting/taxes/${taxId}`, { archived: true });
    expect(twice.status).toBe(409);
    await patchA(`/api/v1/accounting/taxes/${taxId}`, { archived: false }); // se restaura

    const unknown = await getA(`/api/v1/accounting/taxes/${MISSING_ID}`);
    expect(unknown.status).toBe(404);
  });

  it('períodos: código único, SIN solape y máquina open→closed (sin DELETE)', async () => {
    const january = await postA('/api/v1/accounting/periods', {
      code: '2026-01',
      name: 'Enero 2026',
      startsAt: '2026-01-01',
      endsAt: '2026-01-31',
    });
    expect(january.status).toBe(201);
    expect(january.body.data.status).toBe('open');
    expect(JSON.stringify(january.body)).not.toContain('tenantId');
    period1Id = january.body.data.id as string;

    const february = await postA('/api/v1/accounting/periods', {
      code: '2026-02',
      startsAt: '2026-02-01',
      endsAt: '2026-02-28',
    });
    expect(february.status).toBe(201); // contiguo NO solapa
    period2Id = february.body.data.id as string;

    const duplicateCode = await postA('/api/v1/accounting/periods', {
      code: '2026-01',
      startsAt: '2027-01-01',
      endsAt: '2027-01-31',
    });
    expect(duplicateCode.status).toBe(409); // código único (fechas sin solape)
    expect(duplicateCode.body.error.message).toBe('Code already exists');

    const overlap = await postA('/api/v1/accounting/periods', {
      code: '2026-01b',
      startsAt: '2026-01-20',
      endsAt: '2026-02-10',
    });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.message).toBe('Fiscal period overlaps an existing period');

    const badDates = await postA('/api/v1/accounting/periods', {
      code: '2026-03',
      startsAt: '2026-03-31',
      endsAt: '2026-03-01',
    });
    expect(badDates.status).toBe(400);

    const invalidCode = await postA('/api/v1/accounting/periods', {
      code: 'x',
      startsAt: '2026-04-01',
      endsAt: '2026-04-30',
    });
    expect(invalidCode.status).toBe(400);

    const sameOpen = await patchA(`/api/v1/accounting/periods/${period1Id}`, { status: 'open' });
    expect(sameOpen.status).toBe(409); // mismo estado

    const closeFebruary = await patchA(`/api/v1/accounting/periods/${period2Id}`, {
      status: 'closed',
    });
    expect(closeFebruary.status).toBe(200);
    expect(closeFebruary.body.data.status).toBe('closed');
    const closeAgain = await patchA(`/api/v1/accounting/periods/${period2Id}`, {
      status: 'closed',
    });
    expect(closeAgain.status).toBe(409);
    const reopen = await patchA(`/api/v1/accounting/periods/${period2Id}`, { status: 'open' });
    expect(reopen.status).toBe(409); // closed es terminal (sin re-apertura)

    const patchCode = await patchA(`/api/v1/accounting/periods/${period1Id}`, { code: 'hack' });
    expect(patchCode.status).toBe(400); // código y fechas inmutables
    const patchDates = await patchA(`/api/v1/accounting/periods/${period1Id}`, {
      startsAt: '2025-12-01',
    });
    expect(patchDates.status).toBe(400);
    const rename = await patchA(`/api/v1/accounting/periods/${period1Id}`, { name: 'Ene 2026' });
    expect(rename.status).toBe(200);

    const del = await request(app)
      .delete(`/api/v1/accounting/periods/${period1Id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(404); // sin `accounting.period:delete` → ruta ausente

    const closedList = await getA('/api/v1/accounting/periods?status=closed');
    expect(closedList.status).toBe(200);
    expect((closedList.body.data as Array<{ id: string }>).some((p) => p.id === period2Id)).toBe(
      true,
    );

    const unknown = await getA(`/api/v1/accounting/periods/${MISSING_ID}`);
    expect(unknown.status).toBe(404);
  });

  it('asientos: JE-*, XOR por línea e invariante DEBIT=CREDIT (422)', async () => {
    const created = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      currency: 'usd',
      lines: [
        { accountId, debit: 100, credit: 0, description: 'Apertura de caja' },
        { accountId: revenueId, debit: 0, credit: 100 },
      ],
      reference: 'REF-001',
      notes: 'Asiento de prueba',
    });
    expect(created.status).toBe(201);
    const entry = created.body.data;
    expect(entry.number).toBe(`JE-${YEAR}-000001`);
    expect(entry.currency).toBe('USD'); // normalizada a mayúsculas
    expect(entry.debitTotal).toBe(100);
    expect(entry.creditTotal).toBe(100);
    expect(entry.status).toBe('draft');
    expect(entry.periodId).toBeNull(); // se asigna al postear
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    entryId = entry.id as string;

    const unbalanced = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      lines: balancedLines(accountId, revenueId, 100),
    });
    // balancedLines devuelve balanceado… forzamos el desbalance explícito:
    expect(unbalanced.status).toBe(201); // (sanity: el helper SÍ está balanceado)
    const reallyUnbalanced = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      lines: [
        { accountId, debit: 100, credit: 0 },
        { accountId: revenueId, debit: 0, credit: 90 },
      ],
    });
    expect(reallyUnbalanced.status).toBe(422);
    expect(reallyUnbalanced.body.error.code).toBe('DOMAIN_ERROR');
    expect(reallyUnbalanced.body.error.details).toEqual({ debits: 100, credits: 90 });

    const bothSides = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      lines: [
        { accountId, debit: 10, credit: 10 },
        { accountId: revenueId, debit: 0, credit: 20 },
      ],
    });
    expect(bothSides.status).toBe(400); // XOR: una cara por línea

    const bothZero = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      lines: [
        { accountId, debit: 0, credit: 0 },
        { accountId: revenueId, debit: 0, credit: 0 },
      ],
    });
    expect(bothZero.status).toBe(400);

    const oneLine = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      lines: [{ accountId, debit: 10, credit: 0 }],
    });
    expect(oneLine.status).toBe(400); // mínimo 2 líneas (doble partida)

    const emptyLines = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      lines: [],
    });
    expect(emptyLines.status).toBe(400);

    const unknownAccount = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      lines: balancedLines(MISSING_ID, revenueId, 10),
    });
    expect(unknownAccount.status).toBe(404); // FK uniforme

    const archivedLine = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      lines: [
        { accountId: archivedAccountId, debit: 50, credit: 0 },
        { accountId: revenueId, debit: 0, credit: 50 },
      ],
    });
    expect(archivedLine.status).toBe(409);
    expect(archivedLine.body.error.message).toBe('Account is archived');

    const badCurrency = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      currency: 'PESOS',
      lines: balancedLines(accountId, revenueId, 10),
    });
    expect(badCurrency.status).toBe(400);

    // Campos SOLO-los-escribe-el-servidor → 400 (estricto, ADR-002).
    const tenantInjection = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      lines: balancedLines(accountId, revenueId, 10),
      tenantId: 'otro-tenant',
    });
    expect(tenantInjection.status).toBe(400);
    const numberInjection = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      lines: balancedLines(accountId, revenueId, 10),
      number: `JE-1999-000001`,
    });
    expect(numberInjection.status).toBe(400);
    const statusInjection = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      lines: balancedLines(accountId, revenueId, 10),
      status: 'posted',
    });
    expect(statusInjection.status).toBe(400); // nace draft, siempre
    const totalsInjection = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      lines: balancedLines(accountId, revenueId, 10),
      debitTotal: 999,
    });
    expect(totalsInjection.status).toBe(400); // los calcula el servidor
    const periodInjection = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      lines: balancedLines(accountId, revenueId, 10),
      periodId: MISSING_ID,
    });
    expect(periodInjection.status).toBe(400);
    const archivedInjection = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-15',
      lines: balancedLines(accountId, revenueId, 10),
      archived: true,
    });
    expect(archivedInjection.status).toBe(400); // los asientos no se archivan

    // El servidor re-valida el balance también en PATCH de líneas (draft).
    const patchUnbalanced = await patchA(`/api/v1/accounting/journal-entries/${entryId}`, {
      lines: [
        { accountId, debit: 80, credit: 0 },
        { accountId: revenueId, debit: 0, credit: 70 },
      ],
    });
    expect(patchUnbalanced.status).toBe(422);

    const patchBalanced = await patchA(`/api/v1/accounting/journal-entries/${entryId}`, {
      reference: 'REF-002',
    });
    expect(patchBalanced.status).toBe(200);
    expect(patchBalanced.body.data.reference).toBe('REF-002');

    const emptyPatch = await patchA(`/api/v1/accounting/journal-entries/${entryId}`, {});
    expect(emptyPatch.status).toBe(400);
  });

  it('posting: endpoint propio con accounting.journal:post resuelve el período fiscal', async () => {
    const posted = await postA(`/api/v1/accounting/journal-entries/${entryId}/post`, {});
    expect(posted.status).toBe(200);
    expect(posted.body.data.status).toBe('posted');
    expect(posted.body.data.periodId).toBe(period1Id); // cubre 2026-01-15 y está abierta

    const byPeriod = await getA(`/api/v1/accounting/journal-entries?periodId=${period1Id}`);
    expect(byPeriod.status).toBe(200);
    expect((byPeriod.body.data as Array<{ id: string }>).some((e) => e.id === entryId)).toBe(true);

    const byAccount = await getA(`/api/v1/accounting/journal-entries?accountId=${revenueId}`);
    expect(byAccount.status).toBe(200); // extracto de la cuenta
    expect((byAccount.body.data as Array<{ id: string }>).some((e) => e.id === entryId)).toBe(true);

    const postedList = await getA('/api/v1/accounting/journal-entries?status=posted');
    expect(postedList.status).toBe(200);
    expect((postedList.body.data as Array<{ id: string }>).some((e) => e.id === entryId)).toBe(
      true,
    );

    // `posted` es terminal: doble posting y edición → 409.
    const doublePost = await postA(`/api/v1/accounting/journal-entries/${entryId}/post`, {});
    expect(doublePost.status).toBe(409);
    expect(doublePost.body.error.message).toBe('Only draft journal entries can be posted');
    const editPosted = await patchA(`/api/v1/accounting/journal-entries/${entryId}`, {
      notes: 'intentando editar',
    });
    expect(editPosted.status).toBe(409);
    const cancelPosted = await patchA(`/api/v1/accounting/journal-entries/${entryId}`, {
      status: 'cancelled',
    });
    expect(cancelPosted.status).toBe(409);

    // Borrador 2: el PATCH a `posted` indica el endpoint de posting.
    const draft2 = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-16',
      lines: balancedLines(accountId, revenueId, 55),
    });
    expect(draft2.status).toBe(201);
    entry2Id = draft2.body.data.id as string;
    const viaPatch = await patchA(`/api/v1/accounting/journal-entries/${entry2Id}`, {
      status: 'posted',
    });
    expect(viaPatch.status).toBe(409);
    expect(viaPatch.body.error.message).toBe('Posting requires the post endpoint');

    const cancelled = await patchA(`/api/v1/accounting/journal-entries/${entry2Id}`, {
      status: 'cancelled',
    });
    expect(cancelled.status).toBe(200); // draft → cancelled vía update
    const editCancelled = await patchA(`/api/v1/accounting/journal-entries/${entry2Id}`, {
      notes: 'x',
    });
    expect(editCancelled.status).toBe(409);
    const postCancelled = await postA(`/api/v1/accounting/journal-entries/${entry2Id}/post`, {});
    expect(postCancelled.status).toBe(409);
    const cancelledList = await getA('/api/v1/accounting/journal-entries?status=cancelled');
    expect((cancelledList.body.data as Array<{ id: string }>).some((e) => e.id === entry2Id)).toBe(
      true,
    );

    // Sin período que cubra la fecha → 422 (nada escrito).
    const withoutPeriod = await postA('/api/v1/accounting/journal-entries', {
      date: '2027-06-01',
      lines: balancedLines(accountId, revenueId, 10),
    });
    expect(withoutPeriod.status).toBe(201);
    const noPeriodPost = await postA(
      `/api/v1/accounting/journal-entries/${withoutPeriod.body.data.id as string}/post`,
      {},
    );
    expect(noPeriodPost.status).toBe(422);
    expect(noPeriodPost.body.error.code).toBe('DOMAIN_ERROR');
    expect(noPeriodPost.body.error.message).toBe('No fiscal period covers the entry date');

    // Período cerrado → 409 con el código del período en `details`.
    const closeJanuary = await patchA(`/api/v1/accounting/periods/${period1Id}`, {
      status: 'closed',
    });
    expect(closeJanuary.status).toBe(200);
    const inClosed = await postA('/api/v1/accounting/journal-entries', {
      date: '2026-01-20',
      lines: balancedLines(accountId, revenueId, 10),
    });
    expect(inClosed.status).toBe(201);
    const inClosedPost = await postA(
      `/api/v1/accounting/journal-entries/${inClosed.body.data.id as string}/post`,
      {},
    );
    expect(inClosedPost.status).toBe(409);
    expect(inClosedPost.body.error.message).toBe('Fiscal period is closed');
    expect(inClosedPost.body.error.details.period).toBe('2026-01');
    // El borrador sigue siendo editable aunque su período esté cerrado.
    const editDraft = await patchA(
      `/api/v1/accounting/journal-entries/${inClosed.body.data.id as string}`,
      { notes: 'todavía borrador' },
    );
    expect(editDraft.status).toBe(200);

    const del = await request(app)
      .delete(`/api/v1/accounting/journal-entries/${entryId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(404); // sin `accounting.journal:delete` → ruta ausente

    const unknown = await getA(`/api/v1/accounting/journal-entries/${MISSING_ID}`);
    expect(unknown.status).toBe(404);
  });

  it('aislamiento: B no ve ni toca cuentas, impuestos, períodos ni asientos de A', async () => {
    const account = await request(app)
      .get(`/api/v1/accounting/accounts/${accountId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(account.status).toBe(404);

    const tax = await request(app)
      .get(`/api/v1/accounting/taxes/${taxId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(tax.status).toBe(404);

    const period = await request(app)
      .get(`/api/v1/accounting/periods/${period1Id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(period.status).toBe(404);

    const entry = await request(app)
      .get(`/api/v1/accounting/journal-entries/${entryId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(entry.status).toBe(404);

    const patchEntry = await request(app)
      .patch(`/api/v1/accounting/journal-entries/${entryId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ notes: 'hack' });
    expect(patchEntry.status).toBe(404);

    const postEntry = await request(app)
      .post(`/api/v1/accounting/journal-entries/${entryId}/post`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({});
    expect(postEntry.status).toBe(404); // el recurso no existe para B (no 403)

    const crossAccount = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        date: '2026-01-15',
        lines: balancedLines(accountId, revenueId, 10),
      });
    expect(crossAccount.status).toBe(404); // cuenta de A → FK uniforme

    const entriesB = await request(app)
      .get('/api/v1/accounting/journal-entries?limit=100')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(entriesB.status).toBe(200);
    expect(entriesB.body.meta.total).toBe(0); // el intento fallido no escribió

    // Claves naturales POR tenant: B puede reutilizar el código de A.
    const sameCode = await request(app)
      .post('/api/v1/accounting/periods')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ code: '2026-01', startsAt: '2026-01-01', endsAt: '2026-01-31' });
    expect(sameCode.status).toBe(201); // unicidad compuesta (tenantId, code)
  });

  it('auditoría: creaciones, cierres y posting de asientos por tenant', async () => {
    const accounts = await getA('/api/v1/audit?action=accounting.account.create&limit=50');
    expect(accounts.status).toBe(200);
    expect(
      (accounts.body.data as Array<{ entityId: string }>).some((e) => e.entityId === accountId),
    ).toBe(true);

    const taxes = await getA('/api/v1/audit?action=accounting.tax.create&limit=50');
    expect(taxes.status).toBe(200);
    expect((taxes.body.data as Array<{ entityId: string }>).some((e) => e.entityId === taxId)).toBe(
      true,
    );

    const closes = await getA(
      `/api/v1/audit?action=accounting.period.update&entityId=${period2Id}&limit=50`,
    );
    expect(closes.status).toBe(200);
    expect(
      (closes.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'status:closed',
      ),
    ).toBe(true);

    const creates = await getA(
      `/api/v1/audit?action=accounting.journal.create&entityId=${entryId}&limit=50`,
    );
    expect(creates.status).toBe(200);
    expect(
      (creates.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'debitTotal:100',
      ),
    ).toBe(true);

    const posts = await getA(
      `/api/v1/audit?action=accounting.journal.post&entityId=${entryId}&limit=50`,
    );
    expect(posts.status).toBe(200);
    expect(
      (posts.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'status:posted',
      ),
    ).toBe(true);

    const cancels = await getA(
      `/api/v1/audit?action=accounting.journal.update&entityId=${entry2Id}&limit=50`,
    );
    expect(cancels.status).toBe(200);
    expect(
      (cancels.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'status:cancelled',
      ),
    ).toBe(true);

    const fromB = await request(app)
      .get('/api/v1/audit?action=accounting.account.create&limit=50')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(fromB.status).toBe(200);
    expect(
      (fromB.body.data as Array<{ entityId: string }>).every((e) => e.entityId !== accountId),
    ).toBe(true);
  });
});
