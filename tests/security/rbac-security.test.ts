/**
 * Seguridad RBAC — FASE 6.
 * 401/403, validación estricta de entrada, tokens con versión de catálogo
 * obsoleta (`pv`) y ausencia de secretos en las respuestas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { ALL_PERMISSIONS, PERMISSION_CATALOG_VERSION } from '@erp/permissions';
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
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const OTHER_TENANT_ID = '33c1e2b3d4e5f6071829ccdd';

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';

describe('rbac security', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_rbac_sec'), logger);

    const provision = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'RbacSec',
        slug: 'rbacsec',
        owner: { email: 'rbacsec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(provision.status).toBe(201);
    const tenantId = provision.body.data.tenant.id as string;

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rbacsec-owner@example.com', password: PASSWORD });
    ownerToken = login.body.data.accessToken as string;

    // Usuario sin roles → sin permisos (denegación por defecto).
    const created = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'rbacsec-reader@example.com',
        password: PASSWORD,
        displayName: 'Reader',
        roles: [],
      });
    expect(created.status).toBe(201);
    expect(tenantId).not.toBe('');
    const readerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rbacsec-reader@example.com', password: PASSWORD });
    readerToken = readerLogin.body.data.accessToken as string;
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 en /users, /roles y /permissions sin token', async () => {
    const cases = [
      request(app).get('/api/v1/users'),
      request(app)
        .post('/api/v1/users')
        .send({ email: 'x@y.z', password: PASSWORD, displayName: 'X' }),
      request(app).get('/api/v1/roles'),
      request(app).post('/api/v1/roles').send({ key: 'x-rol', name: 'X' }),
      request(app).delete('/api/v1/roles/000000000000000000000000'),
      request(app).get('/api/v1/permissions'),
    ];
    for (const call of cases) {
      const res = await call;
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('sin permisos: 403 en escritura de usuarios/roles y en lectura de catálogo protegido', async () => {
    const postUser = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ email: 'nuevo@example.com', password: PASSWORD, displayName: 'Nuevo' });
    expect(postUser.status).toBe(403);
    expect(postUser.body.error.message).toBe('Missing permission');
    expect(postUser.body.error.details.permission).toBe('user:create');

    const postRole = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ key: 'rol-x', name: 'Rol X', permissions: [] });
    expect(postRole.status).toBe(403);

    const listUsers = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${readerToken}`);
    expect(listUsers.status).toBe(403);
    expect(listUsers.body.error.details.permission).toBe('user:read');
  });

  it('token con versión de catálogo obsoleta (pv=0) → 403 de re-autenticación', async () => {
    const ownerClaims = jwt.verifyAccessToken(ownerToken);
    const stale = jwt.signAccessToken({
      userId: ownerClaims.sub,
      tenantId: ownerClaims.tenantId,
      roles: ownerClaims.roles,
      permissions: [...ALL_PERMISSIONS],
      permVersion: PERMISSION_CATALOG_VERSION - 1,
      sessionId: ownerClaims.sid,
    });

    const res = await request(app)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${stale}`);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Permissions catalog outdated. Sign in again.');
    expect(res.body.error.details.expectedVersion).toBe(PERMISSION_CATALOG_VERSION);
    expect(res.body.error.details.tokenVersion).toBe(PERMISSION_CATALOG_VERSION - 1);

    // La ruta solo-autenticada (sin permiso) sigue funcionando con pv viejo.
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(200);
  });

  it('tenantId inyectado en bodies de /users y /roles → 400', async () => {
    const user = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'inyectado@example.com',
        password: PASSWORD,
        displayName: 'Inyectado',
        tenantId: OTHER_TENANT_ID,
      });
    expect(user.status).toBe(400);
    expect(user.body.error.code).toBe('VALIDATION_ERROR');

    const role = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ key: 'inyectado', name: 'Inyectado', tenantId: OTHER_TENANT_ID });
    expect(role.status).toBe(400);
  });

  it('id con formato inválido en /users y /roles → 400 (no 500)', async () => {
    const user = await request(app)
      .get('/api/v1/users/no-es-objectid')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(user.status).toBe(400);

    const role = await request(app)
      .patch('/api/v1/roles/no-es-objectid')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'X' });
    expect(role.status).toBe(400);
    expect(role.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('la política de contraseña aplica también en POST /users', async () => {
    const weak = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'debil@example.com', password: '123', displayName: 'Débil' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.message).toBe('Password does not meet policy');
  });

  it('email duplicado en el MISMO tenant → 409', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'rbacsec-owner@example.com',
        password: PASSWORD,
        displayName: 'Duplicado',
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('PATCH /users sin campos válidos → 400; campos extra → 400', async () => {
    const ownerClaims = jwt.verifyAccessToken(ownerToken);
    const empty = await request(app)
      .patch(`/api/v1/users/${ownerClaims.sub}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(empty.status).toBe(400);

    const extra = await request(app)
      .patch(`/api/v1/users/${ownerClaims.sub}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ roles: ['owner'], email: 'otro@example.com', tenantId: OTHER_TENANT_ID });
    expect(extra.status).toBe(400);
  });

  it('las respuestas de usuarios/roles nunca filtran hash, password ni tenantId de roles', async () => {
    const users = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`);
    const roles = await request(app)
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerToken}`);
    // Público: sin contraseña. (`tenantId` de usuarios es el del PROPIO tenant
    // del solicitante: contrato de PublicUser, no es una fuga.)
    for (const body of [JSON.stringify(users.body), JSON.stringify(roles.body)]) {
      expect(body).not.toContain(PASSWORD);
      expect(body).not.toContain('$argon2id');
      expect(body).not.toContain('passwordHash');
    }
    // Los roles NI siquiera exponen su tenantId.
    expect(JSON.stringify(roles.body)).not.toContain('tenantId');
  });

  it('token manipulado → 401 en /users', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken.slice(0, -4)}abcd`);
    expect(res.status).toBe(401);
  });
});
