/**
 * Seguridad Organization — FASE 5.
 * 401/403, validación estricta de entrada, cross-tenant uniforme.
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
  createSessionChecker,
  createUser,
  hashPassword,
} from '../../apps/api/src/modules/identity/index.js';
import { createTenantRouter, isTenantActive } from '../../apps/api/src/modules/tenancy/index.js';
import {
  createOrgRouter,
  ORG_KINDS_BY_PATH,
  ORG_ROUTE_PATHS,
} from '../../apps/api/src/modules/organization/index.js';

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
    {
      path: '/api/v1/tenants',
      router: createTenantRouter({ jwt, isSessionActive: sessionChecker }),
    },
    ...ORG_KINDS_BY_PATH.map((kind) => ({
      path: `/api/v1/${ORG_ROUTE_PATHS[kind]}`,
      router: createOrgRouter({ jwt, isSessionActive: sessionChecker }, kind),
    })),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const OTHER_TENANT_ID = '22b0f1a2c3d4e5f6071829bb';

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';
let orgId = '';

describe('organization security', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_org_sec'), logger);

    const provision = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'OrgSec',
        slug: 'orgsec',
        owner: { email: 'orgsec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(provision.status).toBe(201);
    orgId = provision.body.data.tenant.id as string;
    const tenantId = orgId;

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'orgsec-owner@example.com', password: PASSWORD });
    ownerToken = login.body.data.accessToken as string;

    // Usuario del MISMO tenant sin roles: puede leer, no escribir.
    await createUser({
      email: 'orgsec-reader@example.com',
      tenantId,
      passwordHash: await hashPassword(PASSWORD),
      displayName: 'Reader',
      roles: [],
    });
    const readerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'orgsec-reader@example.com', password: PASSWORD });
    readerToken = readerLogin.body.data.accessToken as string;
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 en todos los verbos sin token', async () => {
    const cases = [
      request(app).post('/api/v1/organizations').send({ code: 'X1', name: 'X' }),
      request(app).get('/api/v1/organizations'),
      request(app).get(`/api/v1/organizations/${OTHER_TENANT_ID}`),
      request(app).patch(`/api/v1/organizations/${OTHER_TENANT_ID}`).send({ name: 'X' }),
      request(app).delete(`/api/v1/organizations/${OTHER_TENANT_ID}`),
      request(app).post('/api/v1/cost-centers').send({ code: 'X1', name: 'X', parentId: orgId }),
    ];
    for (const call of cases) {
      const res = await call;
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('sin permiso de escritura (roles vacíos): 403 en TODOS los verbos', async () => {
    const post = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ code: 'READ-BLOCK', name: 'Bloqueado' });
    expect(post.status).toBe(403);
    expect(post.body.error.code).toBe('FORBIDDEN');
    expect(post.body.error.message).toBe('Missing permission');

    const patch = await request(app)
      .patch(`/api/v1/organizations/${OTHER_TENANT_ID}`)
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ name: 'X' });
    expect(patch.status).toBe(403);

    const del = await request(app)
      .delete(`/api/v1/organizations/${OTHER_TENANT_ID}`)
      .set('Authorization', `Bearer ${readerToken}`);
    expect(del.status).toBe(403);

    // Denegación por defecto (ADR-005): la lectura TAMBIÉN exige `org:read`.
    const read = await request(app)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${readerToken}`);
    expect(read.status).toBe(403);
    expect(read.body.error.message).toBe('Missing permission');
  });

  it('tenantId en el body se RECHAZA (esquema estricto)', async () => {
    const res = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'INJECT', name: 'Inyectado', tenantId: OTHER_TENANT_ID });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('campos desconocidos en PATCH → 400', async () => {
    const res = await request(app)
      .patch(`/api/v1/organizations/${OTHER_TENANT_ID}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'X', code: 'CAMBIAR-CODIGO', tenantId: OTHER_TENANT_ID });
    expect(res.status).toBe(400);
  });

  it('id con formato inválido → 400 (no 500)', async () => {
    const res = await request(app)
      .get('/api/v1/organizations/no-es-objectid')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('id de OTRO tenant → 404 sin revelar existencia', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${OTHER_TENANT_ID}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('código inválido → 400 con issues de dominio', async () => {
    const res = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'a', name: 'Código corto' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues.length).toBeGreaterThan(0);
  });

  it('query de listado inválida → 400', async () => {
    const res = await request(app)
      .get('/api/v1/organizations?limit=5000')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('token manipulado → 401', async () => {
    const res = await request(app)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${ownerToken.slice(0, -4)}abcd`);
    expect(res.status).toBe(401);
  });
});
