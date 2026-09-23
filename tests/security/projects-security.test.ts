/**
 * Seguridad Projects — FASE 17.
 * 401 en las 10 rutas sin token/token manipulado, 403 con `details.permission`
 * por verbo (PROYECTOS y tareas comparten el grupo `project:*`), leer no
 * implica crear/actualizar/borrar, token con `pv` obsoleta (sin cambios de
 * catálogo en FASE 17: pv=2 vigente), entrada estricta (tenantId/`code`
 * inmutable/`projectId` fijo), DELETE PUBLICADO = soft-delete (200/409 con
 * `project:delete`) y ausencia de `tenantId` en respuestas.
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
    { path: '/api/v1/users', router: createUserRouter(deps) },
    { path: '/api/v1/roles', router: createRoleRouter(deps) },
    ...createProjectsRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const ID_PATH = '0123456789abcdef01234567';

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';
let projectReaderToken = '';
let projectId = '';
let taskId = '';
let delProjectId = '';
let delTaskId = '';

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

async function createRole(owner: string, key: string, permissions: string[]): Promise<void> {
  const res = await request(app)
    .post('/api/v1/roles')
    .set('Authorization', `Bearer ${owner}`)
    .send({ key, name: key, permissions });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

async function createUser(owner: string, email: string, roles: string[]): Promise<string> {
  const res = await request(app)
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${owner}`)
    .send({ email, password: PASSWORD, displayName: email.split('@')[0], roles });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return login(email);
}

describe('projects security: grupo project:* en ambos recursos, DELETE real y entrada estricta', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_projects_sec'), logger);

    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'PROJSEC',
        slug: 'proj-sec',
        owner: { email: 'projsec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(res.status).toBe(201);
    ownerToken = await login('projsec-owner@example.com');

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'sec-fix', name: 'Proyecto Seguridad' });
    expect(project.status, JSON.stringify(project.body)).toBe(201);
    projectId = project.body.data.id as string;

    const task = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ projectId, title: 'Tarea Seguridad' });
    expect(task.status, JSON.stringify(task.body)).toBe(201);
    taskId = task.body.data.id as string;

    // Proyecto + tarea DEDICADOS para el DELETE real (soft-delete 200/409).
    const delProject = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'sec-del', name: 'Para borrar' });
    expect(delProject.status).toBe(201);
    delProjectId = delProject.body.data.id as string;
    const delTask = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ projectId: delProjectId, title: 'Tarea para borrar' });
    expect(delTask.status).toBe(201);
    delTaskId = delTask.body.data.id as string;

    // Roles con permisos EXACTOS (denegación por defecto).
    await createRole(ownerToken, 'project-reader', ['project:read']);
    readerToken = await createUser(ownerToken, 'projsec-reader@example.com', []);
    projectReaderToken = await createUser(ownerToken, 'projsec-projectreader@example.com', [
      'project-reader',
    ]);
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 UNAUTHENTICATED en las 10 rutas sin token y con token manipulado', async () => {
    const cases: ReadonlyArray<{
      readonly method: 'get' | 'post' | 'patch' | 'delete';
      readonly path: string;
    }> = [
      { method: 'get', path: '/api/v1/projects' },
      { method: 'post', path: '/api/v1/projects' },
      { method: 'get', path: `/api/v1/projects/${ID_PATH}` },
      { method: 'patch', path: `/api/v1/projects/${ID_PATH}` },
      { method: 'delete', path: `/api/v1/projects/${ID_PATH}` },
      { method: 'get', path: '/api/v1/tasks' },
      { method: 'post', path: '/api/v1/tasks' },
      { method: 'get', path: `/api/v1/tasks/${ID_PATH}` },
      { method: 'patch', path: `/api/v1/tasks/${ID_PATH}` },
      { method: 'delete', path: `/api/v1/tasks/${ID_PATH}` },
    ];
    for (const c of cases) {
      const anon = await (c.method === 'get'
        ? request(app).get(c.path)
        : c.method === 'post'
          ? request(app).post(c.path).send({})
          : c.method === 'patch'
            ? request(app).patch(c.path).send({})
            : request(app).delete(c.path));
      expect(anon.status, `${c.method} ${c.path}`).toBe(401);
      expect(anon.body.error.code).toBe('UNAUTHENTICATED');
    }
    const tampered = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${ownerToken.slice(0, -4)}beef`);
    expect(tampered.status).toBe(401);
  });

  it('403 FORBIDDEN con details.permission por verbo en proyectos y tareas', async () => {
    const cases: ReadonlyArray<{
      readonly method: 'get' | 'post' | 'patch' | 'delete';
      readonly path: string;
      readonly permission: string;
    }> = [
      { method: 'get', path: '/api/v1/projects', permission: 'project:read' },
      { method: 'post', path: '/api/v1/projects', permission: 'project:create' },
      { method: 'patch', path: `/api/v1/projects/${projectId}`, permission: 'project:update' },
      { method: 'delete', path: `/api/v1/projects/${projectId}`, permission: 'project:delete' },
      { method: 'get', path: '/api/v1/tasks', permission: 'project:read' },
      { method: 'post', path: '/api/v1/tasks', permission: 'project:create' },
      { method: 'patch', path: `/api/v1/tasks/${taskId}`, permission: 'project:update' },
      { method: 'delete', path: `/api/v1/tasks/${taskId}`, permission: 'project:delete' },
    ];
    for (const c of cases) {
      const res = await (
        c.method === 'get'
          ? request(app).get(c.path)
          : c.method === 'post'
            ? request(app).post(c.path).send({})
            : c.method === 'patch'
              ? request(app).patch(c.path).send({ name: 'x' })
              : request(app).delete(c.path)
      ).set('Authorization', `Bearer ${readerToken}`); // roles: [] → sin permisos
      expect(res.status, `${c.method} ${c.path}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('Missing permission');
      expect(res.body.error.details.permission).toBe(c.permission);
    }
  });

  it('project:read habilita AMBOS recursos; leer no implica crear/actualizar/borrar', async () => {
    // Ambos montajes comparten el grupo `project` (una sola lectura).
    const projects = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${projectReaderToken}`);
    expect(projects.status).toBe(200);
    const tasks = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${projectReaderToken}`);
    expect(tasks.status).toBe(200);

    const createProject = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${projectReaderToken}`)
      .send({});
    expect(createProject.status).toBe(403);
    expect(createProject.body.error.details.permission).toBe('project:create');

    const patchProject = await request(app)
      .patch(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${projectReaderToken}`)
      .send({ name: 'x' });
    expect(patchProject.status).toBe(403); // leer ≠ actualizar
    expect(patchProject.body.error.details.permission).toBe('project:update');

    const deleteProject = await request(app)
      .delete(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${projectReaderToken}`);
    expect(deleteProject.status).toBe(403); // leer ≠ borrar
    expect(deleteProject.body.error.details.permission).toBe('project:delete');

    const deleteTask = await request(app)
      .delete(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${projectReaderToken}`);
    expect(deleteTask.status).toBe(403);
    expect(deleteTask.body.error.details.permission).toBe('project:delete');
  });

  it('token con pv obsoleta → 403 de re-autenticación; FASE 17 NO bumpó el catálogo', async () => {
    expect(PERMISSION_CATALOG_VERSION).toBe(2); // sin cambios: project:* ya existía
    const ownerClaims = jwt.verifyAccessToken(ownerToken);
    const stale = jwt.signAccessToken({
      userId: ownerClaims.sub,
      tenantId: ownerClaims.tenantId,
      roles: ownerClaims.roles,
      permissions: [...ownerClaims.permissions],
      permVersion: PERMISSION_CATALOG_VERSION - 1, // v1 obsoleta
      sessionId: ownerClaims.sid,
    });

    const projects = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${stale}`);
    expect(projects.status).toBe(403);
    expect(projects.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const tasks = await request(app).get('/api/v1/tasks').set('Authorization', `Bearer ${stale}`);
    expect(tasks.status).toBe(403);
    expect(tasks.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(200); // solo-autenticada sigue operativa
  });

  it('entrada estricta: tenantId/code/projectId fijos, id malformado y DELETE real 200/409', async () => {
    const injectedTenant = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tenantId: 'evil' });
    expect(injectedTenant.status).toBe(400); // estricto: tenantId solo del JWT

    const unknownKey = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ projectId: ID_PATH, title: 'x', hack: true });
    expect(unknownKey.status).toBe(400);

    const patchCode = await request(app)
      .patch(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'NEWCODE' });
    expect(patchCode.status).toBe(400); // `code` es clave natural inmutable

    const patchProjectId = await request(app)
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ projectId: ID_PATH });
    expect(patchProjectId.status).toBe(400); // `projectId` se fija al crear

    const badId = await request(app)
      .patch('/api/v1/projects/not-an-id')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'x' });
    expect(badId.status).toBe(400);

    const unknownRoute = await request(app)
      .get('/api/v1/project')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(unknownRoute.status).toBe(404); // montaje inexistente

    // DELETE PUBLICADO (project:delete existe en el catálogo): soft-delete.
    const deletedTask = await request(app)
      .delete(`/api/v1/tasks/${delTaskId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deletedTask.status, JSON.stringify(deletedTask.body)).toBe(200);
    expect(deletedTask.body.data.archived).toBe(true);
    const deletedTaskAgain = await request(app)
      .delete(`/api/v1/tasks/${delTaskId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deletedTaskAgain.status).toBe(409);

    const deletedProject = await request(app)
      .delete(`/api/v1/projects/${delProjectId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deletedProject.status, JSON.stringify(deletedProject.body)).toBe(200);
    expect(deletedProject.body.data.archived).toBe(true);
    const deletedProjectAgain = await request(app)
      .delete(`/api/v1/projects/${delProjectId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deletedProjectAgain.status).toBe(409);
    expect(JSON.stringify(deletedProjectAgain.body)).toContain('Project is already archived');
  });

  it('las respuestas nunca filtran tenantId', async () => {
    const projects = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(projects.status).toBe(200);
    expect(JSON.stringify(projects.body)).not.toContain('tenantId');

    const tasks = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(tasks.status).toBe(200);
    expect(JSON.stringify(tasks.body)).not.toContain('tenantId');

    const created = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'sec-new', name: 'Nuevo' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');

    const fetched = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(fetched.status).toBe(200);
    expect(JSON.stringify(fetched.body)).not.toContain('tenantId');
  });
});
