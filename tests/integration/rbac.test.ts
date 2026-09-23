/**
 * Integración RBAC — FASE 6.
 * Contra MongoDB real (memory server): catálogo de permisos en el JWT,
 * roles tenant-scoped, usuarios administrables, denegación por defecto y
 * re-autenticación forzada al cambiar roles/estado.
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

let mongod: MongoMemoryServer | undefined;
let tenantAId = '';
let ownerTokenA = '';
let ownerTokenB = '';
let vendedorRoleId = '';
let vendedorToken = '';
let vendedorUserId = '';

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

describe('rbac: permisos en el JWT, roles y usuarios', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_rbac'), logger);
    const a = await provision('rbac-tenant-a', 'owner-a@rbac.example');
    tenantAId = a.tenantId;
    ownerTokenA = a.token;
    const b = await provision('rbac-tenant-b', 'owner-b@rbac.example');
    ownerTokenB = b.token;
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('el login vers permisos resueltos y la versión del catálogo', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner-a@rbac.example', password: PASSWORD });
    expect(login.status).toBe(200);
    const claims = jwt.verifyAccessToken(login.body.data.accessToken as string);
    // owner = todos los permisos MENOS los de plataforma (ADR-005).
    expect(claims.permissions).toContain('org:write');
    expect(claims.permissions).toContain('user:create');
    expect(claims.permissions).not.toContain('tenant:suspend');
    expect(claims.permissions).not.toContain('tenant:read');
    expect(claims.pv).toBe(PERMISSION_CATALOG_VERSION);
  });

  it('GET /permissions devuelve el catálogo completo con versión', async () => {
    const res = await request(app)
      .get('/api/v1/permissions')
      .set('Authorization', `Bearer ${ownerTokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(PERMISSION_CATALOG_VERSION);
    expect(res.body.data.permissions).toContain('customer:read');
    expect(res.body.data.permissions).toContain('sales.order:create');
    expect(res.body.data.groups.tenant).toContain('tenant:suspend');
  });

  it('crea un rol con permisos del catálogo (201) y valida claves', async () => {
    const ok = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({
        key: 'vendedor',
        name: 'Vendedor',
        description: 'Ventas básicas',
        permissions: ['customer:read', 'customer:create', 'org:read', 'org:read'],
      });
    expect(ok.status).toBe(201);
    expect(ok.body.data.permissions).toEqual(['customer:read', 'customer:create', 'org:read']);
    vendedorRoleId = ok.body.data.id as string;

    const duplicate = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ key: 'vendedor', name: 'Duplicado', permissions: [] });
    expect(duplicate.status).toBe(409);

    const reserved = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ key: 'owner', name: 'Owner falso', permissions: [] });
    expect(reserved.status).toBe(400);
    expect(reserved.body.error.details.issues[0]).toContain('reserved');

    const unknownPerm = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ key: 'otro', name: 'Otro', permissions: ['no.existe:read'] });
    expect(unknownPerm.status).toBe(400);
    expect(unknownPerm.body.error.details.issues[0]).toContain('Unknown permission');
  });

  it('crea un usuario con el rol y su JWT lleva SOLO esos permisos', async () => {
    const create = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({
        email: 'vendedor@rbac.example',
        password: PASSWORD,
        displayName: 'Vendedor Uno',
        roles: ['vendedor'],
      });
    expect(create.status).toBe(201);
    expect(JSON.stringify(create.body)).not.toContain('$argon2id');
    vendedorUserId = create.body.data.id as string;

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'vendedor@rbac.example', password: PASSWORD });
    expect(login.status).toBe(200);
    vendedorToken = login.body.data.accessToken as string;
    const claims = jwt.verifyAccessToken(vendedorToken);
    expect(claims.roles).toEqual(['vendedor']);
    expect([...claims.permissions].sort()).toEqual([
      'customer:create',
      'customer:read',
      'org:read',
    ]);
  });

  it('denegación por defecto: con org:read pasa el GET y sin org:write el POST → 403', async () => {
    const read = await request(app)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${vendedorToken}`);
    expect(read.status).toBe(200);

    const write = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${vendedorToken}`)
      .send({ code: 'BLOQUEADA', name: 'Sin permiso' });
    expect(write.status).toBe(403);
    expect(write.body.error.code).toBe('FORBIDDEN');
    expect(write.body.error.message).toBe('Missing permission');
    expect(write.body.error.details.permission).toBe('org:write');

    // Y el de plataforma tenant:read tampoco lo tiene.
    const platform = await request(app)
      .get('/api/v1/tenants')
      .set('Authorization', `Bearer ${vendedorToken}`);
    expect(platform.status).toBe(403);
  });

  it('el owner no es plataforma: suspend/listado global → 403 para el owner', async () => {
    const list = await request(app)
      .get('/api/v1/tenants')
      .set('Authorization', `Bearer ${ownerTokenA}`);
    expect(list.status).toBe(403);
    expect(list.body.error.details.permission).toBe('tenant:read');
  });

  it('listado de usuarios paginado y SOLO del propio tenant', async () => {
    const listA = await request(app)
      .get('/api/v1/users?page=1&limit=10')
      .set('Authorization', `Bearer ${ownerTokenA}`);
    expect(listA.status).toBe(200);
    expect(listA.body.meta.total).toBe(2); // owner + vendedor del tenant A
    const idsA = (listA.body.data as Array<{ id: string }>).map((u) => u.id);
    expect(idsA).toContain(vendedorUserId);

    const listB = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${ownerTokenB}`);
    const idsB = (listB.body.data as Array<{ id: string }>).map((u) => u.id);
    expect(idsB).not.toContain(vendedorUserId);
    expect(listB.body.meta.total).toBe(1);
    // Nunca se expone el hash.
    expect(JSON.stringify(listA.body)).not.toContain('$argon2id');
    expect(JSON.stringify(listA.body)).not.toContain('passwordHash');
  });

  it('asignación de rol desconocido → 400 (tenant-scoped)', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({
        email: 'fantasma@rbac.example',
        password: PASSWORD,
        displayName: 'Fantasma',
        roles: ['rol-que-no-existe'],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Unknown role');
    expect(res.body.error.details.role).toBe('rol-que-no-existe');
  });

  it('cambiar los roles de un usuario revoca sus sesiones (re-login obligatorio)', async () => {
    const patch = await request(app)
      .patch(`/api/v1/users/${vendedorUserId}`)
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ roles: [] });
    expect(patch.status).toBe(200);
    expect(patch.body.data.roles).toEqual([]);

    const stale = await request(app)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${vendedorToken}`);
    expect(stale.status).toBe(401); // sesión revocada: el JWT viejo no sirve

    const relogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'vendedor@rbac.example', password: PASSWORD });
    expect(relogin.status).toBe(200);
    vendedorToken = relogin.body.data.accessToken as string;
    const claims = jwt.verifyAccessToken(vendedorToken);
    expect(claims.permissions).toEqual([]); // ya sin permisos del rol vendedor

    const denied = await request(app)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${vendedorToken}`);
    expect(denied.status).toBe(403);
  });

  it('actualizar permisos de un rol exige re-login para verlos (stale → 403, refresh → 201)', async () => {
    const patchRole = await request(app)
      .patch(`/api/v1/roles/${vendedorRoleId}`)
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ permissions: ['customer:read', 'org:read', 'org:write'] });
    expect(patchRole.status).toBe(200);
    expect(patchRole.body.data.permissions).toContain('org:write');

    // El token del vendedor ya no tiene org:write (se emitió antes) → 403.
    const stale = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${vendedorToken}`)
      .send({ code: 'STALE', name: 'Stale token' });
    expect(stale.status).toBe(403);

    // Reasignar el rol + re-login refleja los nuevos permisos.
    await request(app)
      .patch(`/api/v1/users/${vendedorUserId}`)
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ roles: ['vendedor'] });
    const relogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'vendedor@rbac.example', password: PASSWORD });
    const freshToken = relogin.body.data.accessToken as string;

    const allowed = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${freshToken}`)
      .send({ code: 'FRESH', name: 'Con permiso fresco' });
    expect(allowed.status).toBe(201);
    vendedorToken = freshToken;
  });

  it('usuario deshabilitado: no puede iniciar sesión y sus sesiones mueren', async () => {
    const patch = await request(app)
      .patch(`/api/v1/users/${vendedorUserId}`)
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ status: 'disabled' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.status).toBe('disabled');

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'vendedor@rbac.example', password: PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.message).toBe('Account disabled');

    const stale = await request(app)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${vendedorToken}`);
    expect(stale.status).toBe(401);

    await request(app)
      .patch(`/api/v1/users/${vendedorUserId}`)
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ status: 'active' });
  });

  it('roles: borrado en uso → 409; libre → 200. Cruce de tenant → 404.', async () => {
    const inUse = await request(app)
      .delete(`/api/v1/roles/${vendedorRoleId}`)
      .set('Authorization', `Bearer ${ownerTokenA}`);
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.message).toBe('Role is assigned to users');

    await request(app)
      .patch(`/api/v1/users/${vendedorUserId}`)
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ roles: [] });
    const deleted = await request(app)
      .delete(`/api/v1/roles/${vendedorRoleId}`)
      .set('Authorization', `Bearer ${ownerTokenA}`);
    expect(deleted.status).toBe(200);

    // El rol del tenant A no es visible desde el tenant B.
    const foreign = await request(app)
      .get(`/api/v1/roles/${vendedorRoleId}`)
      .set('Authorization', `Bearer ${ownerTokenB}`);
    expect(foreign.status).toBe(404);

    const missing = await request(app)
      .get('/api/v1/roles/000000000000000000000000')
      .set('Authorization', `Bearer ${ownerTokenA}`);
    expect(missing.status).toBe(404);
    expect(foreign.body.error.message).toBe(missing.body.error.message);
  });

  it('usuario de OTRO tenant: lectura/escritura → 404 uniforme', async () => {
    const foreign = await request(app)
      .get(`/api/v1/users/${vendedorUserId}`)
      .set('Authorization', `Bearer ${ownerTokenB}`);
    expect(foreign.status).toBe(404);

    const missing = await request(app)
      .get('/api/v1/users/000000000000000000000000')
      .set('Authorization', `Bearer ${ownerTokenB}`);
    expect(missing.status).toBe(404);
    expect(foreign.body.error.message).toBe(missing.body.error.message);

    const patchForeign = await request(app)
      .patch(`/api/v1/users/${vendedorUserId}`)
      .set('Authorization', `Bearer ${ownerTokenB}`)
      .send({ displayName: 'Hackeado' });
    expect(patchForeign.status).toBe(404);
    expect(tenantAId).not.toBe('');
  });
});
