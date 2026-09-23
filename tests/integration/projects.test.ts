/**
 * Integración Projects — FASE 17.
 * Contra MongoDB real (memory server): proyecto con clave natural única por
 * tenant e inmutable, máquina de estados planning→active→completed/cancelled
 * (409 en saltos y repetidos, edición solo en estados NO terminales), DELETE
 * publicado = soft-delete (project:delete), tareas con FKs (proyecto/archivar
 * → 409, usuario desconocido → 400), dependencias solo del MISMO proyecto
 * (404 ajeno/400 otro proyecto, self/dup 400, ciclos 400 por BFS), completar
 * bloqueado hasta desbloquear dependencias (409 con blockedBy; cancelada
 * desbloquea), filtros de cola ?status/?projectId/?archived, aislamiento
 * cruzado (tenant B) y auditoría con reason de transición.
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
import { createProjectsRouters } from '../../apps/api/src/modules/projects/index.js';

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
    ...createProjectsRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';

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

describe('projects: proyectos, tareas y dependencias', () => {
  let tokenA = '';
  let tokenB = '';
  let ownerAId = '';
  let projectA1Id = '';
  let projectA2Id = '';
  let projectA3Id = '';
  let projectA4Id = '';
  let projectBId = '';
  let task1Id = '';
  let task2Id = '';
  let task3Id = '';
  let task4Id = '';
  let task5Id = '';

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
    await connectDatabase(mongod.getUri('erp_projects'), logger);
    const a = await provision('proj-tenant-a', 'owner-a@proj.example');
    const b = await provision('proj-tenant-b', 'owner-b@proj.example');
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

  it('proyecto: código normalizado, único POR tenant, fechas/coherencia y sin tenantId', async () => {
    const created = await postA('/api/v1/projects', { code: 'web portal', name: 'Web Portal' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const project = created.body.data;
    expect(project.code).toBe('WEB-PORTAL'); // mayúsculas y espacios → guiones
    expect(project.status).toBe('planning'); // estado inicial
    expect(project.archived).toBe(false);
    expect(project.description).toBeNull();
    expect(project.startDate).toBeNull();
    expect(project.endDate).toBeNull();
    expect(project.managerId).toBeNull();
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    projectA1Id = project.id as string;

    const duplicate = await postA('/api/v1/projects', { code: 'WEB-PORTAL', name: 'Otro' });
    expect(duplicate.status).toBe(409); // índice único (tenantId, code)
    expect(JSON.stringify(duplicate.body)).toContain('Code already exists');

    const invalidCode = await postA('/api/v1/projects', { code: 'x', name: 'X' });
    expect(invalidCode.status).toBe(400);
    expect(JSON.stringify(invalidCode.body)).toContain('Invalid code');

    // Regresión FASE 18: nombre en blanco llegaba a mongoose (`required`) → 500.
    const blankName = await postA('/api/v1/projects', { code: 'blank-nm', name: '   ' });
    expect(blankName.status).toBe(400); // zod `.trim()` + min(1) sobre el recortado
    expect(blankName.body.error.code).toBe('VALIDATION_ERROR');

    // Mismo código en OTRO tenant → permitido (unicidad por tenant).
    const fromB = await postB('/api/v1/projects', { code: 'WEB-PORTAL', name: 'Portal B' });
    expect(fromB.status).toBe(201);
    projectBId = fromB.body.data.id as string;

    // Fechas + gerente: descripción en blanco → null, fechas a medianoche UTC.
    const withDates = await postA('/api/v1/projects', {
      code: 'app-1',
      name: 'App Móvil',
      description: '   ',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      managerId: ownerAId,
    });
    expect(withDates.status, JSON.stringify(withDates.body)).toBe(201);
    projectA2Id = withDates.body.data.id as string;
    expect(withDates.body.data.code).toBe('APP-1');
    expect(withDates.body.data.description).toBeNull();
    expect(withDates.body.data.startDate).toBe('2026-01-01T00:00:00.000Z');
    expect(withDates.body.data.endDate).toBe('2026-06-30T00:00:00.000Z');
    expect(withDates.body.data.managerId).toBe(ownerAId);

    const inverted = await postA('/api/v1/projects', {
      code: 'inv-d',
      name: 'Invertidas',
      startDate: '2026-06-30',
      endDate: '2026-01-01',
    });
    expect(inverted.status).toBe(400);
    expect(JSON.stringify(inverted.body)).toContain('endDate must be on or after startDate');

    const unknownManager = await postA('/api/v1/projects', {
      code: 'mgr-404',
      name: 'X',
      managerId: MISSING_ID,
    });
    expect(unknownManager.status).toBe(400);
    expect(JSON.stringify(unknownManager.body)).toContain('Unknown user');

    const injected = await postA('/api/v1/projects', {
      code: 'evil-d',
      name: 'X',
      tenantId: 'evil',
    });
    expect(injected.status).toBe(400); // estricto: tenantId solo del JWT
  });

  it('proyecto: máquina de estados (409 en saltos/repetidos) y edición solo no-terminal', async () => {
    const activated = await patchA(`/api/v1/projects/${projectA1Id}`, { status: 'active' });
    expect(activated.status, JSON.stringify(activated.body)).toBe(200);
    expect(activated.body.data.status).toBe('active');

    const backwards = await patchA(`/api/v1/projects/${projectA1Id}`, { status: 'planning' });
    expect(backwards.status).toBe(409);
    expect(JSON.stringify(backwards.body)).toContain('Invalid status transition');

    const repeated = await patchA(`/api/v1/projects/${projectA1Id}`, { status: 'active' });
    expect(repeated.status).toBe(409);
    expect(JSON.stringify(repeated.body)).toContain('Status is already the requested one');

    const bogus = await patchA(`/api/v1/projects/${projectA1Id}`, { status: 'bogus' });
    expect(bogus.status).toBe(400); // enum de estados

    const renamed = await patchA(`/api/v1/projects/${projectA1Id}`, { name: 'Web Portal v2' });
    expect(renamed.status).toBe(200); // no terminal → editable
    expect(renamed.body.data.name).toBe('Web Portal v2');

    // Regresión FASE 18: renombrar a solo espacios → 400 (no vaciar el campo).
    const blankRename = await patchA(`/api/v1/projects/${projectA1Id}`, { name: '   ' });
    expect(blankRename.status).toBe(400);
    expect(blankRename.body.error.code).toBe('VALIDATION_ERROR');

    const held = await patchA(`/api/v1/projects/${projectA1Id}`, { status: 'on_hold' });
    expect(held.status).toBe(200);
    const resumed = await patchA(`/api/v1/projects/${projectA1Id}`, { status: 'active' });
    expect(resumed.status).toBe(200);

    const completed = await patchA(`/api/v1/projects/${projectA1Id}`, { status: 'completed' });
    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
    expect(completed.body.data.status).toBe('completed');

    const businessEdit = await patchA(`/api/v1/projects/${projectA1Id}`, { name: 'hack' });
    expect(businessEdit.status).toBe(409);
    expect(JSON.stringify(businessEdit.body)).toContain('Only non-terminal projects can be edited');

    const reopen = await patchA(`/api/v1/projects/${projectA1Id}`, { status: 'active' });
    expect(reopen.status).toBe(409); // terminal sin salida

    // `archived` es ortogonal al estado terminal.
    const archived = await patchA(`/api/v1/projects/${projectA1Id}`, { archived: true });
    expect(archived.status).toBe(200);
    expect(archived.body.data.archived).toBe(true);
    const again = await patchA(`/api/v1/projects/${projectA1Id}`, { archived: true });
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain('Project is already archived');
    const restored = await patchA(`/api/v1/projects/${projectA1Id}`, { archived: false });
    expect(restored.status).toBe(200);
    expect(restored.body.data.archived).toBe(false);

    const empty = await patchA(`/api/v1/projects/${projectA1Id}`, {});
    expect(empty.status).toBe(400);
    expect(JSON.stringify(empty.body)).toContain('No valid fields to update');
  });

  it('proyecto: DELETE publicado = soft-delete, code inmutable y filtros de cola', async () => {
    const created = await postA('/api/v1/projects', { code: 'ops-run', name: 'Ops Runbook' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    projectA3Id = created.body.data.id as string;

    const deleted = await delA(`/api/v1/projects/${projectA3Id}`);
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    expect(deleted.body.data.archived).toBe(true);

    const again = await delA(`/api/v1/projects/${projectA3Id}`);
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain('Project is already archived');

    const archivedList = await getA('/api/v1/projects?archived=true');
    expect(archivedList.status).toBe(200);
    expect(archivedList.body.meta.total).toBe(1); // solo A3
    const restored = await patchA(`/api/v1/projects/${projectA3Id}`, { archived: false });
    expect(restored.status).toBe(200);
    const noneArchived = await getA('/api/v1/projects?archived=true');
    expect(noneArchived.body.meta.total).toBe(0);

    const patchCode = await patchA(`/api/v1/projects/${projectA3Id}`, { code: 'OTRO' });
    expect(patchCode.status).toBe(400); // clave natural inmutable (no está en el PATCH)

    const completed = await getA('/api/v1/projects?status=completed');
    expect(completed.status).toBe(200);
    expect(completed.body.meta.total).toBe(1); // A1

    // `tenantId` en la query se descarta (zod no lo conoce): el filtro SIEMPRE
    // sale del JWT y la respuesta no lo refleja.
    const injected = await getA('/api/v1/projects?tenantId=evil');
    expect(injected.status).toBe(200);
    expect(injected.body.meta.total).toBe(3); // A1, A2, A3 — nada cambió
    expect(JSON.stringify(injected.body)).not.toContain('tenantId');
  });

  it('tarea: alta con FKs y defaults (open/normal/[]/sin asignado)', async () => {
    const created = await postA('/api/v1/tasks', {
      projectId: projectA1Id,
      title: 'Diseñar wireframes',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const task = created.body.data;
    expect(task.projectId).toBe(projectA1Id);
    expect(task.title).toBe('Diseñar wireframes');
    expect(task.description).toBeNull();
    expect(task.status).toBe('open');
    expect(task.priority).toBe('normal');
    expect(task.assigneeId).toBeNull();
    expect(task.dueDate).toBeNull();
    expect(task.dependsOn).toEqual([]);
    expect(task.archived).toBe(false);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    task1Id = task.id as string;

    const unknownProject = await postA('/api/v1/tasks', { projectId: MISSING_ID, title: 'x' });
    expect(unknownProject.status).toBe(404);

    const foreignProject = await postA('/api/v1/tasks', { projectId: projectBId, title: 'x' });
    expect(foreignProject.status).toBe(404); // proyecto de B → 404 uniforme

    const unknownAssignee = await postA('/api/v1/tasks', {
      projectId: projectA1Id,
      title: 'x',
      assigneeId: MISSING_ID,
    });
    expect(unknownAssignee.status).toBe(400);
    expect(JSON.stringify(unknownAssignee.body)).toContain('Unknown user');

    const badPriority = await postA('/api/v1/tasks', {
      projectId: projectA1Id,
      title: 'x',
      priority: 'urgent',
    });
    expect(badPriority.status).toBe(400);

    // Regresión FASE 18: título en blanco → 400 (zod `.trim()`), no 500.
    const blankTitle = await postA('/api/v1/tasks', {
      projectId: projectA1Id,
      title: '   ',
    });
    expect(blankTitle.status).toBe(400);

    // Proyecto archivado no admite tareas nuevas (409), pero sigue legible.
    const archived = await patchA(`/api/v1/projects/${projectA2Id}`, { archived: true });
    expect(archived.status).toBe(200);
    const onArchived = await postA('/api/v1/tasks', {
      projectId: projectA2Id,
      title: 'x',
    });
    expect(onArchived.status).toBe(409);
    expect(JSON.stringify(onArchived.body)).toContain('Project is archived');

    const injected = await postA('/api/v1/tasks', {
      projectId: projectA1Id,
      title: 'x',
      tenantId: 'evil',
    });
    expect(injected.status).toBe(400); // estricto: tenantId solo del JWT
  });

  it('tarea: dependencias del MISMO proyecto (404/400), self/dup y ciclo → 400', async () => {
    const created = await postA('/api/v1/tasks', {
      projectId: projectA1Id,
      title: 'Implementar API',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    task2Id = created.body.data.id as string;

    const dependency = await patchA(`/api/v1/tasks/${task1Id}`, { dependsOn: [task2Id] });
    expect(dependency.status, JSON.stringify(dependency.body)).toBe(200);
    expect(dependency.body.data.dependsOn).toEqual([task2Id]);

    const self = await patchA(`/api/v1/tasks/${task2Id}`, { dependsOn: [task2Id] });
    expect(self.status).toBe(400);
    expect(JSON.stringify(self.body)).toContain('A task cannot depend on itself');

    const duplicated = await patchA(`/api/v1/tasks/${task2Id}`, {
      dependsOn: [task1Id, task1Id],
    });
    expect(duplicated.status).toBe(400);
    expect(JSON.stringify(duplicated.body)).toContain('Duplicate dependency');

    const unknownDep = await patchA(`/api/v1/tasks/${task2Id}`, { dependsOn: [MISSING_ID] });
    expect(unknownDep.status).toBe(404);

    // Segundo proyecto en A para dependencias cruzadas de proyecto.
    const projectA4 = await postA('/api/v1/projects', { code: 'lab-4', name: 'Laboratorio 4' });
    expect(projectA4.status, JSON.stringify(projectA4.body)).toBe(201);
    projectA4Id = projectA4.body.data.id as string;
    const task3 = await postA('/api/v1/tasks', {
      projectId: projectA4Id,
      title: 'Preparar entorno',
    });
    expect(task3.status, JSON.stringify(task3.body)).toBe(201);
    task3Id = task3.body.data.id as string;

    const otherProject = await patchA(`/api/v1/tasks/${task1Id}`, { dependsOn: [task3Id] });
    expect(otherProject.status).toBe(400);
    expect(JSON.stringify(otherProject.body)).toContain(
      'Dependencies must belong to the same project',
    );

    // task1 YA depende de task2 → task2 sobre task1 crearía el ciclo 2↔1.
    const cycle = await patchA(`/api/v1/tasks/${task2Id}`, { dependsOn: [task1Id] });
    expect(cycle.status).toBe(400);
    expect(JSON.stringify(cycle.body)).toContain('Circular dependency detected');

    // Alta con dependencia válida (cadena task4 → task1 → task2).
    const task4 = await postA('/api/v1/tasks', {
      projectId: projectA1Id,
      title: 'Cubrir con tests',
      dependsOn: [task1Id],
    });
    expect(task4.status, JSON.stringify(task4.body)).toBe(201);
    expect(task4.body.data.dependsOn).toEqual([task1Id]);
    task4Id = task4.body.data.id as string;
  });

  it('tarea: máquina de estados y completar bloqueado hasta desbloquear dependencias', async () => {
    // task2 sin dependencias → ciclo libre hasta done.
    const started2 = await patchA(`/api/v1/tasks/${task2Id}`, { status: 'in_progress' });
    expect(started2.status).toBe(200);
    const done2 = await patchA(`/api/v1/tasks/${task2Id}`, { status: 'done' });
    expect(done2.status, JSON.stringify(done2.body)).toBe(200);
    expect(done2.body.data.status).toBe('done');

    // task1 depende de task2 (ya done) → puede completar.
    const started1 = await patchA(`/api/v1/tasks/${task1Id}`, { status: 'in_progress' });
    expect(started1.status).toBe(200);
    const done1 = await patchA(`/api/v1/tasks/${task1Id}`, { status: 'done' });
    expect(done1.status, JSON.stringify(done1.body)).toBe(200);

    // task5 depende de task4 (open) → completar queda bloqueado SIN escribir.
    const task5 = await postA('/api/v1/tasks', {
      projectId: projectA1Id,
      title: 'Revisar entrega',
      dependsOn: [task4Id],
    });
    expect(task5.status, JSON.stringify(task5.body)).toBe(201);
    task5Id = task5.body.data.id as string;

    const blocked = await patchA(`/api/v1/tasks/${task5Id}`, { status: 'done' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toBe('Task has unfinished dependencies');
    expect(blocked.body.error.details).toEqual({ blockedBy: [task4Id] });
    const still = await getA(`/api/v1/tasks/${task5Id}`);
    expect(still.body.data.status).toBe('open'); // pre-chequeo antes de escribir

    // Cancelar la dependencia DESBLOQUEA (nunca se hará).
    const cancelled = await patchA(`/api/v1/tasks/${task4Id}`, { status: 'cancelled' });
    expect(cancelled.status).toBe(200);
    const done5 = await patchA(`/api/v1/tasks/${task5Id}`, { status: 'done' });
    expect(done5.status, JSON.stringify(done5.body)).toBe(200);

    const repeated = await patchA(`/api/v1/tasks/${task5Id}`, { status: 'done' });
    expect(repeated.status).toBe(409);
    expect(JSON.stringify(repeated.body)).toContain('Status is already the requested one');

    const reopen = await patchA(`/api/v1/tasks/${task5Id}`, { status: 'open' });
    expect(reopen.status).toBe(409); // done es terminal
    expect(JSON.stringify(reopen.body)).toContain('Invalid status transition');

    const bogus = await patchA(`/api/v1/tasks/${task5Id}`, { status: 'bogus' });
    expect(bogus.status).toBe(400);

    const terminalEdit = await patchA(`/api/v1/tasks/${task2Id}`, { title: 'hack' });
    expect(terminalEdit.status).toBe(409);
    expect(JSON.stringify(terminalEdit.body)).toContain('Only non-terminal tasks can be edited');

    const empty = await patchA(`/api/v1/tasks/${task5Id}`, {});
    expect(empty.status).toBe(400);
    expect(JSON.stringify(empty.body)).toContain('No valid fields to update');
  });

  it('filtros de cola ?projectId/?status/?archived y DELETE de tarea = soft-delete', async () => {
    const inProject = await getA(`/api/v1/tasks?projectId=${projectA1Id}`);
    expect(inProject.status).toBe(200);
    expect(inProject.body.meta.total).toBe(4); // task1, task2, task4, task5

    const done = await getA('/api/v1/tasks?status=done');
    expect(done.status).toBe(200);
    expect(done.body.meta.total).toBe(3); // task1, task2, task5

    const open = await getA('/api/v1/tasks?status=open');
    expect(open.status).toBe(200);
    expect(open.body.meta.total).toBe(1); // task3 (A4)

    const inProgress = await getA('/api/v1/tasks?status=in_progress');
    expect(inProgress.status).toBe(200);
    expect(inProgress.body.meta.total).toBe(0);

    const all = await getA('/api/v1/tasks');
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(5);

    const deleted = await delA(`/api/v1/tasks/${task3Id}`);
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    expect(deleted.body.data.archived).toBe(true);
    const again = await delA(`/api/v1/tasks/${task3Id}`);
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain('Task is already archived');

    const archived = await getA('/api/v1/tasks?archived=true');
    expect(archived.status).toBe(200);
    expect(archived.body.meta.total).toBe(1); // task3
    const notArchived = await getA('/api/v1/tasks?archived=false');
    expect(notArchived.body.meta.total).toBe(4);

    const completedProjects = await getA('/api/v1/projects?status=completed');
    expect(completedProjects.body.meta.total).toBe(1); // A1
    const badStatus = await getA('/api/v1/tasks?status=nope');
    expect(badStatus.status).toBe(400); // enum de estados
  });

  it('aislamiento: B no ve ni edita proyectos/tareas de A', async () => {
    const projectFromB = await getB(`/api/v1/projects/${projectA1Id}`);
    expect(projectFromB.status).toBe(404); // inexistente y ajeno → 404 uniforme
    const taskFromB = await getB(`/api/v1/tasks/${task1Id}`);
    expect(taskFromB.status).toBe(404);

    const projectsB = await getB('/api/v1/projects');
    expect(projectsB.status).toBe(200);
    expect(projectsB.body.meta.total).toBe(1); // solo la suya
    const ownProject = await getB(`/api/v1/projects/${projectBId}`);
    expect(ownProject.status).toBe(200);
    expect(ownProject.body.data.id).toBe(projectBId);

    const tasksB = await getB('/api/v1/tasks');
    expect(tasksB.status).toBe(200);
    expect(tasksB.body.meta.total).toBe(0); // B nunca creó tareas

    const patchProjectFromB = await patchB(`/api/v1/projects/${projectA1Id}`, { name: 'hack' });
    expect(patchProjectFromB.status).toBe(404);
    const patchTaskFromB = await patchB(`/api/v1/tasks/${task1Id}`, { title: 'hack' });
    expect(patchTaskFromB.status).toBe(404);
    const deleteFromB = await delB(`/api/v1/projects/${projectA1Id}`);
    expect(deleteFromB.status).toBe(404); // DELETE existe: ajeno → 404 uniforme

    const foreignProjectCreate = await postB('/api/v1/tasks', {
      projectId: projectA1Id,
      title: 'hack',
    });
    expect(foreignProjectCreate.status).toBe(404);

    // La dependencia ajena tampoco se resuelve entre tenants.
    const foreignDepCreate = await postB('/api/v1/tasks', {
      projectId: projectBId,
      title: 'x',
      dependsOn: [task1Id],
    });
    expect(foreignDepCreate.status).toBe(404);
  });

  it('auditoría: altas, transiciones con reason y archivado por tenant', async () => {
    const projectCreates = await getA('/api/v1/audit?action=project.create&limit=50');
    expect(projectCreates.status).toBe(200);
    expect(projectCreates.body.meta.total).toBe(4); // A1, A2, A3, A4

    const taskCreates = await getA('/api/v1/audit?action=task.create&limit=50');
    expect(taskCreates.status).toBe(200);
    expect(taskCreates.body.meta.total).toBe(5); // task1..task5, solo éxitos

    const updates = await getA(
      `/api/v1/audit?action=project.update&entityId=${projectA1Id}&limit=50`,
    );
    expect(updates.status).toBe(200);
    expect(
      (
        updates.body.data as Array<{
          metadata?: { reason?: string };
        }>
      ).some((e) => e.metadata?.reason === 'status:completed'),
    ).toBe(true);

    const archives = await getA(
      `/api/v1/audit?action=project.archive&entityId=${projectA3Id}&limit=50`,
    );
    expect(archives.status).toBe(200);
    expect(archives.body.meta.total).toBe(1); // el DELETE de A3

    // El mismo filtro en el tenant B no devuelve nada de A.
    const updatesFromB = await getB(
      `/api/v1/audit?action=project.update&entityId=${projectA1Id}&limit=50`,
    );
    expect(updatesFromB.status).toBe(200);
    expect(updatesFromB.body.meta.total).toBe(0);
  });
});
