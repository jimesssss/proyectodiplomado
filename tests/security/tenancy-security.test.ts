/**
 * Seguridad Tenancy — FASE 4.
 * 401/403/404 cross-tenant, validación de entrada y no-confianza en el cliente.
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
        isSessionActive: createSessionChecker(),
        isTenantActive,
      }),
    },
    {
      path: '/api/v1/tenants',
      router: createTenantRouter({ jwt, isSessionActive: createSessionChecker() }),
    },
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const OTHER_TENANT_ID = '11b0f1a2c3d4e5f6071829aa';

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let secTenantId = '';

describe('tenancy security', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_tenancy_sec'), logger);

    const provision = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'SecCorp',
        slug: 'seccorp',
        owner: { email: 'sec-owner@example.com', password: PASSWORD, displayName: 'Sec Owner' },
      });
    expect(provision.status).toBe(201);
    secTenantId = provision.body.data.tenant.id as string;

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'sec-owner@example.com', password: PASSWORD });
    ownerToken = login.body.data.accessToken as string;
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 en todos los endpoints autenticados sin token', async () => {
    const cases = [
      request(app).get('/api/v1/tenants/current'),
      request(app).get('/api/v1/tenants'),
      request(app).patch('/api/v1/tenants/current').send({ name: 'X' }),
      request(app).post(`/api/v1/tenants/${OTHER_TENANT_ID}/suspend`),
      request(app).post(`/api/v1/tenants/${OTHER_TENANT_ID}/reactivate`),
    ];
    for (const call of cases) {
      const res = await call;
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('401 con token manipulado o con esquema de Authorization inválido', async () => {
    const tampered = await request(app)
      .get('/api/v1/tenants/current')
      .set('Authorization', `Bearer ${ownerToken.slice(0, -4)}abcd`);
    expect(tampered.status).toBe(401);

    const badScheme = await request(app)
      .get('/api/v1/tenants/current')
      .set('Authorization', `Basic ${ownerToken}`);
    expect(badScheme.status).toBe(401);
  });

  it('tenantId en el body se RECHAZA (esquema estricto) — nunca del cliente', async () => {
    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'Injection Corp',
        tenantId: OTHER_TENANT_ID,
        owner: { email: 'inject@example.com', password: PASSWORD, displayName: 'X' },
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH /current con campos desconocidos → 400', async () => {
    const res = await request(app)
      .patch('/api/v1/tenants/current')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Nuevo Nombre', slug: 'otro-slug', status: 'active' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('id de tenant con formato inválido → 400 (no 500)', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/no-es-objectid')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('cross-tenant: otro id responde 404 sin revelar existencia', async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${OTHER_TENANT_ID}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('suspender/reactivar sin rol super_admin → 403', async () => {
    const suspend = await request(app)
      .post(`/api/v1/tenants/${OTHER_TENANT_ID}/suspend`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(suspend.status).toBe(403);

    const reactivate = await request(app)
      .post(`/api/v1/tenants/${OTHER_TENANT_ID}/reactivate`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(reactivate.status).toBe(403);
  });

  it('listado global sin rol super_admin → 403', async () => {
    const res = await request(app)
      .get('/api/v1/tenants')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('query de listado inválida (limit > 100) → 400 para super_admin', async () => {
    await createUser({
      email: 'sec-root@example.com',
      tenantId: secTenantId,
      passwordHash: await hashPassword(PASSWORD),
      displayName: 'Platform Admin',
      roles: ['super_admin'],
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'sec-root@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
    const rootToken = login.body.data.accessToken as string;

    const res = await request(app)
      .get('/api/v1/tenants?limit=1000&page=0')
      .set('Authorization', `Bearer ${rootToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('las respuestas no filtran datos sensibles (hash, password)', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/current')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toContain('$argon2id');
    expect(raw).not.toContain('passwordHash');
  });
});
