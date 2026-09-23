/**
 * Seguridad Workflow — FASE 14.
 * 401 en las 8 rutas, 403 con `details.permission` por recurso, separación
 * explícita `workflow:*` (configurar/ejecutar) ≠ `approval:*` (leer cola/decidir),
 * token con `pv` obsoleta, esquemas estrictos (tenantId/archived/key/trigger/
 * status/instanceId/decidedBy), valores inválidos → 400, guardas de dominio →
 * 409/422 (nunca 500), queries inválidas, rutas DELETE/PUT/PATCH ausentes
 * (→ 404) y ausencia de datos internos en las respuestas.
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
import { createWorkflowRouters } from '../../apps/api/src/modules/workflow/index.js';

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
    ...createWorkflowRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';
const ENTITY_1 = '111111111111111111111111';
const ENTITY_2 = '222222222222222222222222';
const ENTITY_3 = '333333333333333333333333';
const ENTITY_4 = '444444444444444444444444';

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';
let workflowUserToken = '';
let approverToken = '';
let wfId = '';
let wfArchivedId = '';
let approval1Id = ''; // el aprobador la consume en la prueba de separación
let approval2Id = ''; // queda pendiente hasta la prueba de doble decisión

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

describe('workflow security: permisos por recurso, esquemas estrictos y guardias', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_workflow_sec'), logger);

    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'WFSEC',
        slug: 'wf-sec',
        owner: { email: 'wfsec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(res.status).toBe(201);
    ownerToken = await login('wfsec-owner@example.com');

    // Sin roles → sin permisos (denegación por defecto).
    const reader = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'wfsec-reader@example.com',
        password: PASSWORD,
        displayName: 'Reader',
        roles: [],
      });
    expect(reader.status).toBe(201);
    readerToken = await login('wfsec-reader@example.com');

    // Configurador: `workflow:*` SIN `approval:*` (crear/ejecutar ≠ decidir).
    const wfRole = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        key: 'workflow-user',
        name: 'Workflow User',
        permissions: ['workflow:read', 'workflow:create', 'workflow:update'],
      });
    expect(wfRole.status).toBe(201);
    const wfUser = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'wfsec-wfuser@example.com',
        password: PASSWORD,
        displayName: 'Workflow User',
        roles: ['workflow-user'],
      });
    expect(wfUser.status).toBe(201);
    workflowUserToken = await login('wfsec-wfuser@example.com');

    // Aprobador: `approval:*` SIN `workflow:*` (leer cola y decidir).
    const appRole = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        key: 'approver',
        name: 'Approver',
        permissions: ['approval:read', 'approval:approve'],
      });
    expect(appRole.status).toBe(201);
    const approver = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'wfsec-approver@example.com',
        password: PASSWORD,
        displayName: 'Approver',
        roles: ['approver'],
      });
    expect(approver.status).toBe(201);
    approverToken = await login('wfsec-approver@example.com');

    const definition = {
      key: 'SEC-WF',
      name: 'Workflow de seguridad',
      trigger: { event: 'SalesOrderCreated', entityType: 'sales.invoice' },
      condition: { field: 'total', operator: 'gt', value: 0 },
      action: { type: 'request_approval', approverRole: 'gerente' },
    };
    const created = await request(app)
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(definition);
    expect(created.status).toBe(201);
    wfId = created.body.data.id as string;

    // Definición archivada (guardia de run) + dos solicitudes pendientes.
    const archived = await request(app)
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...definition, key: 'SEC-WF-ARCH' });
    expect(archived.status).toBe(201);
    wfArchivedId = archived.body.data.id as string;
    const archiveIt = await request(app)
      .patch(`/api/v1/workflows/${wfArchivedId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ archived: true });
    expect(archiveIt.status).toBe(200);

    for (const entity of [ENTITY_1, ENTITY_2]) {
      const run = await request(app)
        .post(`/api/v1/workflows/${wfId}/run`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ entityType: 'sales.invoice', entityId: entity, context: { total: 10 } });
      expect(run.status).toBe(201);
    }
    const queue = await request(app)
      .get('/api/v1/workflows/approvals?status=pending&limit=100')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(queue.body.meta.total).toBe(2);
    approval1Id =
      (queue.body.data as Array<{ entityId: string; id: string }>).find(
        (a) => a.entityId === ENTITY_1,
      )?.id ?? '';
    approval2Id =
      (queue.body.data as Array<{ entityId: string; id: string }>).find(
        (a) => a.entityId === ENTITY_2,
      )?.id ?? '';
    expect(approval1Id).not.toBe('');
    expect(approval2Id).not.toBe('');
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 en las 8 rutas (listas, run, decisiones) sin token o manipulado', async () => {
    const lists = ['/api/v1/workflows', '/api/v1/workflows/approvals'];
    for (const path of lists) {
      const anon = await request(app).get(path);
      expect(anon.status, path).toBe(401);
      expect(anon.body.error.code).toBe('UNAUTHENTICATED');
    }
    const anonInstances = await request(app).get(`/api/v1/workflows/${MISSING_ID}/instances`);
    expect(anonInstances.status).toBe(401);
    const anonDetail = await request(app).get(`/api/v1/workflows/approvals/${MISSING_ID}`);
    expect(anonDetail.status).toBe(401);

    const anonCreate = await request(app).post('/api/v1/workflows').send({});
    expect(anonCreate.status).toBe(401);
    const anonRun = await request(app)
      .post(`/api/v1/workflows/${MISSING_ID}/run`)
      .send({ entityType: 'sales.invoice', entityId: ENTITY_1, context: { total: 1 } });
    expect(anonRun.status).toBe(401);
    const anonDecision = await request(app)
      .post(`/api/v1/workflows/approvals/${MISSING_ID}/decision`)
      .send({ decision: 'approved' });
    expect(anonDecision.status).toBe(401);
    const anonPatch = await request(app)
      .patch(`/api/v1/workflows/${MISSING_ID}`)
      .send({ name: 'X' });
    expect(anonPatch.status).toBe(401);

    const tampered = await request(app)
      .get('/api/v1/workflows')
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
      { method: 'get', path: '/api/v1/workflows', permission: 'workflow:read' },
      {
        method: 'post',
        path: '/api/v1/workflows',
        permission: 'workflow:create',
        body: { key: 'nope', name: 'Nope' },
      },
      {
        method: 'patch',
        path: `/api/v1/workflows/${MISSING_ID}`,
        permission: 'workflow:update',
        body: { name: 'Nope' },
      },
      {
        method: 'post',
        path: `/api/v1/workflows/${MISSING_ID}/run`,
        permission: 'workflow:update',
        body: { entityType: 'sales.invoice', entityId: ENTITY_1, context: { total: 1 } },
      },
      {
        method: 'get',
        path: `/api/v1/workflows/${MISSING_ID}/instances`,
        permission: 'workflow:read',
      },
      { method: 'get', path: '/api/v1/workflows/approvals', permission: 'approval:read' },
      {
        method: 'get',
        path: `/api/v1/workflows/approvals/${MISSING_ID}`,
        permission: 'approval:read',
      },
      {
        method: 'post',
        path: `/api/v1/workflows/approvals/${MISSING_ID}/decision`,
        permission: 'approval:approve',
        body: { decision: 'approved' },
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

  it('separación: workflow:* decide la cola NO; approval:* configura NO', async () => {
    // Configurador con `workflow:*`: crea y ejecuta, pero no ve NI decide.
    const create = await request(app)
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${workflowUserToken}`)
      .send({
        key: 'WF-USER',
        name: 'Del configurador',
        trigger: { event: 'SalesOrderCreated', entityType: 'sales.invoice' },
        condition: { field: 'total', operator: 'gt', value: 0 },
        action: { type: 'request_approval', approverRole: 'gerente' },
      });
    expect(create.status).toBe(201);
    const ownWfId = create.body.data.id as string;

    const list = await request(app)
      .get('/api/v1/workflows')
      .set('Authorization', `Bearer ${workflowUserToken}`);
    expect(list.status).toBe(200); // workflow:read ✓

    const run = await request(app)
      .post(`/api/v1/workflows/${ownWfId}/run`)
      .set('Authorization', `Bearer ${workflowUserToken}`)
      .send({ entityType: 'sales.invoice', entityId: ENTITY_3, context: { total: 1 } });
    expect(run.status).toBe(201); // workflow:update ✓

    const queue = await request(app)
      .get('/api/v1/workflows/approvals')
      .set('Authorization', `Bearer ${workflowUserToken}`);
    expect(queue.status).toBe(403); // approval:read ✗
    expect(queue.body.error.details.permission).toBe('approval:read');

    const decide = await request(app)
      .post(`/api/v1/workflows/approvals/${approval1Id}/decision`)
      .set('Authorization', `Bearer ${workflowUserToken}`)
      .send({ decision: 'approved' });
    expect(decide.status).toBe(403); // approval:approve ✗ → NO decide
    expect(decide.body.error.details.permission).toBe('approval:approve');

    // Aprobador con `approval:*`: lee y decide, pero no configura.
    const readWorkflows = await request(app)
      .get('/api/v1/workflows')
      .set('Authorization', `Bearer ${approverToken}`);
    expect(readWorkflows.status).toBe(403); // workflow:read ✗
    expect(readWorkflows.body.error.details.permission).toBe('workflow:read');

    const patchWorkflow = await request(app)
      .patch(`/api/v1/workflows/${wfId}`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({ name: 'Hack' });
    expect(patchWorkflow.status).toBe(403);
    expect(patchWorkflow.body.error.details.permission).toBe('workflow:update');

    const readQueue = await request(app)
      .get('/api/v1/workflows/approvals?status=pending')
      .set('Authorization', `Bearer ${approverToken}`);
    expect(readQueue.status).toBe(200); // approval:read ✓

    const approved = await request(app)
      .post(`/api/v1/workflows/approvals/${approval1Id}/decision`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({ decision: 'approved' });
    expect(approved.status).toBe(200); // approval:approve ✓ (quien decide NO es el owner)
    expect(approved.body.data.status).toBe('approved');
    expect(approved.body.data.decidedBy).not.toBeNull();
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
      .get('/api/v1/workflows')
      .set('Authorization', `Bearer ${stale}`);
    expect(list.status).toBe(403);
    expect(list.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(200); // solo-autenticada sigue operativa
  });

  it('tenantId y campos server-only/immutable inyectados → 400 (estricto, ADR-002)', async () => {
    const base = {
      key: 'INJ-WF',
      name: 'X',
      trigger: { event: 'SalesOrderCreated', entityType: 'sales.invoice' },
      condition: { field: 'total', operator: 'gt', value: 1 },
      action: { type: 'request_approval', approverRole: 'gerente' },
    };
    for (const extra of [
      { tenantId: 'otro-tenant' },
      { archived: true },
      { id: MISSING_ID },
      { createdAt: '2020-01-01' },
    ]) {
      const res = await request(app)
        .post('/api/v1/workflows')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...base, ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }

    for (const immutable of [
      { key: 'OTRA' },
      { trigger: { event: 'StockLow' } },
      { condition: { field: 'x', operator: 'lt', value: 1 } },
      { action: { type: 'request_approval' } },
      { state: 'approved' },
    ]) {
      const res = await request(app)
        .patch(`/api/v1/workflows/${wfId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(immutable);
      expect(res.status, JSON.stringify(immutable)).toBe(400);
    }

    const runBase = { entityType: 'sales.invoice', entityId: ENTITY_4, context: { total: 1 } };
    for (const extra of [
      { tenantId: 'otro-tenant' },
      { status: 'approved' },
      { state: 'skipped' },
      { workflowId: MISSING_ID },
    ]) {
      const res = await request(app)
        .post(`/api/v1/workflows/${wfId}/run`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...runBase, ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }

    const decisionBase = { decision: 'approved' };
    for (const extra of [
      { status: 'approved' },
      { instanceId: MISSING_ID },
      { decidedBy: 'otro-usuario' },
      { tenantId: 'otro-tenant' },
    ]) {
      const res = await request(app)
        .post(`/api/v1/workflows/approvals/${MISSING_ID}/decision`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...decisionBase, ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
  });

  it('valores inválidos → 400; guardas de dominio → 409/422 (nunca 500)', async () => {
    const base = {
      key: 'BAD-VALUES',
      name: 'X',
      trigger: { event: 'SalesOrderCreated', entityType: 'sales.invoice' },
      condition: { field: 'total', operator: 'gt', value: 1 },
      action: { type: 'request_approval', approverRole: 'gerente' },
    };
    const badEvent = await request(app)
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...base, trigger: { event: 'Bogus', entityType: 'sales.invoice' } });
    expect(badEvent.status).toBe(400);
    const badOperator = await request(app)
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...base, condition: { field: 'total', operator: 'like', value: 1 } });
    expect(badOperator.status).toBe(400);
    const badValueType = await request(app)
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...base, condition: { field: 'total', operator: 'gt', value: 'uno' } });
    expect(badValueType.status).toBe(400);
    const badServiceKey = await request(app)
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...base, key: '.empieza' });
    expect(badServiceKey.status).toBe(400); // normalizado ⇒ inválido en el dominio
    const badDecision = await request(app)
      .post(`/api/v1/workflows/approvals/${approval2Id}/decision`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ decision: 'bogus' });
    expect(badDecision.status).toBe(400);
    const badStateFilter = await request(app)
      .get('/api/v1/workflows?archived=yes')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badStateFilter.status).toBe(400);
    const badInstanceState = await request(app)
      .get(`/api/v1/workflows/${wfId}/instances?state=hacked`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badInstanceState.status).toBe(400);
    const badApprovalStatus = await request(app)
      .get('/api/v1/workflows/approvals?status=hacked')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badApprovalStatus.status).toBe(400);
    const badPage = await request(app)
      .get('/api/v1/workflows?page=0&limit=1000')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(badPage.status).toBe(400);
    const badEntityId = await request(app)
      .post(`/api/v1/workflows/${wfId}/run`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ entityType: 'sales.invoice', entityId: 'no-id', context: { total: 1 } });
    expect(badEntityId.status).toBe(400);
    const nestedContext = await request(app)
      .post(`/api/v1/workflows/${wfId}/run`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ entityType: 'sales.invoice', entityId: ENTITY_4, context: { total: { a: 1 } } });
    expect(nestedContext.status).toBe(400); // solo escalares en el contexto

    // Guarda de run: archivada → 409 (nunca 500).
    const archivedRun = await request(app)
      .post(`/api/v1/workflows/${wfArchivedId}/run`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ entityType: 'sales.invoice', entityId: ENTITY_4, context: { total: 1 } });
    expect(archivedRun.status).toBe(409);
    expect(archivedRun.body.error.message).toBe('Workflow is archived');

    // Condición no evaluable → 422 con `details` (no asume false).
    const missingField = await request(app)
      .post(`/api/v1/workflows/${wfId}/run`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ entityType: 'sales.invoice', entityId: ENTITY_4, context: {} });
    expect(missingField.status).toBe(422);
    expect(missingField.body.error.code).toBe('DOMAIN_ERROR');
    expect(missingField.body.error.details).toEqual({ field: 'total' });

    // Doble decisión sobre la MISMA solicitud → 409, efecto único.
    const first = await request(app)
      .post(`/api/v1/workflows/approvals/${approval2Id}/decision`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ decision: 'rejected' });
    expect(first.status).toBe(200);
    const second = await request(app)
      .post(`/api/v1/workflows/approvals/${approval2Id}/decision`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ decision: 'rejected' });
    expect(second.status).toBe(409);
    expect(second.body.error.message).toBe('Status is already the requested one');

    // Recursos inexistentes → 404 uniforme.
    const unknownRun = await request(app)
      .post(`/api/v1/workflows/${MISSING_ID}/run`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ entityType: 'sales.invoice', entityId: ENTITY_4, context: { total: 1 } });
    expect(unknownRun.status).toBe(404);
    const unknownDecision = await request(app)
      .post(`/api/v1/workflows/approvals/${MISSING_ID}/decision`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ decision: 'approved' });
    expect(unknownDecision.status).toBe(404);
  });

  it('ids con formato inválido → 400; rutas DELETE/PUT/PATCH ausentes → 404', async () => {
    const detail = await request(app)
      .get('/api/v1/workflows/not-an-id')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(detail.status).toBe(400);
    const patch = await request(app)
      .patch('/api/v1/workflows/xyz')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'X' });
    expect(patch.status).toBe(400);
    const instances = await request(app)
      .get(`/api/v1/workflows/${MISSING_ID}/instances/not-an-id`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(instances.status).toBe(404); // sub-ruta inexistente (2 segmentos distintos)

    // El catálogo no define `workflow:delete`/`approval:*` de mutación → 404.
    const delWorkflow = await request(app)
      .delete(`/api/v1/workflows/${wfId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(delWorkflow.status).toBe(404);
    const putWorkflow = await request(app)
      .put(`/api/v1/workflows/${wfId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'X' });
    expect(putWorkflow.status).toBe(404);

    // Las aprobaciones NO son CRUD: solo GET y POST …/decision.
    const patchApproval = await request(app)
      .patch(`/api/v1/workflows/approvals/${approval2Id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'approved' });
    expect(patchApproval.status).toBe(404);
    const deleteApproval = await request(app)
      .delete(`/api/v1/workflows/approvals/${approval2Id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deleteApproval.status).toBe(404);
    const createApproval = await request(app)
      .post('/api/v1/workflows/approvals')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ instanceId: MISSING_ID });
    expect(createApproval.status).toBe(404); // solo el motor crea solicitudes
    const putDecision = await request(app)
      .put(`/api/v1/workflows/approvals/${approval2Id}/decision`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ decision: 'approved' });
    expect(putDecision.status).toBe(404);
    const patchRun = await request(app)
      .patch(`/api/v1/workflows/${wfId}/run`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ entityType: 'sales.invoice', entityId: ENTITY_4 });
    expect(patchRun.status).toBe(404); // run SOLO es POST
    const deleteInstances = await request(app)
      .delete(`/api/v1/workflows/${wfId}/instances`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deleteInstances.status).toBe(404); // listado SOLO es GET
  });

  it('las respuestas de workflow no filtran tenantId internos ni secretos', async () => {
    const lists = [
      '/api/v1/workflows?limit=100',
      '/api/v1/workflows/approvals?limit=100',
      `/api/v1/workflows/${wfId}/instances?limit=100`,
      `/api/v1/workflows/approvals/${approval2Id}`,
      `/api/v1/workflows/${wfId}`,
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
