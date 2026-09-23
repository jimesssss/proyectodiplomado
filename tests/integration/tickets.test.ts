/**
 * Integración Service — FASE 18.
 * Contra MongoDB real (memory server): tickets numerados `TK-YYYY-000001`
 * ÚNICOS por tenant (asignados por el servidor con `$inc` atómico; altas
 * concurrentes → números distintos), subject recortado (blanco → 400),
 * máquina de estados de soporte CON reapertura (`resolved → in_progress`
 * limpia la nota) y `→ resolved` que EXIGE `resolution` en el MISMO patch
 * (400 sin escritura), terminales `closed`/`cancelled` que congelan el
 * negocio (409), SLA derivado (`dueAt` = creación + horas de la prioridad,
 * 24 h normal / 4 h urgent), FK asignatario → 400, archivado/DELETE =
 * soft-delete (200/409), filtros de cola `?status/?priority/?assigneeId/
 * ?archived`, aislamiento cruzado (tenant B) y auditoría con reason de
 * transición.
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
import { createServiceRouters } from '../../apps/api/src/modules/service/index.js';

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
    ...createServiceRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';
const YEAR = new Date().getUTCFullYear();
const HOURS_24 = 24 * 3_600_000;
const HOURS_4 = 4 * 3_600_000;

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

describe('service: tickets de soporte con SLA y reapertura', () => {
  let tokenA = '';
  let tokenB = '';
  let ownerAId = '';
  let ticketA1Id = '';
  let ticketA2Id = '';
  let ticketA3Id = '';

  const postA = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const getA = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenA}`);
  const patchA = (path: string, body: object) =>
    request(app).patch(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const delA = (path: string) => request(app).delete(path).set('Authorization', `Bearer ${tokenA}`);
  const postB = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenB}`).send(body);
  const getB = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenB}`);
  const patchB = (path: string, body: object) =>
    request(app).patch(path).set('Authorization', `Bearer ${tokenB}`).send(body);
  const delB = (path: string) => request(app).delete(path).set('Authorization', `Bearer ${tokenB}`);

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_service'), logger);
    const a = await provision('svc-tenant-a', 'owner-a@svc.example');
    const b = await provision('svc-tenant-b', 'owner-b@svc.example');
    tokenA = a.token;
    tokenB = b.token;
    const me = await getA('/api/v1/auth/me');
    expect(me.status, JSON.stringify(me.body)).toBe(200);
    ownerAId = me.body.data.id as string;
    expect(ownerAId).toBeTruthy();
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('alta: número TK asignado por el servidor, subject recortado, defaults y SLA derivado', async () => {
    const created = await postA('/api/v1/tickets', { subject: '  Alimneto caido  ' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const ticket = created.body.data;
    expect(ticket.number).toBe(`TK-${YEAR}-000001`); // serie del tenant A
    expect(ticket.subject).toBe('Alimneto caido'); // zod `.trim()` en el alta
    expect(ticket.description).toBeNull();
    expect(ticket.status).toBe('open');
    expect(ticket.priority).toBe('normal');
    expect(ticket.assigneeId).toBeNull();
    expect(ticket.resolution).toBeNull();
    expect(ticket.archived).toBe(false);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    // SLA derivado (no almacenado): normal = creación + 24 h.
    const delta =
      new Date(ticket.dueAt as string).getTime() - new Date(ticket.createdAt as string).getTime();
    expect(delta).toBe(HOURS_24);
    ticketA1Id = ticket.id as string;

    const blankSubject = await postA('/api/v1/tickets', { subject: '   ' });
    expect(blankSubject.status).toBe(400); // trim + min(1): en blanco, nunca 500
    expect(blankSubject.body.error.code).toBe('VALIDATION_ERROR');

    const unknownAssignee = await postA('/api/v1/tickets', {
      subject: 'Con asignatario',
      assigneeId: MISSING_ID,
    });
    expect(unknownAssignee.status).toBe(400);
    expect(JSON.stringify(unknownAssignee.body)).toContain('Unknown user');

    const badPriority = await postA('/api/v1/tickets', { subject: 'x', priority: 'bogus' });
    expect(badPriority.status).toBe(400);

    const injected = await postA('/api/v1/tickets', { subject: 'x', tenantId: 'evil' });
    expect(injected.status).toBe(400); // estricto: tenantId solo del JWT
  });

  it('numeración: serie independiente POR tenant y altas concurrentes con números distintos', async () => {
    const fromB = await postB('/api/v1/tickets', { subject: 'Incidencia de B' });
    expect(fromB.status, JSON.stringify(fromB.body)).toBe(201);
    expect(fromB.body.data.number).toBe(`TK-${YEAR}-000001`); // la serie de B no ve la de A

    const [first, second] = await Promise.all([
      postA('/api/v1/tickets', { subject: 'Concurrente 1' }),
      postA('/api/v1/tickets', { subject: 'Concurrente 2' }),
    ]);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    const n1 = first.body.data.number as string;
    const n2 = second.body.data.number as string;
    expect(n1).toMatch(new RegExp(`^TK-${YEAR}-\\d{6}$`));
    expect(n2).toMatch(new RegExp(`^TK-${YEAR}-\\d{6}$`));
    expect(n1).not.toBe(n2); // `$inc` atómico: sin números repetidos
    ticketA2Id = first.body.data.id as string;
    ticketA3Id = second.body.data.id as string;
  });

  it('máquina de estados: resolver exige NOTA en el mismo patch, reapertura limpia y terminales congelan', async () => {
    const started = await patchA(`/api/v1/tickets/${ticketA1Id}`, { status: 'in_progress' });
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    expect(started.body.data.status).toBe('in_progress');

    const resolveNoNote = await patchA(`/api/v1/tickets/${ticketA1Id}`, { status: 'resolved' });
    expect(resolveNoNote.status).toBe(400); // sin escritura
    expect(JSON.stringify(resolveNoNote.body)).toContain(
      'Resolution is required to resolve a ticket',
    );
    const still = await getA(`/api/v1/tickets/${ticketA1Id}`);
    expect(still.body.data.status).toBe('in_progress');

    const resolved = await patchA(`/api/v1/tickets/${ticketA1Id}`, {
      status: 'resolved',
      resolution: '  Servicio reiniciado.  ',
    });
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(200);
    expect(resolved.body.data.status).toBe('resolved');
    expect(resolved.body.data.resolution).toBe('Servicio reiniciado.'); // recortado

    const repeated = await patchA(`/api/v1/tickets/${ticketA1Id}`, { status: 'resolved' });
    expect(repeated.status).toBe(409);
    expect(JSON.stringify(repeated.body)).toContain('Status is already the requested one');

    // Reapertura: resolved → in_progress LIMPIA la nota anterior.
    const reopened = await patchA(`/api/v1/tickets/${ticketA1Id}`, { status: 'in_progress' });
    expect(reopened.status, JSON.stringify(reopened.body)).toBe(200);
    expect(reopened.body.data.status).toBe('in_progress');
    expect(reopened.body.data.resolution).toBeNull();

    const resolvedAgain = await patchA(`/api/v1/tickets/${ticketA1Id}`, {
      status: 'resolved',
      resolution: 'Definitivo: disco reemplazado',
    });
    expect(resolvedAgain.status).toBe(200);

    const closed = await patchA(`/api/v1/tickets/${ticketA1Id}`, { status: 'closed' });
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    expect(closed.body.data.status).toBe('closed');
    expect(closed.body.data.resolution).toBe('Definitivo: disco reemplazado'); // persiste al cerrar

    const businessEdit = await patchA(`/api/v1/tickets/${ticketA1Id}`, { subject: 'hack' });
    expect(businessEdit.status).toBe(409);
    expect(JSON.stringify(businessEdit.body)).toContain('Only non-terminal tickets can be edited');

    const reopen = await patchA(`/api/v1/tickets/${ticketA1Id}`, { status: 'in_progress' });
    expect(reopen.status).toBe(409); // closed es terminal
    expect(JSON.stringify(reopen.body)).toContain('Invalid status transition');

    const bogus = await patchA(`/api/v1/tickets/${ticketA1Id}`, { status: 'bogus' });
    expect(bogus.status).toBe(400);

    // Cancelada es terminal también (desde open, salto directo).
    const cancelled = await patchA(`/api/v1/tickets/${ticketA3Id}`, { status: 'cancelled' });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    const editCancelled = await patchA(`/api/v1/tickets/${ticketA3Id}`, { description: 'x' });
    expect(editCancelled.status).toBe(409);
    expect(JSON.stringify(editCancelled.body)).toContain('Only non-terminal tickets can be edited');
  });

  it('ediciones en no-terminal: recortes, prioridad desplaza el SLA y FK asignatario', async () => {
    const subject = await patchA(`/api/v1/tickets/${ticketA2Id}`, {
      subject: '  Asunto recortado  ',
    });
    expect(subject.status, JSON.stringify(subject.body)).toBe(200);
    expect(subject.body.data.subject).toBe('Asunto recortado');

    const blank = await patchA(`/api/v1/tickets/${ticketA2Id}`, { subject: '   ' });
    expect(blank.status).toBe(400);

    const description = await patchA(`/api/v1/tickets/${ticketA2Id}`, {
      description: '  Detalle  ',
    });
    expect(description.status).toBe(200);
    expect(description.body.data.description).toBe('Detalle');
    const cleared = await patchA(`/api/v1/tickets/${ticketA2Id}`, { description: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.description).toBeNull();

    // Cambiar prioridad DESPLAZA el vencimiento derivado (24 h → 4 h).
    const urgent = await patchA(`/api/v1/tickets/${ticketA2Id}`, { priority: 'urgent' });
    expect(urgent.status, JSON.stringify(urgent.body)).toBe(200);
    expect(urgent.body.data.priority).toBe('urgent');
    const delta =
      new Date(urgent.body.data.dueAt as string).getTime() -
      new Date(urgent.body.data.createdAt as string).getTime();
    expect(delta).toBe(HOURS_4);

    const unknownAssignee = await patchA(`/api/v1/tickets/${ticketA2Id}`, {
      assigneeId: MISSING_ID,
    });
    expect(unknownAssignee.status).toBe(400);
    expect(JSON.stringify(unknownAssignee.body)).toContain('Unknown user');

    const assigned = await patchA(`/api/v1/tickets/${ticketA2Id}`, { assigneeId: ownerAId });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.assigneeId).toBe(ownerAId);
    const unassigned = await patchA(`/api/v1/tickets/${ticketA2Id}`, { assigneeId: null });
    expect(unassigned.status).toBe(200);
    expect(unassigned.body.data.assigneeId).toBeNull();
    const reassigned = await patchA(`/api/v1/tickets/${ticketA2Id}`, { assigneeId: ownerAId });
    expect(reassigned.status).toBe(200);

    // Nota de resolución como BORRADOR en estado abierto (permitida); la
    // exigencia real es solo al cambiar a `resolved`.
    const draft = await patchA(`/api/v1/tickets/${ticketA2Id}`, { resolution: 'borrador' });
    expect(draft.status).toBe(200);

    const empty = await patchA(`/api/v1/tickets/${ticketA2Id}`, {});
    expect(empty.status).toBe(400);
    expect(JSON.stringify(empty.body)).toContain('No valid fields to update');

    const injected = await patchA(`/api/v1/tickets/${ticketA2Id}`, { tenantId: 'evil' });
    expect(injected.status).toBe(400); // estricto
  });

  it('DELETE publicado = soft-delete, filtros de cola y listados', async () => {
    const deleted = await delA(`/api/v1/tickets/${ticketA3Id}`);
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    expect(deleted.body.data.archived).toBe(true);

    const again = await delA(`/api/v1/tickets/${ticketA3Id}`);
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain('Ticket is already archived');

    const restored = await patchA(`/api/v1/tickets/${ticketA3Id}`, { archived: false });
    expect(restored.status).toBe(200);
    expect(restored.body.data.archived).toBe(false);
    const archivedList = await getA('/api/v1/tickets?archived=true');
    expect(archivedList.status).toBe(200);
    expect(archivedList.body.meta.total).toBe(0);

    const closedQueue = await getA('/api/v1/tickets?status=closed');
    expect(closedQueue.status).toBe(200);
    expect(closedQueue.body.meta.total).toBe(1); // ticket A1

    const cancelledQueue = await getA('/api/v1/tickets?status=cancelled');
    expect(cancelledQueue.body.meta.total).toBe(1); // ticket A3

    const urgentQueue = await getA('/api/v1/tickets?priority=urgent');
    expect(urgentQueue.body.meta.total).toBe(1); // ticket A2

    const mine = await getA(`/api/v1/tickets?assigneeId=${ownerAId}`);
    expect(mine.status).toBe(200);
    expect(mine.body.meta.total).toBe(1); // cola personal de A2

    const badAssignee = await getA('/api/v1/tickets?assigneeId=nope');
    expect(badAssignee.status).toBe(400); // ObjectId inválido
    const badStatus = await getA('/api/v1/tickets?status=nope');
    expect(badStatus.status).toBe(400);

    const all = await getA('/api/v1/tickets');
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(3);

    // `tenantId` en la query se descarta (zod no lo conoce): sin efecto.
    const injected = await getA('/api/v1/tickets?tenantId=evil');
    expect(injected.status).toBe(200);
    expect(injected.body.meta.total).toBe(3);
    expect(JSON.stringify(injected.body)).not.toContain('tenantId');
  });

  it('aislamiento: B no lee ni edita tickets de A', async () => {
    const fromB = await getB(`/api/v1/tickets/${ticketA1Id}`);
    expect(fromB.status).toBe(404); // inexistente y ajeno → 404 uniforme
    const patchFromB = await patchB(`/api/v1/tickets/${ticketA1Id}`, { subject: 'hack' });
    expect(patchFromB.status).toBe(404);
    const deleteFromB = await delB(`/api/v1/tickets/${ticketA1Id}`);
    expect(deleteFromB.status).toBe(404); // DELETE existe: ajeno → 404 uniforme

    const listB = await getB('/api/v1/tickets');
    expect(listB.status).toBe(200);
    expect(listB.body.meta.total).toBe(1); // solo el suyo
    const listA = await getA('/api/v1/tickets');
    expect(listA.body.meta.total).toBe(3);
  });

  it('auditoría: altas, transiciones con reason y archivado por tenant', async () => {
    const creates = await getA('/api/v1/audit?action=ticket.create&limit=50');
    expect(creates.status).toBe(200);
    expect(creates.body.meta.total).toBe(3); // A1, A2, A3 — solo éxitos

    const updates = await getA(
      `/api/v1/audit?action=ticket.update&entityId=${ticketA1Id}&limit=50`,
    );
    expect(updates.status).toBe(200);
    expect(
      (
        updates.body.data as Array<{
          metadata?: { reason?: string };
        }>
      ).some((e) => e.metadata?.reason === 'status:closed'),
    ).toBe(true);

    const archives = await getA(
      `/api/v1/audit?action=ticket.archive&entityId=${ticketA3Id}&limit=50`,
    );
    expect(archives.status).toBe(200);
    expect(archives.body.meta.total).toBe(1); // el DELETE de A3

    const fromB = await getB(`/api/v1/audit?action=ticket.update&entityId=${ticketA1Id}&limit=50`);
    expect(fromB.status).toBe(200);
    expect(fromB.body.meta.total).toBe(0);
  });
});
