/**
 * Integración Tenancy — FASE 4.
 * Contra MongoDB real (memory server): provisionamiento de tenant + owner,
 * roles provisionales, suspensión con corte inmediato y aislamiento cruzado.
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

const ACCESS_TTL = 900;
const REFRESH_TTL = 3600;

const env: Env = {
  nodeEnv: 'test',
  port: 0,
  mongoDbUri: 'unused',
  logLevel: 'silent',
  corsOrigins: [],
  jwtIssuer: 'erp-test',
  jwtAudience: 'erp-api',
  accessTokenTtl: ACCESS_TTL,
  refreshTokenTtl: REFRESH_TTL,
};

const app = createApp({
  logger,
  env,
  routes: [
    {
      path: '/api/v1/auth',
      router: createAuthRouter({
        jwt,
        accessTokenTtl: ACCESS_TTL,
        refreshTokenTtl: REFRESH_TTL,
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

let mongod: MongoMemoryServer | undefined;

async function provision(slug: string, name: string, email: string) {
  return request(app)
    .post('/api/v1/tenants')
    .send({
      name,
      slug,
      owner: { email, password: PASSWORD, displayName: 'Owner' },
    });
}

async function login(email: string): Promise<{ token: string; refresh: string }> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return {
    token: res.body.data.accessToken as string,
    refresh: res.body.data.refreshToken as string,
  };
}

describe('tenancy: provisionamiento, roles y suspensión', () => {
  let tenantAId = '';
  let tenantBId = '';
  let ownerAToken = '';
  let ownerBToken = '';
  let superAdminToken = '';

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_tenancy'), logger);
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('provisiona tenant + owner con slug normalizado (201)', async () => {
    const res = await provision('Acme Corp', 'Acme Corporation', 'owner-acme@example.com');
    expect(res.status).toBe(201);
    expect(res.body.data.tenant.slug).toBe('acme-corp');
    expect(res.body.data.tenant.status).toBe('active');
    expect(res.body.data.owner.roles).toEqual(['owner']);
    expect(res.body.data.owner.email).toBe('owner-acme@example.com');
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
    expect(JSON.stringify(res.body)).not.toContain('$argon2id');
    tenantAId = res.body.data.tenant.id as string;
    expect(tenantAId).toMatch(/^[0-9a-f]{24}$/);
  });

  it('el owner recién creado puede hacer login y leer su tenant', async () => {
    const session = await login('owner-acme@example.com');
    ownerAToken = session.token;
    const current = await request(app)
      .get('/api/v1/tenants/current')
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(current.status).toBe(200);
    expect(current.body.data.id).toBe(tenantAId);
    expect(current.body.data.slug).toBe('acme-corp');
  });

  it('slug duplicado → 409 CONFLICT', async () => {
    const res = await provision('acme-corp', 'Otra Empresa', 'other@example.com');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('contraseña que viola la política → 400 y NO crea el tenant', async () => {
    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'Weak Pass Corp',
        slug: 'weak-pass-corp',
        owner: { email: 'weak@example.com', password: 'weak', displayName: 'W' },
      });
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues.length).toBeGreaterThan(0);
    const { findTenantBySlug } = await import('../../apps/api/src/modules/tenancy/index.js');
    expect(await findTenantBySlug('weak-pass-corp')).toBeNull();
  });

  it('segundo tenant (tenant B) se provisiona y su owner hace login', async () => {
    const res = await provision('globex', 'Globex Inc', 'owner-globex@example.com');
    expect(res.status).toBe(201);
    tenantBId = res.body.data.tenant.id as string;
    const session = await login('owner-globex@example.com');
    ownerBToken = session.token;
  });

  it('aislamiento: el owner de A NO puede leer el tenant de B (404 uniforme)', async () => {
    const other = await request(app)
      .get(`/api/v1/tenants/${tenantBId}`)
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe('NOT_FOUND');

    const missing = await request(app)
      .get('/api/v1/tenants/000000000000000000000000')
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    // Misma respuesta: no revela si el id existe en otro tenant.
    expect(other.body.error.message).toBe(missing.body.error.message);

    const own = await request(app)
      .get(`/api/v1/tenants/${tenantAId}`)
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(own.status).toBe(200);
    expect(own.body.data.id).toBe(tenantAId);
  });

  it('PATCH /current cambia el nombre del tenant propio (slug inmutable)', async () => {
    const res = await request(app)
      .patch('/api/v1/tenants/current')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ name: 'Acme Corporation SA' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Acme Corporation SA');
    expect(res.body.data.slug).toBe('acme-corp');
  });

  it('listado global: 403 para owner, 200 paginado para super_admin', async () => {
    const forbidden = await request(app)
      .get('/api/v1/tenants')
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    await createUser({
      email: 'root@example.com',
      tenantId: tenantAId,
      passwordHash: await hashPassword(PASSWORD),
      displayName: 'Platform Admin',
      roles: ['super_admin'],
    });
    const session = await login('root@example.com');
    superAdminToken = session.token;

    const list = await request(app)
      .get('/api/v1/tenants?page=1&limit=1')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.page).toBe(1);
    expect(list.body.meta.limit).toBe(1);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it('PATCH /current con usuario sin rol owner → 403', async () => {
    await createUser({
      email: 'employee-acme@example.com',
      tenantId: tenantAId,
      passwordHash: await hashPassword(PASSWORD),
      displayName: 'Employee',
      roles: [],
    });
    const session = await login('employee-acme@example.com');
    const res = await request(app)
      .patch('/api/v1/tenants/current')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ name: 'Hacked Name' });
    expect(res.status).toBe(403);
  });

  it('suspender tenant B: login 403 y sesiones vivas revocadas de inmediato', async () => {
    const suspend = await request(app)
      .post(`/api/v1/tenants/${tenantBId}/suspend`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(suspend.status).toBe(200);
    expect(suspend.body.data.status).toBe('suspended');

    // El access token del owner B (emitido antes) muere YA.
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${ownerBToken}`);
    expect(me.status).toBe(401);

    // Login nuevo bloqueado con credenciales correctas.
    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner-globex@example.com', password: PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toBe('Tenant suspended');

    // El resto de tenants sigue operativo (aislamiento del corte).
    const stillOk = await request(app)
      .get('/api/v1/tenants/current')
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(stillOk.status).toBe(200);
  });

  it('suspender dos veces → 409; reactivar → login vuelve a funcionar', async () => {
    const twice = await request(app)
      .post(`/api/v1/tenants/${tenantBId}/suspend`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(twice.status).toBe(409);

    const reactivate = await request(app)
      .post(`/api/v1/tenants/${tenantBId}/reactivate`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.data.status).toBe('active');

    const back = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner-globex@example.com', password: PASSWORD });
    expect(back.status).toBe(200);
  });

  it('reactivar un tenant activo → 409', async () => {
    const res = await request(app)
      .post(`/api/v1/tenants/${tenantAId}/reactivate`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(409);
  });
});
