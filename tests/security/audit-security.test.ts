/**
 * Seguridad Audit — FASE 7.
 * 401/403, validación de query, sin rutas de mutación (append-only expuesto
 * como solo-lectura) y ausencia de secretos en las respuestas.
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
import {
  createAuthRouter,
  createPermissionRouter,
  createRoleRouter,
  createSessionChecker,
  createUserRouter,
} from '../../apps/api/src/modules/identity/index.js';
import { createTenantRouter, isTenantActive } from '../../apps/api/src/modules/tenancy/index.js';
import { createOrgRouter } from '../../apps/api/src/modules/organization/index.js';
import { createAuditRouter } from '../../apps/api/src/modules/audit/index.js';

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
    { path: '/api/v1/permissions', router: createPermissionRouter(deps) },
    { path: '/api/v1/organizations', router: createOrgRouter(deps, 'organization') },
    { path: '/api/v1/audit', router: createAuditRouter(deps) },
  ],
});

const PASSWORD = 'Erp-Secret-2026';

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';
let orgId = '';

describe('audit security', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_audit_sec'), logger);

    const provision = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'AuditSec',
        slug: 'auditsec',
        owner: { email: 'auditsec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(provision.status).toBe(201);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'auditsec-owner@example.com', password: PASSWORD });
    ownerToken = login.body.data.accessToken as string;

    const created = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'auditsec-reader@example.com',
        password: PASSWORD,
        displayName: 'Reader',
        roles: [],
      });
    expect(created.status).toBe(201);
    const readerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'auditsec-reader@example.com', password: PASSWORD });
    readerToken = readerLogin.body.data.accessToken as string;

    const org = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'AUDSEC', name: 'Aud Sec' });
    expect(org.status).toBe(201);
    orgId = org.body.data.id as string;
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 sin token y con token manipulado', async () => {
    const anon = await request(app).get('/api/v1/audit');
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe('UNAUTHENTICATED');

    const tampered = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${ownerToken.slice(0, -4)}abcd`);
    expect(tampered.status).toBe(401);
  });

  it('sin `audit:read` → 403 con details.permission', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${readerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Missing permission');
    expect(res.body.error.details.permission).toBe('audit:read');
  });

  it('query inválida → 400 (limit, page y action con formato no canónico)', async () => {
    const cases = [
      '?limit=5000',
      '?page=0',
      '?action=Bad Action!',
      '?action=$where',
      '?entityType=X',
    ];
    for (const query of cases) {
      const res = await request(app)
        .get(`/api/v1/audit${query}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('no existen rutas de mutación en /audit (append-only expuesto)', async () => {
    const post = await request(app)
      .post('/api/v1/audit')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ action: 'forged', entityType: 'tenant' });
    expect(post.status).toBe(404);

    const patch = await request(app)
      .patch('/api/v1/audit/000000000000000000000000')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ action: 'forged' });
    expect(patch.status).toBe(404);

    const del = await request(app)
      .delete('/api/v1/audit/000000000000000000000000')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(del.status).toBe(404);
  });

  it('el filtro por una entidad propia devuelve solo lo propio (aislamiento)', async () => {
    const own = await request(app)
      .get(`/api/v1/audit?entityId=${orgId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(own.status).toBe(200);
    expect(own.body.meta.total).toBe(1);
    expect(own.body.data[0].action).toBe('org.create');
  });

  it('las respuestas no contienen contraseñas ni hashes', async () => {
    const res = await request(app)
      .get('/api/v1/audit?limit=100')
      .set('Authorization', `Bearer ${ownerToken}`);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toContain('$argon2id');
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('currentPassword');
    expect(raw).not.toContain('newPassword');
  });
});
