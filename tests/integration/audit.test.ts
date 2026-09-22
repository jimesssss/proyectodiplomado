/**
 * Integración Audit — FASE 7.
 * Contra MongoDB real (memory server): trazas de auth/provisionamiento/RBAC/
 * organización, filtros, paginación, append-only (las lecturas no escriben)
 * y aislamiento por tenant de las entradas.
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
  hashPassword,
  createUser,
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
let ownerTokenA = '';
let tenantAId = '';
let orgId = '';

async function provision(
  slug: string,
  email: string,
): Promise<{ tenantId: string; token: string }> {
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
  return {
    tenantId: res.body.data.tenant.id as string,
    token: login.body.data.accessToken as string,
  };
}

function listAudit(
  token: string,
  query = '',
): Promise<{
  status: number;
  body: {
    data: Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      userId: string | null;
      sessionId: string | null;
      requestId: string;
      timestamp: string;
      newValue: unknown;
      metadata: { reason?: string };
    }>;
    meta: { page: number; limit: number; total: number };
  };
}> {
  return request(app).get(`/api/v1/audit${query}`).set('Authorization', `Bearer ${token}`);
}

describe('audit: trazas, filtros y aislamiento', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_audit'), logger);
    const a = await provision('audit-tenant-a', 'owner-a@audit.example');
    ownerTokenA = a.token;
    tenantAId = a.tenantId;
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('provisionamiento y login quedan trazados (más reciente primero)', async () => {
    const res = await listAudit(ownerTokenA);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);

    const actions = res.body.data.map((entry) => entry.action);
    expect(actions).toContain('tenant.provision');
    expect(actions).toContain('auth.login');
    // Orden descendente por timestamp.
    const timestamps = res.body.data.map((entry) => Date.parse(entry.timestamp));
    for (let i = 1; i < timestamps.length; i += 1) {
      expect(timestamps[i] ?? 0).toBeLessThanOrEqual(timestamps[i - 1] ?? 0);
    }

    const loginEntry = res.body.data.find((entry) => entry.action === 'auth.login');
    expect(loginEntry?.requestId).not.toBe('');
    expect(loginEntry?.sessionId).not.toBeNull();
    expect(loginEntry?.userId).not.toBeNull();
  });

  it('login fallido audita la razón (invalid_credentials) dentro del tenant', async () => {
    const failed = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner-a@audit.example', password: 'Wrong-Password-2026' });
    expect(failed.status).toBe(401);

    const res = await listAudit(ownerTokenA, '?action=auth.login.failed');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    const entry = res.body.data[0];
    expect(entry?.metadata.reason).toBe('invalid_credentials');
    expect(entry?.entityId).toBe('owner-a@audit.example');
  });

  it('change-password fallido audita su código de error', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ currentPassword: 'Wrong-Password-2026', newPassword: 'Erp-Secret-2027' });
    expect(res.status).toBe(401);

    const audit = await listAudit(ownerTokenA, '?action=auth.change_password.failed');
    expect(audit.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(audit.body.data[0]?.metadata.reason).toBe('UNAUTHENTICATED');
  });

  it('refresh audita rotación y la REUTILIZACIÓN del token viejo', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner-a@audit.example', password: PASSWORD });
    const firstRefresh = login.body.data.refreshToken as string;

    const rotate = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefresh });
    expect(rotate.status).toBe(200);

    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefresh });
    expect(reuse.status).toBe(401);

    const rotated = await listAudit(ownerTokenA, '?action=auth.refresh');
    expect(rotated.body.meta.total).toBeGreaterThanOrEqual(1);

    const reuseAudit = await listAudit(ownerTokenA, '?action=auth.refresh.reuse');
    expect(reuseAudit.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(reuseAudit.body.data[0]?.metadata.reason).toBe('token_reuse');
    expect(reuseAudit.body.data[0]?.sessionId).not.toBeNull();
  });

  it('logout queda trazado con su sessionId', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner-a@audit.example', password: PASSWORD });
    const token = login.body.data.accessToken as string;
    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);

    const audit = await listAudit(ownerTokenA, '?action=auth.logout');
    expect(audit.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(audit.body.data[0]?.sessionId).not.toBeNull();
  });

  it('operaciones RBAC y de organización generan sus trazas', async () => {
    const role = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ key: 'audit-role', name: 'Audit Role', permissions: ['org:read'] });
    expect(role.status).toBe(201);
    const roleId = role.body.data.id as string;

    const user = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({
        email: 'audit-user@audit.example',
        password: PASSWORD,
        displayName: 'Audit User',
        roles: ['audit-role'],
      });
    expect(user.status).toBe(201);
    const userId = user.body.data.id as string;

    await request(app)
      .patch(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ displayName: 'Audit User Renamed' });

    const org = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ code: 'AUDIT-CO', name: 'Audit Company' });
    expect(org.status).toBe(201);
    orgId = org.body.data.id as string;

    await request(app)
      .patch(`/api/v1/organizations/${orgId}`)
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ name: 'Audit Company Renamed' });
    await request(app)
      .delete(`/api/v1/organizations/${orgId}`)
      .set('Authorization', `Bearer ${ownerTokenA}`);

    await request(app)
      .delete(`/api/v1/roles/${roleId}`)
      .set('Authorization', `Bearer ${ownerTokenA}`); // 409: sigue en uso → sin traza role.delete

    for (const action of ['role.create', 'user.create', 'user.update', 'org.create']) {
      const audit = await listAudit(ownerTokenA, `?action=${action}`);
      expect(audit.status).toBe(200);
      expect(audit.body.meta.total).toBeGreaterThanOrEqual(1);
    }

    const orgEntities = await listAudit(ownerTokenA, '?entityType=organization');
    const orgActions = orgEntities.body.data.map((entry) => entry.action);
    expect(orgActions).toContain('org.create');
    expect(orgActions).toContain('org.update');
    expect(orgActions).toContain('org.archive');

    const byEntity = await listAudit(ownerTokenA, `?entityId=${orgId}`);
    expect(byEntity.body.meta.total).toBe(3);
  });

  it('paginación: limit=1 pagina sin repetir y total es estable', async () => {
    const p1 = await listAudit(ownerTokenA, '?page=1&limit=1');
    const p2 = await listAudit(ownerTokenA, '?page=2&limit=1');
    expect(p1.status).toBe(200);
    expect(p1.body.meta.limit).toBe(1);
    expect(p1.body.data).toHaveLength(1);
    expect(p2.body.data).toHaveLength(1);
    expect(p1.body.data[0]?.id).not.toBe(p2.body.data[0]?.id);
    expect(p2.body.meta.total).toBe(p1.body.meta.total);
  });

  it('las LECTURAS no escriben (append-only en la práctica)', async () => {
    const before = await listAudit(ownerTokenA, '?limit=100');
    await listAudit(ownerTokenA, '?limit=100');
    await listAudit(ownerTokenA, '?action=org.create');
    const after = await listAudit(ownerTokenA, '?limit=100');
    expect(after.body.meta.total).toBe(before.body.meta.total);
  });

  it('otro tenant NO ve estas entradas (filtro por entityId ajeno → 0)', async () => {
    const b = await provision('audit-tenant-b', 'owner-b@audit.example');
    const res = await listAudit(b.token, `?entityId=${orgId}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);

    const own = await listAudit(b.token, '?action=tenant.provision');
    expect(own.body.meta.total).toBe(1); // solo el suyo
  });

  it('suspensión de un tenant queda trazada EN ese tenant (no en el del actor)', async () => {
    // super_admin (plataforma) + tenant objetivo C.
    const c = await provision('audit-tenant-c', 'owner-c@audit.example');
    await createUser({
      email: 'root@audit.example',
      tenantId: tenantAId,
      passwordHash: await hashPassword(PASSWORD),
      displayName: 'Root',
      roles: ['super_admin'],
    });
    const rootLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'root@audit.example', password: PASSWORD });
    expect(rootLogin.status).toBe(200);
    const rootToken = rootLogin.body.data.accessToken as string;

    const suspend = await request(app)
      .post(`/api/v1/tenants/${c.tenantId}/suspend`)
      .set('Authorization', `Bearer ${rootToken}`);
    expect(suspend.status).toBe(200);
    const reactivate = await request(app)
      .post(`/api/v1/tenants/${c.tenantId}/reactivate`)
      .set('Authorization', `Bearer ${rootToken}`);
    expect(reactivate.status).toBe(200);

    // El actor (tenant A) NO ve las trazas: pertenecen al tenant C.
    const fromActor = await listAudit(rootToken, '?action=tenant.suspend');
    expect(fromActor.body.meta.total).toBe(0);

    // El owner de C fue deslogueado por la suspensión → re-login tras reactivar.
    const relogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner-c@audit.example', password: PASSWORD });
    expect(relogin.status).toBe(200);
    const tokenC = relogin.body.data.accessToken as string;

    const fromC = await listAudit(tokenC, '?action=tenant.suspend');
    expect(fromC.body.meta.total).toBe(1);
    expect(fromC.body.data[0]?.entityId).toBe(c.tenantId);
    const reactivateAudit = await listAudit(tokenC, '?action=tenant.reactivate');
    expect(reactivateAudit.body.meta.total).toBe(1);
  });
});
