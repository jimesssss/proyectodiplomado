/**
 * Seguridad Service — FASE 18.
 * 401 en las 5 rutas sin token/token manipulado, 403 con `details.permission`
 * por verbo (`ticket:read/create/update/delete`), leer no implica
 * crear/actualizar/borrar, token con `pv` obsoleta (SIN bump de catálogo en
 * FASE 18: `ticket:*` lleva desde v1 — corrige el pronóstico de FASE 17),
 * entrada estricta (`tenantId`, `number`/`dueAt` inexistentes en el body),
 * DELETE PUBLICADO = soft-delete (200/409 con `ticket:delete`) y ausencia de
 * `tenantId` en respuestas.
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
    { path: '/api/v1/users', router: createUserRouter(deps) },
    { path: '/api/v1/roles', router: createRoleRouter(deps) },
    ...createServiceRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const ID_PATH = '0123456789abcdef01234567';

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';
let ticketReaderToken = '';
let ticketId = '';
let delTicketId = '';

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

describe('service security: permisos ticket:* por verbo, entrada estricta y DELETE real', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_service_sec'), logger);

    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'SVCSEC',
        slug: 'svc-sec',
        owner: { email: 'svcsec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(res.status).toBe(201);
    ownerToken = await login('svcsec-owner@example.com');

    const ticket = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ subject: 'Ticket Seguridad' });
    expect(ticket.status, JSON.stringify(ticket.body)).toBe(201);
    ticketId = ticket.body.data.id as string;

    // Ticket DEDICADO para el DELETE real (soft-delete 200/409).
    const delTicket = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ subject: 'Para borrar' });
    expect(delTicket.status).toBe(201);
    delTicketId = delTicket.body.data.id as string;

    // Roles con permisos EXACTOS (denegación por defecto).
    await createRole(ownerToken, 'ticket-reader', ['ticket:read']);
    readerToken = await createUser(ownerToken, 'svcsec-reader@example.com', []);
    ticketReaderToken = await createUser(ownerToken, 'svcsec-ticketreader@example.com', [
      'ticket-reader',
    ]);
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 UNAUTHENTICATED en las 5 rutas sin token y con token manipulado', async () => {
    const cases: ReadonlyArray<{
      readonly method: 'get' | 'post' | 'patch' | 'delete';
      readonly path: string;
    }> = [
      { method: 'get', path: '/api/v1/tickets' },
      { method: 'post', path: '/api/v1/tickets' },
      { method: 'get', path: `/api/v1/tickets/${ID_PATH}` },
      { method: 'patch', path: `/api/v1/tickets/${ID_PATH}` },
      { method: 'delete', path: `/api/v1/tickets/${ID_PATH}` },
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
      .get('/api/v1/tickets')
      .set('Authorization', `Bearer ${ownerToken.slice(0, -4)}beef`);
    expect(tampered.status).toBe(401);
  });

  it('403 FORBIDDEN con details.permission por verbo', async () => {
    const cases: ReadonlyArray<{
      readonly method: 'get' | 'post' | 'patch' | 'delete';
      readonly path: string;
      readonly permission: string;
    }> = [
      { method: 'get', path: '/api/v1/tickets', permission: 'ticket:read' },
      { method: 'post', path: '/api/v1/tickets', permission: 'ticket:create' },
      { method: 'get', path: `/api/v1/tickets/${ticketId}`, permission: 'ticket:read' },
      { method: 'patch', path: `/api/v1/tickets/${ticketId}`, permission: 'ticket:update' },
      { method: 'delete', path: `/api/v1/tickets/${ticketId}`, permission: 'ticket:delete' },
    ];
    for (const c of cases) {
      const res = await (
        c.method === 'get'
          ? request(app).get(c.path)
          : c.method === 'post'
            ? request(app).post(c.path).send({})
            : c.method === 'patch'
              ? request(app).patch(c.path).send({ subject: 'x' })
              : request(app).delete(c.path)
      ).set('Authorization', `Bearer ${readerToken}`); // roles: [] → sin permisos
      expect(res.status, `${c.method} ${c.path}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('Missing permission');
      expect(res.body.error.details.permission).toBe(c.permission);
    }
  });

  it('ticket:read NO crea/edita/borra (leer ≠ escribir)', async () => {
    const list = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', `Bearer ${ticketReaderToken}`);
    expect(list.status).toBe(200);
    const detail = await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${ticketReaderToken}`);
    expect(detail.status).toBe(200);

    const create = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${ticketReaderToken}`)
      .send({ subject: 'x' });
    expect(create.status).toBe(403);
    expect(create.body.error.details.permission).toBe('ticket:create');

    const patch = await request(app)
      .patch(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${ticketReaderToken}`)
      .send({ subject: 'x' });
    expect(patch.status).toBe(403);
    expect(patch.body.error.details.permission).toBe('ticket:update');

    const remove = await request(app)
      .delete(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${ticketReaderToken}`);
    expect(remove.status).toBe(403);
    expect(remove.body.error.details.permission).toBe('ticket:delete');
  });

  it('token con pv obsoleta → 403 de re-autenticación; FASE 18 NO bumpó el catálogo', async () => {
    expect(PERMISSION_CATALOG_VERSION).toBe(2); // `ticket:*` en el catálogo DESDE v1
    const ownerClaims = jwt.verifyAccessToken(ownerToken);
    const stale = jwt.signAccessToken({
      userId: ownerClaims.sub,
      tenantId: ownerClaims.tenantId,
      roles: ownerClaims.roles,
      permissions: [...ownerClaims.permissions],
      permVersion: PERMISSION_CATALOG_VERSION - 1, // v1 obsoleta
      sessionId: ownerClaims.sid,
    });

    const list = await request(app).get('/api/v1/tickets').set('Authorization', `Bearer ${stale}`);
    expect(list.status).toBe(403);
    expect(list.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const patch = await request(app)
      .patch(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${stale}`)
      .send({ subject: 'x' });
    expect(patch.status).toBe(403);
    expect(patch.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(200); // solo-autenticada sigue operativa
  });

  it('entrada estricta: tenantId/number/dueAt fuera del body, id malformado y DELETE real 200/409', async () => {
    const injectedTenant = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ subject: 'x', tenantId: 'evil' });
    expect(injectedTenant.status).toBe(400); // estricto: tenantId solo del JWT

    const injectedNumber = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ subject: 'x', number: 'TK-9999-999999' });
    expect(injectedNumber.status).toBe(400); // `number` lo asigna el servidor

    const injectedDueAt = await request(app)
      .patch(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ dueAt: '2026-01-01T00:00:00.000Z' });
    expect(injectedDueAt.status).toBe(400); // `dueAt` es derivado, no existe en el PATCH

    const unknownKey = await request(app)
      .patch(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ hack: true });
    expect(unknownKey.status).toBe(400);

    const badId = await request(app)
      .patch('/api/v1/tickets/not-an-id')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ subject: 'x' });
    expect(badId.status).toBe(400);

    const unknownRoute = await request(app)
      .get('/api/v1/ticket')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(unknownRoute.status).toBe(404); // montaje inexistente

    // DELETE PUBLICADO (ticket:delete existe en el catálogo): soft-delete.
    const deleted = await request(app)
      .delete(`/api/v1/tickets/${delTicketId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    expect(deleted.body.data.archived).toBe(true);
    const again = await request(app)
      .delete(`/api/v1/tickets/${delTicketId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain('Ticket is already archived');
  });

  it('las respuestas nunca filtran tenantId', async () => {
    const list = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain('tenantId');

    const created = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ subject: 'Nuevo ticket' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');

    const fetched = await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(fetched.status).toBe(200);
    expect(JSON.stringify(fetched.body)).not.toContain('tenantId');
  });
});
