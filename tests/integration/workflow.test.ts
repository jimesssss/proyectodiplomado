/**
 * Integración Workflow — FASE 14.
 * Contra MongoDB real (memory server): definiciones por datos (`key` única POR
 * tenant e inmutable, condición `value`-vs-operador validada en la fuente,
 * DELETE ausente), motor `run` (match → instancia `awaiting_approval` + solicitud
 * `pending` con snapshot del rol; no-match → `skipped` SIN solicitud; 409
 * duplicado/archivada/trigger; 422 condición no evaluable), decisión
 * `approved|rejected` (máquina de 2 puertas, `decidedBy`/`decidedAt`, evento
 * `WorkflowCompleted`), listados/filtros, aislamiento cruzado + auditoría.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Env } from '../../apps/api/src/core/config/env.js';
import { createJwtService } from '../../apps/api/src/core/auth/jwt.js';
import { resolveJwtKeys } from '../../apps/api/src/core/auth/keys.js';
import { connectDatabase, disconnectDatabase } from '../../apps/api/src/core/db/database.js';
import { eventBus } from '../../apps/api/src/core/events/event-bus.js';
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
    { path: '/api/v1/audit', router: createAuditRouter(deps) },
    // CRM + Sales: fixtures de facturas de venta (documento gobernado).
    ...createCrmRouters(deps),
    ...createSalesRouters(deps),
    ...createWorkflowRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';
const SALE_LINES = [{ description: 'Consultoría', quantity: 2, unitPrice: 300, taxRate: 21 }];

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

interface PublicWorkflowBody {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly archived: boolean;
}

describe('workflow: definiciones, motor de run y aprobaciones', () => {
  let tokenA = '';
  let tokenB = '';
  let ownerSub = '';
  let invoice1Id = '';
  let invoice2Id = '';
  // Definiciones
  let wfId = ''; // principal: total > 1000 sobre sales.invoice
  let wfIdB = ''; // misma clave natural en el tenant B
  let wfArchId = ''; // queda archivada (run → 409)
  // Motor
  let inst1Id = ''; // de invoice1 → aprobada en T5
  let approval1Id = '';
  let approval2Id = ''; // de invoice2 (re-run con match) → rechazada en T6

  const postA = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const patchA = (path: string, body: object) =>
    request(app).patch(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const getA = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenA}`);

  const baseDefinition = {
    key: ' big approval ',
    name: 'Aprobación grande',
    description: 'Órdenes de venta por encima del umbral',
    trigger: { event: 'SalesOrderCreated', entityType: 'sales.invoice' },
    condition: { field: 'total', operator: 'gt', value: 1_000 },
    action: { type: 'request_approval', approverRole: 'gerente' },
  };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_workflow'), logger);
    const a = await provision('wfk-tenant-a', 'owner-a@wfk.example');
    const b = await provision('wfk-tenant-b', 'owner-b@wfk.example');
    tokenA = a.token;
    tokenB = b.token;
    ownerSub = jwt.verifyAccessToken(tokenA).sub;

    const customer = await postA('/api/v1/customers', { code: 'CLI-A', name: 'Cliente A' });
    expect(customer.status).toBe(201);
    const customerId = customer.body.data.id as string;
    const inv1 = await postA('/api/v1/sales/invoices', { customerId, lines: SALE_LINES });
    expect(inv1.status).toBe(201);
    invoice1Id = inv1.body.data.id as string;
    const inv2 = await postA('/api/v1/sales/invoices', { customerId, lines: SALE_LINES });
    expect(inv2.status).toBe(201);
    invoice2Id = inv2.body.data.id as string;
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('definiciones: key normalizada, única POR tenant, inmutables y sin DELETE', async () => {
    const created = await postA('/api/v1/workflows', baseDefinition);
    expect(created.status).toBe(201);
    const workflow = created.body.data as PublicWorkflowBody;
    expect(workflow.key).toBe('BIG-APPROVAL'); // mayúsculas y espacios → guiones
    expect(workflow.name).toBe('Aprobación grande');
    expect(workflow.archived).toBe(false);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    wfId = workflow.id;

    // Misma clave (otro formato) en el MISMO tenant → 409.
    const duplicate = await postA('/api/v1/workflows', { ...baseDefinition, key: 'big approval' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.message).toBe('Key already exists');

    // Misma clave en OTRO tenant → 201 (unicidad POR tenant, ADR-002).
    const forB = await request(app)
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ ...baseDefinition, key: 'BIG-APPROVAL' });
    expect(forB.status).toBe(201);
    wfIdB = forB.body.data.id as string;

    // Clave inválida tras normalizar → 400 con la regla del dominio.
    const badKey = await postA('/api/v1/workflows', { ...baseDefinition, key: '.empieza' });
    expect(badKey.status).toBe(400);
    expect(badKey.body.error.message).toContain('Key must be 2-64 chars');
    const shortKey = await postA('/api/v1/workflows', { ...baseDefinition, key: 'b' });
    expect(shortKey.status).toBe(400);

    // value vs operador: rechazado en la FUENTE (400), no en runtime.
    const numericWithString = await postA('/api/v1/workflows', {
      ...baseDefinition,
      key: 'BAD-1',
      condition: { field: 'total', operator: 'gt', value: 'mil' },
    });
    expect(numericWithString.status).toBe(400);
    const containsWithNumber = await postA('/api/v1/workflows', {
      ...baseDefinition,
      key: 'BAD-2',
      condition: { field: 'status', operator: 'contains', value: 5 },
    });
    expect(containsWithNumber.status).toBe(400);
    const badEvent = await postA('/api/v1/workflows', {
      ...baseDefinition,
      key: 'BAD-3',
      trigger: { event: 'Bogus', entityType: 'sales.invoice' },
    });
    expect(badEvent.status).toBe(400);
    const badField = await postA('/api/v1/workflows', {
      ...baseDefinition,
      key: 'BAD-4',
      condition: { field: 'total amount', operator: 'gt', value: 1 },
    });
    expect(badField.status).toBe(400);
    const badAction = await postA('/api/v1/workflows', {
      ...baseDefinition,
      key: 'BAD-5',
      action: { type: 'delete_all', approverRole: 'gerente' },
    });
    expect(badAction.status).toBe(400);

    // Inyecciones de campos server-only → 400 (estricto).
    expect((await postA('/api/v1/workflows', { ...baseDefinition, tenantId: 'otro' })).status).toBe(
      400,
    );
    expect((await postA('/api/v1/workflows', { ...baseDefinition, archived: true })).status).toBe(
      400,
    );

    // Inmutables en PATCH → 400 (configuración no reescrita en vuelo).
    expect((await patchA(`/api/v1/workflows/${wfId}`, { key: 'OTRA' })).status).toBe(400);
    expect(
      (await patchA(`/api/v1/workflows/${wfId}`, { trigger: { event: 'StockLow' } })).status,
    ).toBe(400);
    expect(
      (
        await patchA(`/api/v1/workflows/${wfId}`, {
          condition: { field: 'x', operator: 'lt', value: 1 },
        })
      ).status,
    ).toBe(400);
    expect(
      (await patchA(`/api/v1/workflows/${wfId}`, { action: { type: 'request_approval' } })).status,
    ).toBe(400);

    // Editables: nombre y descripción (nullable).
    const renamed = await patchA(`/api/v1/workflows/${wfId}`, {
      name: 'Aprobación por umbral',
      description: null,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe('Aprobación por umbral');
    expect(renamed.body.data.description).toBeNull();
    expect((await patchA(`/api/v1/workflows/${wfId}`, {})).status).toBe(400);

    // Sin `workflow:delete`: DELETE y PUT no publicados → 404.
    const del = await request(app)
      .delete(`/api/v1/workflows/${wfId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(404);
    const put = await request(app)
      .put(`/api/v1/workflows/${wfId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'X' });
    expect(put.status).toBe(404);

    // Archivar/restore con guardias 409 + filtros de listado.
    const archived = await patchA(`/api/v1/workflows/${wfId}`, { archived: true });
    expect(archived.status).toBe(200);
    expect((await patchA(`/api/v1/workflows/${wfId}`, { archived: true })).status).toBe(409);
    const archivedList = await getA('/api/v1/workflows?archived=true');
    expect((archivedList.body.data as PublicWorkflowBody[]).some((w) => w.id === wfId)).toBe(true);
    const activeList = await getA('/api/v1/workflows?archived=false');
    expect((activeList.body.data as PublicWorkflowBody[]).some((w) => w.id === wfId)).toBe(false);
    const restored = await patchA(`/api/v1/workflows/${wfId}`, { archived: false });
    expect(restored.status).toBe(200);
    expect((await patchA(`/api/v1/workflows/${wfId}`, { archived: false })).status).toBe(409);

    const unknown = await getA(`/api/v1/workflows/${MISSING_ID}`);
    expect(unknown.status).toBe(404);

    // Definición archivada + desconocida para los tests del motor.
    const toArchive = await postA('/api/v1/workflows', {
      ...baseDefinition,
      key: 'ARCHIVED-WF',
    });
    expect(toArchive.status).toBe(201);
    wfArchId = toArchive.body.data.id as string;
    const archiveIt = await patchA(`/api/v1/workflows/${wfArchId}`, { archived: true });
    expect(archiveIt.status).toBe(200);
  });

  it('run con match: instancia awaiting + solicitud pending (snapshot del rol) + auditoría', async () => {
    const run = await postA(`/api/v1/workflows/${wfId}/run`, {
      entityType: 'sales.invoice',
      entityId: invoice1Id,
      context: { total: 5_000 },
    });
    expect(run.status).toBe(201);
    const instance = run.body.data as { id: string; state: string; context: object };
    expect(instance.state).toBe('awaiting_approval');
    expect(instance.context).toEqual({ total: 5_000 });
    expect(JSON.stringify(run.body)).not.toContain('tenantId');
    inst1Id = instance.id;

    const queue = await getA(`/api/v1/workflows/approvals?entityId=${invoice1Id}`);
    expect(queue.status).toBe(200);
    expect(queue.body.meta.total).toBe(1);
    const [approval] = queue.body.data as Array<{
      id: string;
      instanceId: string;
      workflowId: string;
      status: string;
      approverRole: string;
      decidedBy: string | null;
    }>;
    expect(approval?.instanceId).toBe(inst1Id);
    expect(approval?.workflowId).toBe(wfId);
    expect(approval?.status).toBe('pending');
    expect(approval?.approverRole).toBe('gerente'); // snapshot de la definición
    expect(approval?.decidedBy).toBeNull();
    approval1Id = approval?.id ?? '';

    const instances = await getA(`/api/v1/workflows/${wfId}/instances`);
    expect(instances.status).toBe(200);
    expect(instances.body.meta.total).toBe(1);

    // Duplicado: UNA instancia pendiente por workflow+documento → 409.
    const duplicate = await postA(`/api/v1/workflows/${wfId}/run`, {
      entityType: 'sales.invoice',
      entityId: invoice1Id,
      context: { total: 5_000 },
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.message).toBe('Approval is already pending for this document');

    const audit = await getA('/api/v1/audit?action=workflow.instance.create&limit=50');
    expect(audit.status).toBe(200);
    expect(
      (audit.body.data as Array<{ entityId: string; metadata?: { reason?: string } }>).some(
        (e) => e.entityId === inst1Id && e.metadata?.reason === 'state:awaiting_approval',
      ),
    ).toBe(true);
  });

  it('run con guardas: trigger ≠ entityType (409), archivada (409) y desconocida (404)', async () => {
    const mismatch = await postA(`/api/v1/workflows/${wfId}/run`, {
      entityType: 'purchase.order',
      entityId: invoice2Id,
      context: { total: 5_000 },
    });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.message).toBe('Trigger does not match the document type');
    expect(mismatch.body.error.details).toEqual({
      expected: 'sales.invoice',
      received: 'purchase.order',
    });

    const archived = await postA(`/api/v1/workflows/${wfArchId}/run`, {
      entityType: 'sales.invoice',
      entityId: invoice2Id,
      context: { total: 5_000 },
    });
    expect(archived.status).toBe(409);
    expect(archived.body.error.message).toBe('Workflow is archived');

    const unknown = await postA(`/api/v1/workflows/${MISSING_ID}/run`, {
      entityType: 'sales.invoice',
      entityId: invoice2Id,
      context: { total: 5_000 },
    });
    expect(unknown.status).toBe(404);

    // Nada de esto escribió: sigue SOLO la instancia de invoice1.
    const instances = await getA(`/api/v1/workflows/${wfId}/instances`);
    expect(instances.body.meta.total).toBe(1);
    const invalidId = await postA(`/api/v1/workflows/${wfId}/run`, {
      entityType: 'sales.invoice',
      entityId: 'no-es-id',
      context: { total: 5_000 },
    });
    expect(invalidId.status).toBe(400);
  });

  it('run sin match: 422 si la condición no evaluable; skipped SIN solicitud', async () => {
    const missingField = await postA(`/api/v1/workflows/${wfId}/run`, {
      entityType: 'sales.invoice',
      entityId: invoice2Id,
      context: {},
    });
    expect(missingField.status).toBe(422);
    expect(missingField.body.error.code).toBe('DOMAIN_ERROR');
    expect(missingField.body.error.message).toBe('Condition field missing in context');
    expect(missingField.body.error.details).toEqual({ field: 'total' });

    const typeMismatch = await postA(`/api/v1/workflows/${wfId}/run`, {
      entityType: 'sales.invoice',
      entityId: invoice2Id,
      context: { total: 'grande' },
    });
    expect(typeMismatch.status).toBe(422);
    expect(typeMismatch.body.error.message).toBe(
      'Condition field type does not match the operator',
    );
    expect(typeMismatch.body.error.details).toEqual({ field: 'total', operator: 'gt' });

    // Evalúa y NO matchea (500 ≤ 1000) → instancia `skipped`, sin solicitud.
    const skipped = await postA(`/api/v1/workflows/${wfId}/run`, {
      entityType: 'sales.invoice',
      entityId: invoice2Id,
      context: { total: 500 },
    });
    expect(skipped.status).toBe(201);
    expect(skipped.body.data.state).toBe('skipped');
    const queue = await getA(`/api/v1/workflows/approvals?entityId=${invoice2Id}`);
    expect(queue.body.meta.total).toBe(0); // evaluado, no aplica → SIN solicitud

    // `skipped` es terminal pero NO bloquea re-ejecuciones futuras.
    const rerun = await postA(`/api/v1/workflows/${wfId}/run`, {
      entityType: 'sales.invoice',
      entityId: invoice2Id,
      context: { total: 500 },
    });
    expect(rerun.status).toBe(201);
    expect(rerun.body.data.state).toBe('skipped');

    const skippedList = await getA(`/api/v1/workflows/${wfId}/instances?state=skipped`);
    expect(skippedList.body.meta.total).toBe(2);
    const auditSkipped = await getA('/api/v1/audit?action=workflow.instance.create&limit=50');
    expect(
      (auditSkipped.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'state:skipped',
      ),
    ).toBe(true);
  });

  it('decisión approve: máquina de 2 puertas, decidedBy/decidedAt y evento WorkflowCompleted', async () => {
    const emitted: Array<{ workflowInstanceId?: string; outcome?: string }> = [];
    const off = eventBus.on('WorkflowCompleted', (event) => {
      emitted.push(event.payload);
    });

    const decided = await postA(`/api/v1/workflows/approvals/${approval1Id}/decision`, {
      decision: 'approved',
      comment: 'dentro del presupuesto',
    });
    expect(decided.status).toBe(200);
    const approval = decided.body.data as {
      status: string;
      decidedBy: string | null;
      decidedAt: string | null;
      comment: string | null;
    };
    expect(approval.status).toBe('approved');
    expect(approval.decidedBy).toBe(ownerSub); // JWT `sub`, nunca del body
    expect(approval.decidedAt).not.toBeNull();
    expect(approval.comment).toBe('dentro del presupuesto');
    expect(JSON.stringify(decided.body)).not.toContain('tenantId');

    // La instancia heredó el resultado (misma condición, 2 escrituras).
    const approved = await getA(`/api/v1/workflows/${wfId}/instances?state=approved`);
    expect(approved.body.meta.total).toBe(1);
    expect((approved.body.data as Array<{ id: string }>).some((i) => i.id === inst1Id)).toBe(true);

    // Evento de plataforma: UNO por decisión, con el sobre-encabezado tipado.
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({
      workflowInstanceId: inst1Id,
      outcome: 'approved',
    });
    off();

    // Segunda decisión (mismo estado) → 409; cruzada → 409, sin emitir.
    const again = await postA(`/api/v1/workflows/approvals/${approval1Id}/decision`, {
      decision: 'approved',
    });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe('Status is already the requested one');
    const cross = await postA(`/api/v1/workflows/approvals/${approval1Id}/decision`, {
      decision: 'rejected',
    });
    expect(cross.status).toBe(409);
    expect(cross.body.error.message).toBe('Invalid status transition');

    const badDecision = await postA(`/api/v1/workflows/approvals/${approval1Id}/decision`, {
      decision: 'bogus',
    });
    expect(badDecision.status).toBe(400);
    const unknown = await postA(`/api/v1/workflows/approvals/${MISSING_ID}/decision`, {
      decision: 'approved',
    });
    expect(unknown.status).toBe(404);
  });

  it('decisión reject: rechaza la instancia y permite re-ejecutar el documento', async () => {
    // Re-ejecuta invoice2 AHORA con match (5000 > 1000) → nueva solicitud.
    const rerun = await postA(`/api/v1/workflows/${wfId}/run`, {
      entityType: 'sales.invoice',
      entityId: invoice2Id,
      context: { total: 5_000 },
    });
    expect(rerun.status).toBe(201);
    expect(rerun.body.data.state).toBe('awaiting_approval');

    const queue = await getA(`/api/v1/workflows/approvals?entityId=${invoice2Id}&status=pending`);
    expect(queue.body.meta.total).toBe(1);
    approval2Id = (queue.body.data as Array<{ id: string }>)[0]?.id ?? '';
    expect(approval2Id).not.toBe('');

    const emitted: Array<{ workflowInstanceId?: string; outcome?: string }> = [];
    const off = eventBus.on('WorkflowCompleted', (event) => {
      emitted.push(event.payload);
    });
    const decided = await postA(`/api/v1/workflows/approvals/${approval2Id}/decision`, {
      decision: 'rejected',
    });
    expect(decided.status).toBe(200);
    const decidedApproval = decided.body.data as { instanceId: string; status: string };
    expect(decidedApproval.status).toBe('rejected');
    expect(decided.body.data.comment).toBeNull(); // comentario opcional ausente
    expect(emitted).toEqual([
      { workflowInstanceId: decidedApproval.instanceId, outcome: 'rejected' },
    ]);
    off();

    const rejected = await getA(`/api/v1/workflows/${wfId}/instances?state=rejected`);
    expect(rejected.body.meta.total).toBe(1);

    // Rechazo también es terminal para la SOLICITUD.
    const again = await postA(`/api/v1/workflows/approvals/${approval2Id}/decision`, {
      decision: 'approved',
    });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe('Invalid status transition');
  });

  it('listados: instancias por estado y aprobaciones por filtros', async () => {
    const all = await getA(`/api/v1/workflows/${wfId}/instances?limit=100`);
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(4); // invoice1 (1) + invoice2 (skipped×2 + 1)

    const awaiting = await getA(`/api/v1/workflows/${wfId}/instances?state=awaiting_approval`);
    expect(awaiting.body.meta.total).toBe(0); // ambas decididas
    const approved = await getA(`/api/v1/workflows/${wfId}/instances?state=approved`);
    expect((approved.body.data as Array<{ id: string }>).some((i) => i.id === inst1Id)).toBe(true);

    const unknownWorkflow = await getA(`/api/v1/workflows/${MISSING_ID}/instances`);
    expect(unknownWorkflow.status).toBe(404);

    const byStatus = await getA('/api/v1/workflows/approvals?status=approved');
    expect(byStatus.status).toBe(200);
    expect((byStatus.body.data as Array<{ id: string }>).some((a) => a.id === approval1Id)).toBe(
      true,
    );
    expect((byStatus.body.data as Array<{ id: string }>).some((a) => a.id === approval2Id)).toBe(
      false,
    );

    const byWorkflow = await getA(`/api/v1/workflows/approvals?workflowId=${wfId}`);
    expect(byWorkflow.body.meta.total).toBe(2);
    const byEntity = await getA(
      `/api/v1/workflows/approvals?entityId=${invoice1Id}&entityType=sales.invoice`,
    );
    expect(byEntity.body.meta.total).toBe(1);
    expect((byEntity.body.data as Array<{ id: string }>)[0]?.id).toBe(approval1Id);

    const unknownApproval = await getA(`/api/v1/workflows/approvals/${MISSING_ID}`);
    expect(unknownApproval.status).toBe(404);
    const invalidApproval = await getA('/api/v1/workflows/approvals/no-es-id');
    expect(invalidApproval.status).toBe(400);
  });

  it('aislamiento: B no ve ni toca workflows, instancias ni aprobaciones de A', async () => {
    const bAuth = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenB}`);
    const bPatch = (path: string, body: object) =>
      request(app).patch(path).set('Authorization', `Bearer ${tokenB}`).send(body);

    expect((await bAuth(`/api/v1/workflows/${wfId}`)).status).toBe(404);
    expect((await bAuth(`/api/v1/workflows/${wfId}/instances`)).status).toBe(404);
    expect((await bAuth(`/api/v1/workflows/approvals/${approval1Id}`)).status).toBe(404);
    expect((await bPatch(`/api/v1/workflows/${wfId}`, { name: 'hack' })).status).toBe(404);

    const crossRun = await request(app)
      .post(`/api/v1/workflows/${wfId}/run`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ entityType: 'sales.invoice', entityId: invoice1Id, context: { total: 9_999 } });
    expect(crossRun.status).toBe(404); // la definición es de A

    const crossDecision = await request(app)
      .post(`/api/v1/workflows/approvals/${approval1Id}/decision`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ decision: 'approved' });
    expect(crossDecision.status).toBe(404); // la solicitud es de A (A ya la decidió: 404 manda)

    // Listas de B: SOLO su propia definición y ninguna solicitud.
    const workflowsB = await bAuth('/api/v1/workflows?limit=100');
    expect(workflowsB.body.meta.total).toBe(1);
    expect((workflowsB.body.data as PublicWorkflowBody[])[0]?.id).toBe(wfIdB);
    const approvalsB = await bAuth('/api/v1/workflows/approvals?limit=100');
    expect(approvalsB.body.meta.total).toBe(0);

    // El motor de B funciona con estado INDEPENDIENTE.
    const ownRun = await request(app)
      .post(`/api/v1/workflows/${wfIdB}/run`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        entityType: 'sales.invoice',
        entityId: '999999999999999999999999',
        context: { total: 9_999 },
      });
    expect(ownRun.status).toBe(201);
    expect(ownRun.body.data.state).toBe('awaiting_approval');
    const approvalsAfter = await bAuth('/api/v1/workflows/approvals');
    expect(approvalsAfter.body.meta.total).toBe(1); // la suya, no las de A
    expect((approvalsAfter.body.data as Array<{ entityId: string }>)[0]?.entityId).toBe(
      '999999999999999999999999',
    );
  });

  it('auditoría: creación, archivado, instancias y decisiones por tenant', async () => {
    const created = await getA('/api/v1/audit?action=workflow.create&limit=50');
    expect(created.status).toBe(200);
    expect(
      (created.body.data as Array<{ entityId: string }>).some((e) => e.entityId === wfId),
    ).toBe(true);

    const archived = await getA(
      `/api/v1/audit?action=workflow.update&entityId=${wfArchId}&limit=50`,
    );
    expect(archived.status).toBe(200);
    expect(
      (archived.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'archived:true',
      ),
    ).toBe(true);

    const restore = await getA(`/api/v1/audit?action=workflow.restore&entityId=${wfId}&limit=50`);
    expect(restore.status).toBe(200);
    expect(
      (restore.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'archived:false',
      ),
    ).toBe(true);

    const decision = await getA(
      `/api/v1/audit?action=approval.decide&entityId=${approval1Id}&limit=50`,
    );
    expect(decision.status).toBe(200);
    const entry = (
      decision.body.data as Array<{
        metadata?: { reason?: string };
        previousValue?: { status?: string };
      }>
    ).find((e) => e.metadata?.reason === 'decision:approved');
    expect(entry).toBeDefined();
    expect(entry?.previousValue?.status).toBe('pending'); // estado previo registrado

    const fromB = await request(app)
      .get('/api/v1/audit?action=workflow.create&limit=50')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(fromB.status).toBe(200);
    expect((fromB.body.data as Array<{ entityId: string }>).every((e) => e.entityId !== wfId)).toBe(
      true,
    );
  });
});
