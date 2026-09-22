/**
 * Seguridad Accounting — FASE 12.
 * 401 en las 4 rutas + el endpoint de posting, 403 con `details.permission`
 * por recurso, separación explícita de `accounting.journal:post` (actualizar
 * ≠ postear), token con `pv` obsoleta, validación estricta (tenantId/number/
 * status/totales/periodId/normalBalance), valores inválidos → 400/422,
 * queries inválidas, rutas DELETE ausentes (sin `:delete` en el catálogo) y
 * ausencia de datos internos en las respuestas.
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
    { path: '/api/v1/users', router: createUserRouter(deps) },
    { path: '/api/v1/roles', router: createRoleRouter(deps) },
    ...createAccountingRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';
let editorToken = '';
let accountId = '';
let revenueId = '';

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

describe('accounting security: permisos por recurso, post propio y esquemas estrictos', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_accounting_sec'), logger);

    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'ACCSEC',
        slug: 'acc-sec',
        owner: { email: 'accsec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(res.status).toBe(201);
    ownerToken = await login('accsec-owner@example.com');

    const post = (path: string, body: object) =>
      request(app).post(path).set('Authorization', `Bearer ${ownerToken}`).send(body);

    const account = await post('/api/v1/accounting/accounts', {
      code: 'sec-1000',
      name: 'Cuenta Seguridad',
      nature: 'asset',
    });
    expect(account.status).toBe(201);
    accountId = account.body.data.id as string;

    const revenue = await post('/api/v1/accounting/accounts', {
      code: 'sec-4100',
      name: 'Ingresos Seguridad',
      nature: 'revenue',
    });
    expect(revenue.status).toBe(201);
    revenueId = revenue.body.data.id as string;

    // Sin roles → sin permisos (denegación por defecto).
    const reader = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'accsec-reader@example.com',
        password: PASSWORD,
        displayName: 'Reader',
        roles: [],
      });
    expect(reader.status).toBe(201);
    readerToken = await login('accsec-reader@example.com');

    // Editor de asientos: puede crear/editar, pero NO postear (permiso separado).
    const role = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        key: 'journal-editor',
        name: 'Journal Editor',
        permissions: [
          'accounting.journal:read',
          'accounting.journal:create',
          'accounting.journal:update',
        ],
      });
    expect(role.status).toBe(201);
    const editor = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'accsec-editor@example.com',
        password: PASSWORD,
        displayName: 'Editor',
        roles: ['journal-editor'],
      });
    expect(editor.status).toBe(201);
    editorToken = await login('accsec-editor@example.com');
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 en las 4 rutas + /post sin token y con token manipulado', async () => {
    const lists = [
      '/api/v1/accounting/accounts',
      '/api/v1/accounting/journal-entries',
      '/api/v1/accounting/periods',
      '/api/v1/accounting/taxes',
    ];
    for (const path of lists) {
      const anon = await request(app).get(path);
      expect(anon.status, path).toBe(401);
      expect(anon.body.error.code).toBe('UNAUTHENTICATED');
    }

    const account = await request(app)
      .post('/api/v1/accounting/accounts')
      .send({ code: 'anon', name: 'Anon', nature: 'asset' });
    expect(account.status).toBe(401);

    const period = await request(app)
      .post('/api/v1/accounting/periods')
      .send({ code: '2030-01', startsAt: '2030-01-01', endsAt: '2030-01-31' });
    expect(period.status).toBe(401);

    const tax = await request(app)
      .post('/api/v1/accounting/taxes')
      .send({ code: 'anon', name: 'Anon', rate: 10 });
    expect(tax.status).toBe(401);

    const journal = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .send({ date: '2026-01-15', lines: [] });
    expect(journal.status).toBe(401);

    const post = await request(app).post(`/api/v1/accounting/journal-entries/${MISSING_ID}/post`);
    expect(post.status).toBe(401);

    const tampered = await request(app)
      .get('/api/v1/accounting/accounts')
      .set('Authorization', `Bearer ${ownerToken.slice(0, -4)}beef`);
    expect(tampered.status).toBe(401);
  });

  it('sin permisos: 403 con details.permission en lectura y escritura de cada recurso', async () => {
    const cases: ReadonlyArray<{
      readonly method: 'get' | 'post' | 'patch';
      readonly path: string;
      readonly permission: string;
      readonly body?: Record<string, unknown>;
    }> = [
      { method: 'get', path: '/api/v1/accounting/accounts', permission: 'accounting.account:read' },
      {
        method: 'post',
        path: '/api/v1/accounting/accounts',
        permission: 'accounting.account:create',
        body: { code: 'nope', name: 'Nope', nature: 'asset' },
      },
      {
        method: 'patch',
        path: `/api/v1/accounting/accounts/${MISSING_ID}`,
        permission: 'accounting.account:update',
        body: { name: 'Nope' },
      },
      {
        method: 'get',
        path: '/api/v1/accounting/journal-entries',
        permission: 'accounting.journal:read',
      },
      {
        method: 'post',
        path: '/api/v1/accounting/journal-entries',
        permission: 'accounting.journal:create',
        body: { date: '2026-01-15', lines: [] },
      },
      {
        method: 'patch',
        path: `/api/v1/accounting/journal-entries/${MISSING_ID}`,
        permission: 'accounting.journal:update',
        body: { notes: 'x' },
      },
      {
        method: 'post',
        path: `/api/v1/accounting/journal-entries/${MISSING_ID}/post`,
        permission: 'accounting.journal:post',
        body: {},
      },
      { method: 'get', path: '/api/v1/accounting/periods', permission: 'accounting.period:read' },
      {
        method: 'post',
        path: '/api/v1/accounting/periods',
        permission: 'accounting.period:create',
        body: { code: 'nope', startsAt: '2031-01-01', endsAt: '2031-01-31' },
      },
      {
        method: 'patch',
        path: `/api/v1/accounting/periods/${MISSING_ID}`,
        permission: 'accounting.period:update',
        body: { status: 'closed' },
      },
      { method: 'get', path: '/api/v1/accounting/taxes', permission: 'accounting.tax:read' },
      {
        method: 'post',
        path: '/api/v1/accounting/taxes',
        permission: 'accounting.tax:create',
        body: { code: 'nope', name: 'Nope', rate: 10 },
      },
      {
        method: 'patch',
        path: `/api/v1/accounting/taxes/${MISSING_ID}`,
        permission: 'accounting.tax:update',
        body: { rate: 20 },
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

  it('postear NO es actualizar: el editor edita asientos pero no los postea', async () => {
    const created = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        date: '2026-01-15',
        lines: [
          { accountId, debit: 10, credit: 0 },
          { accountId: revenueId, debit: 0, credit: 10 },
        ],
      });
    expect(created.status).toBe(201); // accounting.journal:create ✓
    const editorEntryId = created.body.data.id as string;

    const updated = await request(app)
      .patch(`/api/v1/accounting/journal-entries/${editorEntryId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ notes: 'nota del editor' });
    expect(updated.status).toBe(200); // accounting.journal:update ✓

    const post = await request(app)
      .post(`/api/v1/accounting/journal-entries/${editorEntryId}/post`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({});
    expect(post.status).toBe(403); // accounting.journal:post ✗ (aunque update exista)
    expect(post.body.error.details.permission).toBe('accounting.journal:post');

    const otherResource = await request(app)
      .get('/api/v1/accounting/accounts')
      .set('Authorization', `Bearer ${editorToken}`);
    expect(otherResource.status).toBe(403);
    expect(otherResource.body.error.details.permission).toBe('accounting.account:read');
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
      .get('/api/v1/accounting/accounts')
      .set('Authorization', `Bearer ${stale}`);
    expect(list.status).toBe(403);
    expect(list.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(200); // solo-autenticada sigue operativa
  });

  it('tenantId, campos derivados y campos SOLO-del-servidor inyectados → 400', async () => {
    const tenant = await request(app)
      .post('/api/v1/accounting/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'inj-1', name: 'X', nature: 'asset', tenantId: 'otro-tenant' });
    expect(tenant.status).toBe(400);
    expect(tenant.body.error.code).toBe('VALIDATION_ERROR');

    const normalBalance = await request(app)
      .post('/api/v1/accounting/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'inj-2', name: 'X', nature: 'asset', normalBalance: 'credit' });
    expect(normalBalance.status).toBe(400); // el saldo normal se DERIVA, nunca se escribe

    const archivedAccount = await request(app)
      .post('/api/v1/accounting/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'inj-3', name: 'X', nature: 'asset', archived: true });
    expect(archivedAccount.status).toBe(400); // todo nace activo

    const taxTenant = await request(app)
      .post('/api/v1/accounting/taxes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'inj-4', name: 'X', rate: 10, tenantId: 'otro-tenant' });
    expect(taxTenant.status).toBe(400);

    const periodStatus = await request(app)
      .post('/api/v1/accounting/periods')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'inj-5', startsAt: '2032-01-01', endsAt: '2032-01-31', status: 'closed' });
    expect(periodStatus.status).toBe(400); // los períodos nacen abiertos

    const periodArchived = await request(app)
      .post('/api/v1/accounting/periods')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'inj-6', startsAt: '2033-01-01', endsAt: '2033-01-31', archived: true });
    expect(periodArchived.status).toBe(400); // los períodos no se archivan

    const entryBase = {
      date: '2026-01-15',
      lines: [
        { accountId, debit: 5, credit: 0 },
        { accountId: revenueId, debit: 0, credit: 5 },
      ],
    };
    const entryTenant = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...entryBase, tenantId: 'otro-tenant' });
    expect(entryTenant.status).toBe(400);

    const entryNumber = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...entryBase, number: 'JE-1999-000001' });
    expect(entryNumber.status).toBe(400); // la numeración es del servidor

    const entryStatus = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...entryBase, status: 'posted' });
    expect(entryStatus.status).toBe(400); // nace draft, siempre

    const entryTotals = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...entryBase, debitTotal: 999, creditTotal: 999 });
    expect(entryTotals.status).toBe(400); // los calcula SOLO el servidor

    const entryPeriod = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...entryBase, periodId: MISSING_ID });
    expect(entryPeriod.status).toBe(400); // se asigna al postear

    const entryArchived = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...entryBase, archived: true });
    expect(entryArchived.status).toBe(400); // los asientos no se archivan
  });

  it('valores inválidos → 400; desbalance de asiento → 422 (nunca 500)', async () => {
    const accountCases: ReadonlyArray<{ readonly name: string; readonly body: object }> = [
      { name: 'naturaleza inexistente', body: { code: 'bad-1', name: 'X', nature: 'hacked' } },
      { name: 'código de un solo carácter', body: { code: 'x', name: 'X', nature: 'asset' } },
      { name: 'naturaleza vacía', body: { code: 'bad-2', name: 'X', nature: '' } },
    ];
    for (const testCase of accountCases) {
      const res = await request(app)
        .post('/api/v1/accounting/accounts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(testCase.body);
      expect(res.status, testCase.name).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }

    const rateTooHigh = await request(app)
      .post('/api/v1/accounting/taxes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'bad-rate', name: 'X', rate: 150 });
    expect(rateTooHigh.status).toBe(400);
    const rateNegative = await request(app)
      .post('/api/v1/accounting/taxes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'bad-rate-2', name: 'X', rate: -5 });
    expect(rateNegative.status).toBe(400);

    const badDates = await request(app)
      .post('/api/v1/accounting/periods')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'bad-3', startsAt: '2034-03-31', endsAt: '2034-03-01' });
    expect(badDates.status).toBe(400); // endsAt ≤ startsAt

    const journalBase = { date: '2026-01-15' };
    const bothSides = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        ...journalBase,
        lines: [
          { accountId, debit: 10, credit: 10 },
          { accountId: revenueId, debit: 0, credit: 20 },
        ],
      });
    expect(bothSides.status).toBe(400); // XOR: una cara por línea

    const bothZero = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        ...journalBase,
        lines: [
          { accountId, debit: 0, credit: 0 },
          { accountId: revenueId, debit: 0, credit: 0 },
        ],
      });
    expect(bothZero.status).toBe(400);

    const negative = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        ...journalBase,
        lines: [
          { accountId, debit: -10, credit: 0 },
          { accountId: revenueId, debit: 0, credit: 10 },
        ],
      });
    expect(negative.status).toBe(400);

    const oneLine = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...journalBase, lines: [{ accountId, debit: 10, credit: 0 }] });
    expect(oneLine.status).toBe(400); // mínimo 2 líneas

    const badCurrency = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        ...journalBase,
        currency: 'PESOS',
        lines: [
          { accountId, debit: 10, credit: 0 },
          { accountId: revenueId, debit: 0, credit: 10 },
        ],
      });
    expect(badCurrency.status).toBe(400); // ISO-4217 de 3 letras

    // DEBIT≠CREDIT pasa el esqueStricto (XOR ok) pero el SERVIDOR lo rechaza → 422.
    const unbalanced = await request(app)
      .post('/api/v1/accounting/journal-entries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        ...journalBase,
        lines: [
          { accountId, debit: 100, credit: 0 },
          { accountId: revenueId, debit: 0, credit: 90 },
        ],
      });
    expect(unbalanced.status).toBe(422);
    expect(unbalanced.body.error.code).toBe('DOMAIN_ERROR');
    expect(unbalanced.body.error.details).toEqual({ debits: 100, credits: 90 });
  });

  it('ids y queries con formato inválido → 400; DELETE no publicado → 404 (nunca 500)', async () => {
    const journal = await request(app)
      .get('/api/v1/accounting/journal-entries/not-an-id')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(journal.status).toBe(400);

    const patch = await request(app)
      .patch('/api/v1/accounting/accounts/xyz')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'X' });
    expect(patch.status).toBe(400);

    const badJournalStatus = await request(app)
      .get('/api/v1/accounting/journal-entries?status=hacked')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badJournalStatus.status).toBe(400);

    const badPeriodStatus = await request(app)
      .get('/api/v1/accounting/periods?status=hacked')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badPeriodStatus.status).toBe(400);

    const badAccountId = await request(app)
      .get('/api/v1/accounting/journal-entries?accountId=xyz')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badAccountId.status).toBe(400);

    const badPeriodId = await request(app)
      .get('/api/v1/accounting/journal-entries?periodId=xyz')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badPeriodId.status).toBe(400);

    const badArchived = await request(app)
      .get('/api/v1/accounting/accounts?archived=yes')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badArchived.status).toBe(400);

    const badPage = await request(app)
      .get('/api/v1/accounting/taxes?page=0&limit=1000')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badPage.status).toBe(400);

    // El catálogo no define `:delete` para accounting.* → rutas ausentes.
    const paths = ['/accounts', '/journal-entries', '/periods', '/taxes'];
    for (const path of paths) {
      const del = await request(app)
        .delete(`/api/v1/accounting${path}/${MISSING_ID}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(del.status, path).toBe(404); // ni siquiera para owner
    }
  });

  it('las respuestas de accounting no filtran tenantId internos ni secretos', async () => {
    const lists = [
      '/api/v1/accounting/accounts?limit=100',
      '/api/v1/accounting/journal-entries?limit=100',
      '/api/v1/accounting/periods?limit=100',
      '/api/v1/accounting/taxes?limit=100',
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
