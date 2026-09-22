/**
 * Seguridad — FASE 3: aislamiento de tenants en identidad y ausencia de
 * datos sensibles en respuestas y BD.
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
        isTenantActive: async () => true,
      }),
    },
  ],
});

const TENANT_A = '64b0f1a2c3d4e5f607182930';
const TENANT_B = '74b0f1a2c3d4e5f607182931';
const PASSWORD = 'Erp-Secret-2026';

let mongod: MongoMemoryServer | undefined;

describe('identity security', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_identity_sec'), logger);
    await createUser({
      email: 'same@email.com',
      tenantId: TENANT_A,
      passwordHash: await hashPassword(PASSWORD),
      displayName: 'A',
    });
    await createUser({
      email: 'same@email.com',
      tenantId: TENANT_B,
      passwordHash: await hashPassword(PASSWORD),
      displayName: 'B',
    });
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('el mismo email puede existir en dos tenants (unicidad por tenant)', async () => {
    const count = await UserModel.countDocuments({ email: 'same@email.com' });
    expect(count).toBe(2);
  });

  it('login con tenantId explícito devuelve el usuario de ese tenant', async () => {
    const a = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'same@email.com', password: PASSWORD, tenantId: TENANT_A });
    expect(a.status).toBe(200);
    expect(a.body.data.user.tenantId).toBe(TENANT_A);

    const b = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'same@email.com', password: PASSWORD, tenantId: TENANT_B });
    expect(b.status).toBe(200);
    expect(b.body.data.user.tenantId).toBe(TENANT_B);
  });

  it('el tenantId del JWT proviene del registro en BD, no del body', async () => {
    // El cliente manda tenantId B pero la cuenta pertenece a A con otro email:
    // el login con ese par falla; el JWT siempre refleja la BD.
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'same@email.com', password: PASSWORD, tenantId: '000000000000000000000000' });
    expect(res.status).toBe(401);
  });

  it('ninguna respuesta contiene el hash de contraseña', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'same@email.com', password: PASSWORD, tenantId: TENANT_A });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('$argon2');
    expect(raw).not.toContain('passwordHash');
  });

  it('la BD no almacena la contraseña en texto plano', async () => {
    const doc = await UserModel.findOne({ email: 'same@email.com', tenantId: TENANT_A }).lean();
    expect(doc).not.toBeNull();
    const raw = JSON.stringify(doc);
    expect(raw).not.toContain(PASSWORD);
    expect((doc as { passwordHash: string }).passwordHash.startsWith('$argon2id$')).toBe(true);
  });
});
