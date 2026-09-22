/**
 * Integración Identity — FASE 3.
 * Contra MongoDB real (memory server): login, refresh rotación,
 * reutilización de refresh, logout, cambio de contraseña, bloqueo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Env } from '../../apps/api/src/core/config/env.js';
import { resolveJwtKeys } from '../../apps/api/src/core/auth/keys.js';
import { createJwtService } from '../../apps/api/src/core/auth/jwt.js';
import { connectDatabase, disconnectDatabase } from '../../apps/api/src/core/db/database.js';
import { createApp } from '../../apps/api/src/core/http/app.js';
import { createLogger } from '../../apps/api/src/core/logging/logger.js';
import {
  createAuthRouter,
  createUser,
  hashPassword,
} from '../../apps/api/src/modules/identity/index.js';
import { createSessionChecker } from '../../apps/api/src/modules/identity/application/auth-service.js';
import { UserModel } from '../../apps/api/src/modules/identity/infrastructure/schemas/collections.js';

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
      }),
    },
  ],
});

const TENANT_A = '64b0f1a2c3d4e5f607182930';
const TENANT_B = '74b0f1a2c3d4e5f607182931';
const PASSWORD = 'Erp-Secret-2026';

let mongod: MongoMemoryServer | undefined;

async function seedUser(tenantId: string, email: string, roles: string[] = []) {
  return createUser({
    email,
    tenantId,
    passwordHash: await hashPassword(PASSWORD),
    displayName: 'Test User',
    roles,
  });
}

describe('identity: login/refresh/logout/change-password', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_identity'), logger);
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('login válido devuelve tokens y usuario sin hash', async () => {
    await seedUser(TENANT_A, 'acme@example.com', ['vendedor']);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'acme@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.expiresIn).toBe(ACCESS_TTL);
    expect(res.body.data.user.email).toBe('acme@example.com');
    expect(res.body.data.user.tenantId).toBe(TENANT_A);
    expect(JSON.stringify(res.body)).not.toContain('$argon2id');
  });

  it('login con contraseña incorrecta → 401 genérico', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'acme@example.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  it('login con email inexistente → 401 con mensaje idéntico (sin enumeración)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever-123' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  it('login sin tenantId resuelve el usuario por email global', async () => {
    await seedUser(TENANT_B, 'unique-global@example.com');
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'unique-global@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.tenantId).toBe(TENANT_B);
  });

  it('/me con access token válido → 200', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'acme@example.com', password: PASSWORD });
    const token = loginRes.body.data.accessToken as string;
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('acme@example.com');
    expect(me.body.data.tenantId).toBe(TENANT_A);
    expect(me.body.data).not.toHaveProperty('passwordHash');
  });

  it('/me sin token → 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('/me con token manipulado → 401', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'acme@example.com', password: PASSWORD });
    const token = loginRes.body.data.accessToken as string;
    const tampered = `${token.slice(0, -4)}abcd`;
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  it('refresh rota el token: el viejo deja de servir para refresh', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'acme@example.com', password: PASSWORD });
    const oldRefresh = loginRes.body.data.refreshToken as string;

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefresh });
    expect(refreshRes.status).toBe(200);
    const newRefresh = refreshRes.body.data.refreshToken as string;
    expect(newRefresh).not.toBe(oldRefresh);
    expect(refreshRes.body.data.accessToken).toBeTruthy();

    // Reutilización del token viejo → revoca la sesión completa.
    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefresh });
    expect(reuse.status).toBe(401);

    // El token nuevo también queda invalidado (misma sesión revocada).
    const afterReuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: newRefresh });
    expect(afterReuse.status).toBe(401);
  });

  it('logout invalida el access token de inmediato', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'acme@example.com', password: PASSWORD });
    const token = loginRes.body.data.accessToken as string;

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
  });

  it('change-password exige la contraseña actual y revoca otras sesiones', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'acme@example.com', password: PASSWORD });
    const token1 = loginRes.body.data.accessToken as string;

    // Segunda sesión
    const login2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'acme@example.com', password: PASSWORD });
    const token2 = login2.body.data.accessToken as string;

    const wrong = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token1}`)
      .send({ currentPassword: 'nope', newPassword: 'New-Erp-Secret-7777' });
    expect(wrong.status).toBe(401);

    const ok = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token1}`)
      .send({ currentPassword: PASSWORD, newPassword: 'New-Erp-Secret-7777' });
    expect(ok.status).toBe(200);

    // La sesión actual sigue viva; la otra queda revocada.
    const me1 = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token1}`);
    expect(me1.status).toBe(200);
    const me2 = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token2}`);
    expect(me2.status).toBe(401);

    // Login con la contraseña vieja falla; con la nueva funciona.
    const oldPass = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'acme@example.com', password: PASSWORD });
    expect(oldPass.status).toBe(401);
    const newPass = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'acme@example.com', password: 'New-Erp-Secret-7777' });
    expect(newPass.status).toBe(200);

    // Restaurar contraseña original para no afectar otros tests.
    await UserModel.updateOne(
      { email: 'acme@example.com' },
      { $set: { passwordHash: await hashPassword(PASSWORD) } },
    );
  });

  it('bloqueo: 5 fallos → 429 incluso con la contraseña correcta', async () => {
    await seedUser(TENANT_A, 'locked@example.com');
    for (let i = 0; i < 5; i++) {
      const fail = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'locked@example.com', password: 'wrong-password', tenantId: TENANT_A });
      expect(fail.status).toBe(401);
    }
    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'locked@example.com', password: PASSWORD, tenantId: TENANT_A });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('la política de contraseña rechaza débiles con detalles', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'acme@example.com', password: PASSWORD });
    const token = loginRes.body.data.accessToken as string;
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues.length).toBeGreaterThan(0);
  });

  it('body inválido → 400 con issues', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'no-es-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
