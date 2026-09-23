/**
 * Seguridad Treasury — FASE 13.
 * 401 en las 5 rutas (+ sub-ruta de extracto), 403 con `details.permission`
 * por recurso (líneas de banco viajan sobre `bank.account:*`), separación
 * explícita crear ≠ actualizar (la publicación de dinero va con `:update` —
 * el catálogo no define `payment:post`), token con `pv` obsoleta, esquemas
 * estrictos (tenantId/number/status/balance/reconciliationId), valores
 * inválidos → 400 y guardia de saldo → 422 (nunca 500), queries inválidas,
 * rutas DELETE/mutaciones de extracto ausentes (→ 404) y ausencia de datos
 * internos en las respuestas.
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
    { path: '/api/v1/users', router: createUserRouter(deps) },
    { path: '/api/v1/roles', router: createRoleRouter(deps) },
    ...createTreasuryRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';
let creatorToken = '';
let accountId = '';

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

describe('treasury security: permisos por recurso, esquemas estrictos y guardias', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_treasury_sec'), logger);

    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'TRESEC',
        slug: 'tre-sec',
        owner: { email: 'tresec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(res.status).toBe(201);
    ownerToken = await login('tresec-owner@example.com');

    const account = await request(app)
      .post('/api/v1/treasury/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'bank', code: 'SEC-BANCO', name: 'Banco Seguridad', openingBalance: 100 });
    expect(account.status).toBe(201);
    accountId = account.body.data.id as string;

    // Sin roles → sin permisos (denegación por defecto).
    const reader = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'tresec-reader@example.com',
        password: PASSWORD,
        displayName: 'Reader',
        roles: [],
      });
    expect(reader.status).toBe(201);
    readerToken = await login('tresec-reader@example.com');

    // Creador de pagos SIN `payment:update`: crear ≠ actualizar (y por tanto
    // ≠ publicar: la publicación va con `:update`, sin `payment:post`).
    const role = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        key: 'payment-creator',
        name: 'Payment Creator',
        permissions: ['payment:read', 'payment:create'],
      });
    expect(role.status).toBe(201);
    const creator = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'tresec-creator@example.com',
        password: PASSWORD,
        displayName: 'Creator',
        roles: ['payment-creator'],
      });
    expect(creator.status).toBe(201);
    creatorToken = await login('tresec-creator@example.com');
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 en las 5 rutas, el extracto y las escrituras sin token o manipulado', async () => {
    const lists = [
      '/api/v1/treasury/accounts',
      '/api/v1/treasury/payments',
      '/api/v1/treasury/receipts',
      '/api/v1/treasury/bank-transactions',
      '/api/v1/treasury/reconciliations',
    ];
    for (const path of lists) {
      const anon = await request(app).get(path);
      expect(anon.status, path).toBe(401);
      expect(anon.body.error.code).toBe('UNAUTHENTICATED');
    }

    const extract = await request(app).get(`/api/v1/treasury/accounts/${MISSING_ID}/movements`);
    expect(extract.status).toBe(401);

    const posts: ReadonlyArray<{ readonly path: string; readonly body: object }> = [
      {
        path: '/api/v1/treasury/accounts',
        body: { type: 'bank', code: 'ANON', name: 'Anon' },
      },
      { path: '/api/v1/treasury/payments', body: { accountId: MISSING_ID, amount: 1 } },
      { path: '/api/v1/treasury/receipts', body: { accountId: MISSING_ID, amount: 1 } },
      {
        path: '/api/v1/treasury/bank-transactions',
        body: { accountId: MISSING_ID, amount: -1 },
      },
      {
        path: '/api/v1/treasury/reconciliations',
        body: { accountId: MISSING_ID, lines: [{ bankTransactionId: MISSING_ID }] },
      },
    ];
    for (const post of posts) {
      const anon = await request(app).post(post.path).send(post.body);
      expect(anon.status, post.path).toBe(401);
    }

    const anonPatch = await request(app)
      .patch(`/api/v1/treasury/payments/${MISSING_ID}`)
      .send({ notes: 'x' });
    expect(anonPatch.status).toBe(401);

    const tampered = await request(app)
      .get('/api/v1/treasury/accounts')
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
      { method: 'get', path: '/api/v1/treasury/accounts', permission: 'bank.account:read' },
      {
        method: 'post',
        path: '/api/v1/treasury/accounts',
        permission: 'bank.account:create',
        body: { type: 'bank', code: 'nope', name: 'Nope' },
      },
      {
        method: 'patch',
        path: `/api/v1/treasury/accounts/${MISSING_ID}`,
        permission: 'bank.account:update',
        body: { name: 'Nope' },
      },
      {
        method: 'get',
        path: `/api/v1/treasury/accounts/${MISSING_ID}/movements`,
        permission: 'bank.account:read',
      },
      { method: 'get', path: '/api/v1/treasury/payments', permission: 'payment:read' },
      {
        method: 'post',
        path: '/api/v1/treasury/payments',
        permission: 'payment:create',
        body: { accountId: MISSING_ID, amount: 1 },
      },
      {
        method: 'patch',
        path: `/api/v1/treasury/payments/${MISSING_ID}`,
        permission: 'payment:update',
        body: { notes: 'x' },
      },
      { method: 'get', path: '/api/v1/treasury/receipts', permission: 'receipt:read' },
      {
        method: 'post',
        path: '/api/v1/treasury/receipts',
        permission: 'receipt:create',
        body: { accountId: MISSING_ID, amount: 1 },
      },
      {
        method: 'patch',
        path: `/api/v1/treasury/receipts/${MISSING_ID}`,
        permission: 'receipt:update',
        body: { notes: 'x' },
      },
      // Las líneas de banco viajan sobre `bank.account:*` (sin `bank.transaction:*`).
      {
        method: 'get',
        path: '/api/v1/treasury/bank-transactions',
        permission: 'bank.account:read',
      },
      {
        method: 'post',
        path: '/api/v1/treasury/bank-transactions',
        permission: 'bank.account:create',
        body: { accountId: MISSING_ID, amount: -1 },
      },
      {
        method: 'patch',
        path: `/api/v1/treasury/bank-transactions/${MISSING_ID}`,
        permission: 'bank.account:update',
        body: { description: 'x' },
      },
      {
        method: 'get',
        path: '/api/v1/treasury/reconciliations',
        permission: 'reconciliation:read',
      },
      {
        method: 'post',
        path: '/api/v1/treasury/reconciliations',
        permission: 'reconciliation:create',
        body: { accountId: MISSING_ID, lines: [{ bankTransactionId: MISSING_ID }] },
      },
      {
        method: 'patch',
        path: `/api/v1/treasury/reconciliations/${MISSING_ID}`,
        permission: 'reconciliation:update',
        body: { notes: 'x' },
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

  it('crear NO es actualizar: el creador crea pagos pero no los publica (sin :post)', async () => {
    const created = await request(app)
      .post('/api/v1/treasury/payments')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ accountId, amount: 10, notes: 'del creador' });
    expect(created.status).toBe(201); // payment:create ✓
    const editorPaymentId = created.body.data.id as string;

    const updated = await request(app)
      .patch(`/api/v1/treasury/payments/${editorPaymentId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ notes: 'editado sin update' });
    expect(updated.status).toBe(403); // payment:update ✗ → la publicación (PATCH) también queda denegada
    expect(updated.body.error.details.permission).toBe('payment:update');

    const read = await request(app)
      .get('/api/v1/treasury/payments')
      .set('Authorization', `Bearer ${creatorToken}`);
    expect(read.status).toBe(200); // payment:read ✓

    // El catálogo NO define `payment:post`: publicar es `PATCH :update`.
    const posted = await request(app)
      .patch(`/api/v1/treasury/payments/${editorPaymentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'posted' });
    expect(posted.status).toBe(200);
    expect(posted.body.data.status).toBe('posted');

    const account = await request(app)
      .get(`/api/v1/treasury/accounts/${accountId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(account.body.data.balance).toBe(90); // 100 − 10: el dinero se movió UNA vez

    const otherResource = await request(app)
      .get('/api/v1/treasury/accounts')
      .set('Authorization', `Bearer ${creatorToken}`);
    expect(otherResource.status).toBe(403);
    expect(otherResource.body.error.details.permission).toBe('bank.account:read');
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
      .get('/api/v1/treasury/accounts')
      .set('Authorization', `Bearer ${stale}`);
    expect(list.status).toBe(403);
    expect(list.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(200); // solo-autenticada sigue operativa
  });

  it('tenantId y campos SOLO-del-servidor inyectados → 400 (estricto, ADR-002)', async () => {
    const accountTenant = await request(app)
      .post('/api/v1/treasury/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'bank', code: 'inj-1', name: 'X', tenantId: 'otro-tenant' });
    expect(accountTenant.status).toBe(400);
    expect(accountTenant.body.error.code).toBe('VALIDATION_ERROR');

    const accountArchived = await request(app)
      .post('/api/v1/treasury/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'bank', code: 'inj-2', name: 'X', archived: true });
    expect(accountArchived.status).toBe(400); // nace activo

    const accountBalance = await request(app)
      .post('/api/v1/treasury/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'cash', code: 'inj-3', name: 'X', balance: 9_999 });
    expect(accountBalance.status).toBe(400); // proyección server-only

    const accountTypePatch = await request(app)
      .patch(`/api/v1/treasury/accounts/${accountId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'cash' });
    expect(accountTypePatch.status).toBe(400); // tipo inmutable

    const paymentBase = { accountId, amount: 1 };
    const paymentTenant = await request(app)
      .post('/api/v1/treasury/payments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...paymentBase, tenantId: 'otro-tenant' });
    expect(paymentTenant.status).toBe(400);

    const paymentNumber = await request(app)
      .post('/api/v1/treasury/payments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...paymentBase, number: 'PAY-1999-000001' });
    expect(paymentNumber.status).toBe(400); // la numeración es del servidor

    const paymentStatus = await request(app)
      .post('/api/v1/treasury/payments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...paymentBase, status: 'posted' });
    expect(paymentStatus.status).toBe(400); // nace draft, siempre

    const receiptNumber = await request(app)
      .post('/api/v1/treasury/receipts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...paymentBase, number: 'RCP-1999-000001' });
    expect(receiptNumber.status).toBe(400);

    const txReconciliation = await request(app)
      .post('/api/v1/treasury/bank-transactions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ accountId, amount: -1, reconciliationId: MISSING_ID });
    expect(txReconciliation.status).toBe(400); // server-only

    const txReconciled = await request(app)
      .post('/api/v1/treasury/bank-transactions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ accountId, amount: -1, reconciled: true });
    expect(txReconciled.status).toBe(400); // derivado, jamás escribible

    const reconNumber = await request(app)
      .post('/api/v1/treasury/reconciliations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        accountId,
        number: 'REC-1999-000001',
        lines: [{ bankTransactionId: MISSING_ID }],
      });
    expect(reconNumber.status).toBe(400);
  });

  it('valores inválidos → 400; saldo insuficiente → 422 (nunca 500, nada escrito)', async () => {
    const badType = await request(app)
      .post('/api/v1/treasury/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'hacked', code: 'bad-1', name: 'X' });
    expect(badType.status).toBe(400);
    const negativeOpening = await request(app)
      .post('/api/v1/treasury/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'cash', code: 'bad-2', name: 'X', openingBalance: -1 });
    expect(negativeOpening.status).toBe(400);
    const badCode = await request(app)
      .post('/api/v1/treasury/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'cash', code: 'x', name: 'X' });
    expect(badCode.status).toBe(400);

    const zeroAmount = await request(app)
      .post('/api/v1/treasury/payments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ accountId, amount: 0 });
    expect(zeroAmount.status).toBe(400);
    const negativeAmount = await request(app)
      .post('/api/v1/treasury/payments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ accountId, amount: -10 });
    expect(negativeAmount.status).toBe(400);
    const zeroReceipt = await request(app)
      .post('/api/v1/treasury/receipts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ accountId, amount: 0 });
    expect(zeroReceipt.status).toBe(400);
    const zeroTx = await request(app)
      .post('/api/v1/treasury/bank-transactions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ accountId, amount: 0 });
    expect(zeroTx.status).toBe(400); // ≠ 0 (depósito o retiro)

    const emptyLines = await request(app)
      .post('/api/v1/treasury/reconciliations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ accountId, lines: [] });
    expect(emptyLines.status).toBe(400);

    const badStatus = await request(app)
      .patch(`/api/v1/treasury/payments/${MISSING_ID}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'bogus' });
    expect(badStatus.status).toBe(400);

    // Guardia de saldo: 422 con `details` y SIN efectos (el pago queda draft).
    const zeroAccount = await request(app)
      .post('/api/v1/treasury/accounts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'cash', code: 'SEC-CERO', name: 'Caja vacía', openingBalance: 0 });
    expect(zeroAccount.status).toBe(201);
    const zeroAccountId = zeroAccount.body.data.id as string;
    const payment = await request(app)
      .post('/api/v1/treasury/payments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ accountId: zeroAccountId, amount: 25 });
    expect(payment.status).toBe(201);
    const paymentId = payment.body.data.id as string;
    const post = await request(app)
      .patch(`/api/v1/treasury/payments/${paymentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'posted' });
    expect(post.status).toBe(422);
    expect(post.body.error.code).toBe('DOMAIN_ERROR');
    expect(post.body.error.message).toBe('Insufficient funds');
    expect(post.body.error.details).toEqual({ available: 0, required: 25 });

    const still = await request(app)
      .get(`/api/v1/treasury/payments/${paymentId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(still.body.data.status).toBe('draft');
    const account = await request(app)
      .get(`/api/v1/treasury/accounts/${zeroAccountId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(account.body.data.balance).toBe(0);
  });

  it('ids y queries con formato inválido → 400; DELETE/extracto no publicados → 404', async () => {
    const payment = await request(app)
      .get('/api/v1/treasury/payments/not-an-id')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(payment.status).toBe(400);

    const patch = await request(app)
      .patch('/api/v1/treasury/accounts/xyz')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'X' });
    expect(patch.status).toBe(400);

    const extract = await request(app)
      .get('/api/v1/treasury/accounts/not-an-id/movements')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(extract.status).toBe(400);

    const badPaymentStatus = await request(app)
      .get('/api/v1/treasury/payments?status=hacked')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badPaymentStatus.status).toBe(400);

    const badAccountType = await request(app)
      .get('/api/v1/treasury/accounts?type=hacked')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badAccountType.status).toBe(400);

    const badReconciled = await request(app)
      .get('/api/v1/treasury/bank-transactions?reconciled=yes')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badReconciled.status).toBe(400);

    const badAccountFilter = await request(app)
      .get('/api/v1/treasury/receipts?accountId=xyz')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badAccountFilter.status).toBe(400);

    const badPage = await request(app)
      .get('/api/v1/treasury/payments?page=0&limit=1000')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badPage.status).toBe(400);

    // El catálogo no define `:delete` para bank.account/payment/receipt/
    // reconciliation y los routers propios no emiten DELETE → rutas ausentes.
    const paths = [
      '/api/v1/treasury/accounts',
      '/api/v1/treasury/payments',
      '/api/v1/treasury/receipts',
      '/api/v1/treasury/bank-transactions',
      '/api/v1/treasury/reconciliations',
    ];
    for (const path of paths) {
      const del = await request(app)
        .delete(`${path}/${MISSING_ID}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(del.status, path).toBe(404); // ni siquiera para owner
    }

    // El extracto es SOLO de lectura (GET): mutaciones sobre esa sub-ruta → 404.
    const patchExtract = await request(app)
      .patch(`/api/v1/treasury/accounts/${MISSING_ID}/movements`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: -1 });
    expect(patchExtract.status).toBe(404);
    const deleteExtract = await request(app)
      .delete(`/api/v1/treasury/accounts/${MISSING_ID}/movements`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deleteExtract.status).toBe(404);

    const putPayment = await request(app)
      .put(`/api/v1/treasury/payments/${MISSING_ID}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ accountId, amount: 1 });
    expect(putPayment.status).toBe(404); // solo POST/PATCH/GET/DELETE-implementado
  });

  it('las respuestas de treasury no filtran tenantId internos ni secretos', async () => {
    const lists = [
      '/api/v1/treasury/accounts?limit=100',
      '/api/v1/treasury/payments?limit=100',
      '/api/v1/treasury/receipts?limit=100',
      '/api/v1/treasury/bank-transactions?limit=100',
      '/api/v1/treasury/reconciliations?limit=100',
      `/api/v1/treasury/accounts/${accountId}/movements?limit=100`,
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
