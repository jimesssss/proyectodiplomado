/**
 * Integración Organization — FASE 5.
 * Contra MongoDB real (memory server): jerarquía completa, unicidad de código
 * por tenant, soft-delete y aislamiento cruzado entre tenants.
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

let mongod: MongoMemoryServer | undefined;

async function provision(slug: string, email: string): Promise<string> {
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
  return login.body.data.accessToken as string;
}

describe('organization: jerarquía, unicidad y aislamiento', () => {
  let tokenA = '';
  let tokenB = '';
  let orgId = '';
  let companyId = '';
  let branchId = '';

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_org'), logger);
    tokenA = await provision('org-tenant-a', 'owner-a@org.example');
    tokenB = await provision('org-tenant-b', 'owner-b@org.example');
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('crea la organización raíz sin parentId (201) y normaliza el código', async () => {
    const res = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'acme group', name: 'ACME Group' });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('ACME-GROUP');
    expect(res.body.data.parentId).toBeNull();
    expect(res.body.data.status).toBe('active');
    orgId = res.body.data.id as string;
  });

  it('construye company → branch → department/warehouse/costCenter', async () => {
    const company = await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'ACME-01', name: 'ACME Operaciones', parentId: orgId });
    expect(company.status).toBe(201);
    companyId = company.body.data.id as string;

    const branch = await request(app)
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'SCL-CENTRO', name: 'Sucursal Centro', parentId: companyId });
    expect(branch.status).toBe(201);
    branchId = branch.body.data.id as string;

    const department = await request(app)
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'VENTAS', name: 'Ventas', parentId: branchId });
    expect(department.status).toBe(201);

    const warehouse = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'WH-01', name: 'Almacén Central', parentId: branchId });
    expect(warehouse.status).toBe(201);

    const costCenter = await request(app)
      .post('/api/v1/cost-centers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'CC-ADM', name: 'Administración', parentId: companyId });
    expect(costCenter.status).toBe(201);
    expect(costCenter.body.data.kind).toBe('costCenter');
  });

  it('código duplicado en el MISMO tenant → 409', async () => {
    const res = await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'acme-01', name: 'Duplicado', parentId: orgId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('el MISMO código en OTRO tenant está permitido (uniqueness por tenant)', async () => {
    const orgB = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ code: 'acme group', name: 'Otro ACME' });
    expect(orgB.status).toBe(201);

    const companyB = await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ code: 'ACME-01', name: 'Empresa B', parentId: orgB.body.data.id });
    expect(companyB.status).toBe(201);
  });

  it('tipo con padre requerido sin parentId → 400; con formato inválido → 400', async () => {
    const missing = await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'NO-PARENT', name: 'Sin padre' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');

    const badFormat = await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'BAD-ID', name: 'Id malo', parentId: 'no-es-objectid' });
    expect(badFormat.status).toBe(400);
  });

  it('la raíz rechaza parentId (400)', async () => {
    const res = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'ROOT-X', name: 'Raíz con padre', parentId: orgId });
    expect(res.status).toBe(400);
  });

  it('padre de OTRO tenant → 404 (no revela existencia)', async () => {
    const orgOfB = await request(app)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(orgOfB.status).toBe(200);
    const foreignOrgId = orgOfB.body.data[0].id as string;

    const res = await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'HIJO-AJENO', name: 'Hijo ajeno', parentId: foreignOrgId });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Parent not found');
  });

  it('lectura cruzada: el id de otro tenant responde 404 uniforme', async () => {
    const own = await request(app)
      .get(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(own.status).toBe(200);

    const foreign = await request(app)
      .get(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(foreign.status).toBe(404);

    const missing = await request(app)
      .get('/api/v1/companies/000000000000000000000000')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(missing.status).toBe(404);
    expect(foreign.body.error.message).toBe(missing.body.error.message);
  });

  it('el listado es paginado y SOLO contiene los items del tenant', async () => {
    const listA = await request(app)
      .get('/api/v1/companies?page=1&limit=10')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(listA.status).toBe(200);
    expect(listA.body.meta.limit).toBe(10);
    expect(listA.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(listA.body.data.every((item: { id: string }) => item.id !== undefined)).toBe(true);

    const listB = await request(app)
      .get('/api/v1/companies')
      .set('Authorization', `Bearer ${tokenB}`);
    const idsB = (listB.body.data as Array<{ id: string }>).map((c) => c.id);
    expect(idsB).not.toContain(companyId);
    expect(listB.body.meta.total).toBe(1);
  });

  it('PATCH renombra (200) y el estado duplicado → 409', async () => {
    const rename = await request(app)
      .patch(`/api/v1/branches/${branchId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Sucursal Centro Norte' });
    expect(rename.status).toBe(200);
    expect(rename.body.data.name).toBe('Sucursal Centro Norte');

    const same = await request(app)
      .patch(`/api/v1/branches/${branchId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'active' });
    expect(same.status).toBe(409);
  });

  it('DELETE archiva (soft-delete) y no permite archivar dos veces', async () => {
    const archive = await request(app)
      .delete(`/api/v1/warehouses/${branchId === '' ? 'x' : branchId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    // branchId pertenece a branches; en warehouses no existe → 404 (correcto).
    expect(archive.status).toBe(404);

    const whList = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${tokenA}`);
    const whId = whList.body.data[0].id as string;

    const del = await request(app)
      .delete(`/api/v1/warehouses/${whId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(200);
    expect(del.body.data.status).toBe('archived');

    const again = await request(app)
      .delete(`/api/v1/warehouses/${whId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(again.status).toBe(409);
  });

  it('PATCH puede restaurar una unidad archivada', async () => {
    const whList = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${tokenA}`);
    const whId = whList.body.data[0].id as string;
    const restore = await request(app)
      .patch(`/api/v1/warehouses/${whId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'active' });
    expect(restore.status).toBe(200);
    expect(restore.body.data.status).toBe('active');
  });
});
