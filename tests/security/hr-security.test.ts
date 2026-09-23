/**
 * Seguridad HR — FASE 19.
 * 401 en las 13 rutas (employees 5, attendance 4 —sin DELETE—, salaries 4
 * —sin DELETE—) con token manipulado incluido, 403 con `details.permission`
 * por verbo (`employee:*`, `attendance:*`, `hr.salary:*`), leer no implica
 * escribir, token con `pv` obsoleta (SIN bump de catálogo en FASE 19: los
 * 3 grupos llevan desde v1 — `git log -S`), entrada estricta (`tenantId`,
 * `code`/`employeeId`/`period` inmutables), rutas DELETE no publicadas en
 * attendance/salaries (404) vs. DELETE real de empleado (200/409) y ausencia
 * de `tenantId` en respuestas.
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
  createRoleRouter,
  createSessionChecker,
  createUserRouter,
} from '../../apps/api/src/modules/identity/index.js';
import { createTenantRouter, isTenantActive } from '../../apps/api/src/modules/tenancy/index.js';
import { createHrRouters } from '../../apps/api/src/modules/hr/index.js';

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
    ...createHrRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const ID_PATH = '0123456789abcdef01234567';

const EMPLOYEE_ROUTES: ReadonlyArray<{
  readonly method: 'get' | 'post' | 'patch' | 'delete';
  readonly path: string;
}> = [
  { method: 'get', path: '/api/v1/employees' },
  { method: 'post', path: '/api/v1/employees' },
  { method: 'get', path: `/api/v1/employees/${ID_PATH}` },
  { method: 'patch', path: `/api/v1/employees/${ID_PATH}` },
  { method: 'delete', path: `/api/v1/employees/${ID_PATH}` },
];

const ATTENDANCE_ROUTES: ReadonlyArray<{
  readonly method: 'get' | 'post' | 'patch' | 'delete';
  readonly path: string;
}> = [
  { method: 'get', path: '/api/v1/attendance' },
  { method: 'post', path: '/api/v1/attendance' },
  { method: 'get', path: `/api/v1/attendance/${ID_PATH}` },
  { method: 'patch', path: `/api/v1/attendance/${ID_PATH}` },
  { method: 'delete', path: `/api/v1/attendance/${ID_PATH}` }, // NO publicada → 404
];

const SALARY_ROUTES: ReadonlyArray<{
  readonly method: 'get' | 'post' | 'patch' | 'delete';
  readonly path: string;
}> = [
  { method: 'get', path: '/api/v1/salaries' },
  { method: 'post', path: '/api/v1/salaries' },
  { method: 'get', path: `/api/v1/salaries/${ID_PATH}` },
  { method: 'patch', path: `/api/v1/salaries/${ID_PATH}` },
  { method: 'delete', path: `/api/v1/salaries/${ID_PATH}` }, // NO publicada → 404
];

function call(
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  token: string,
  body: object = {},
): ReturnType<ReturnType<typeof request.agent>['get']> {
  const req = request(app)[method](path).set('Authorization', `Bearer ${token}`);
  return method === 'get' || method === 'delete' ? req : req.send(body);
}

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';
let hrReaderToken = '';
let employeeId = '';
let attendanceId = '';
let salaryId = '';
let delEmployeeId = '';

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

async function createRole(owner: string, key: string, permissions: string[]): Promise<void> {
  const res = await request(app)
    .post('/api/v1/roles')
    .set('Authorization', `Bearer ${owner}`)
    .send({ key, name: key, permissions });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

async function createUser(owner: string, email: string, roles: string[]): Promise<string> {
  const res = await request(app)
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${owner}`)
    .send({ email, password: PASSWORD, displayName: email.split('@')[0], roles });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return login(email);
}

async function createEmployeeFixture(owner: string, code: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/employees')
    .set('Authorization', `Bearer ${owner}`)
    .send({
      code,
      firstName: 'Fixture',
      lastName: 'Employee',
      email: `${code}@example.com`,
      position: 'Analista',
      hireDate: '2026-02-01',
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
}

describe('hr security: permisos por grupo, entrada estricta y DELETE diferenciado', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_hr_sec'), logger);

    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'HRSEC',
        slug: 'hr-sec',
        owner: { email: 'hrsec-owner@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(res.status).toBe(201);
    ownerToken = await login('hrsec-owner@example.com');

    employeeId = await createEmployeeFixture(ownerToken, 'emp-sec');
    delEmployeeId = await createEmployeeFixture(ownerToken, 'emp-del');

    const attendance = await request(app)
      .post('/api/v1/attendance')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ employeeId, date: '2026-09-20', checkIn: '08:00', checkOut: '17:00' });
    expect(attendance.status, JSON.stringify(attendance.body)).toBe(201);
    attendanceId = attendance.body.data.id as string;

    const salary = await request(app)
      .post('/api/v1/salaries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ employeeId, period: '2026-09', baseAmount: 1000 });
    expect(salary.status, JSON.stringify(salary.body)).toBe(201);
    salaryId = salary.body.data.id as string;

    // Roles con permisos EXACTOS (denegación por defecto).
    await createRole(ownerToken, 'hr-reader', [
      'employee:read',
      'attendance:read',
      'hr.salary:read',
    ]);
    readerToken = await createUser(ownerToken, 'hrsec-reader@example.com', []);
    hrReaderToken = await createUser(ownerToken, 'hrsec-hrreader@example.com', ['hr-reader']);
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 UNAUTHENTICATED en las 13 rutas sin token y con token manipulado', async () => {
    const cases = [
      ...EMPLOYEE_ROUTES,
      ...ATTENDANCE_ROUTES.filter((r) => r.method !== 'delete'), // la DELETE no existe → probarla en su test
      ...SALARY_ROUTES.filter((r) => r.method !== 'delete'),
    ];
    for (const c of cases) {
      const anon = await (c.method === 'get'
        ? request(app).get(c.path)
        : c.method === 'post'
          ? request(app).post(c.path).send({})
          : c.method === 'patch'
            ? request(app).patch(c.path).send({})
            : request(app).delete(c.path));
      expect(anon.status, `${c.method} ${c.path}`).toBe(401);
      expect(anon.body.error.code).toBe('UNAUTHENTICATED');
    }
    const tampered = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken.slice(0, -4)}beef`);
    expect(tampered.status).toBe(401);
  });

  it('403 FORBIDDEN con details.permission por verbo en los 3 grupos', async () => {
    const cases: ReadonlyArray<{
      readonly method: 'get' | 'post' | 'patch' | 'delete';
      readonly path: string;
      readonly permission: string;
    }> = [
      { method: 'get', path: '/api/v1/employees', permission: 'employee:read' },
      { method: 'post', path: '/api/v1/employees', permission: 'employee:create' },
      { method: 'get', path: `/api/v1/employees/${employeeId}`, permission: 'employee:read' },
      { method: 'patch', path: `/api/v1/employees/${employeeId}`, permission: 'employee:update' },
      {
        method: 'delete',
        path: `/api/v1/employees/${employeeId}`,
        permission: 'employee:delete',
      },
      { method: 'get', path: '/api/v1/attendance', permission: 'attendance:read' },
      { method: 'post', path: '/api/v1/attendance', permission: 'attendance:create' },
      {
        method: 'get',
        path: `/api/v1/attendance/${attendanceId}`,
        permission: 'attendance:read',
      },
      {
        method: 'patch',
        path: `/api/v1/attendance/${attendanceId}`,
        permission: 'attendance:update',
      },
      { method: 'get', path: '/api/v1/salaries', permission: 'hr.salary:read' },
      { method: 'post', path: '/api/v1/salaries', permission: 'hr.salary:create' },
      { method: 'get', path: `/api/v1/salaries/${salaryId}`, permission: 'hr.salary:read' },
      {
        method: 'patch',
        path: `/api/v1/salaries/${salaryId}`,
        permission: 'hr.salary:update',
      },
    ];
    for (const c of cases) {
      const body = c.method === 'post' ? { employeeId, period: '2026-10', baseAmount: 1 } : {};
      const res = await call(c.method, c.path, readerToken, body);
      expect(res.status, `${c.method} ${c.path}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('Missing permission');
      expect(res.body.error.details.permission).toBe(c.permission);
    }
  });

  it('los 3 `:read` NO crean/editan/borran (leer ≠ escribir)', async () => {
    const list = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${hrReaderToken}`);
    expect(list.status).toBe(200);
    const attendance = await request(app)
      .get('/api/v1/attendance')
      .set('Authorization', `Bearer ${hrReaderToken}`);
    expect(attendance.status).toBe(200);
    const salaries = await request(app)
      .get('/api/v1/salaries')
      .set('Authorization', `Bearer ${hrReaderToken}`);
    expect(salaries.status).toBe(200);

    const create = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${hrReaderToken}`)
      .send({
        code: 'x-1',
        firstName: 'x',
        lastName: 'x',
        email: 'x@x.com',
        position: 'x',
        hireDate: '2026-01-01',
      });
    expect(create.status).toBe(403);
    expect(create.body.error.details.permission).toBe('employee:create');

    const patch = await request(app)
      .patch(`/api/v1/attendance/${attendanceId}`)
      .set('Authorization', `Bearer ${hrReaderToken}`)
      .send({ checkOut: '18:00' });
    expect(patch.status).toBe(403);
    expect(patch.body.error.details.permission).toBe('attendance:update');

    const remove = await request(app)
      .delete(`/api/v1/employees/${employeeId}`)
      .set('Authorization', `Bearer ${hrReaderToken}`);
    expect(remove.status).toBe(403);
    expect(remove.body.error.details.permission).toBe('employee:delete');
  });

  it('token con pv obsoleta → 403 de re-autenticación; FASE 19 NO bumpó el catálogo', async () => {
    expect(PERMISSION_CATALOG_VERSION).toBe(2); // los 3 grupos en el catálogo DESDE v1
    const ownerClaims = jwt.verifyAccessToken(ownerToken);
    const stale = jwt.signAccessToken({
      userId: ownerClaims.sub,
      tenantId: ownerClaims.tenantId,
      roles: ownerClaims.roles,
      permissions: [...ownerClaims.permissions],
      permVersion: PERMISSION_CATALOG_VERSION - 1, // v1 obsoleta
      sessionId: ownerClaims.sid,
    });

    const list = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${stale}`);
    expect(list.status).toBe(403);
    expect(list.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(200); // solo-autenticada sigue operativa
  });

  it('entrada estricta: tenantId/inmutables fuera del body y DELETE diferenciado', async () => {
    const injectedTenant = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        code: 'x-2',
        firstName: 'x',
        lastName: 'x',
        email: 'x2@x.com',
        position: 'x',
        hireDate: '2026-01-01',
        tenantId: 'evil',
      });
    expect(injectedTenant.status).toBe(400); // estricto: tenantId solo del JWT

    const immutableCode = await request(app)
      .patch(`/api/v1/employees/${employeeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'HACKED' });
    expect(immutableCode.status).toBe(400); // `code` inmutable

    const immutableEmployee = await request(app)
      .patch(`/api/v1/attendance/${attendanceId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ employeeId: ID_PATH });
    expect(immutableEmployee.status).toBe(400); // fijo al crear

    const immutablePeriod = await request(app)
      .patch(`/api/v1/salaries/${salaryId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ period: '2026-10' });
    expect(immutablePeriod.status).toBe(400); // fijo al crear

    const unknownKey = await request(app)
      .patch(`/api/v1/salaries/${salaryId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ hack: true });
    expect(unknownKey.status).toBe(400);

    const badId = await request(app)
      .patch('/api/v1/employees/not-an-id')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ position: 'x' });
    expect(badId.status).toBe(400);

    const unknownRoute = await request(app)
      .get('/api/v1/worker')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(unknownRoute.status).toBe(404); // montaje inexistente

    // attendance/salaries: SIN `:delete` → rutas DELETE no publicadas (404).
    const deleteAttendance = await request(app)
      .delete(`/api/v1/attendance/${attendanceId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deleteAttendance.status).toBe(404);
    const deleteSalary = await request(app)
      .delete(`/api/v1/salaries/${salaryId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deleteSalary.status).toBe(404);

    // employees: SÍ `employee:delete` → DELETE real = soft-delete (200/409).
    const deleted = await request(app)
      .delete(`/api/v1/employees/${delEmployeeId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    expect(deleted.body.data.archived).toBe(true);
    const again = await request(app)
      .delete(`/api/v1/employees/${delEmployeeId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain('Employee is already archived');
  });

  it('las respuestas nunca filtran tenantId', async () => {
    const employees = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(employees.status).toBe(200);
    expect(JSON.stringify(employees.body)).not.toContain('tenantId');

    const attendance = await request(app)
      .get('/api/v1/attendance')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(attendance.status).toBe(200);
    expect(JSON.stringify(attendance.body)).not.toContain('tenantId');

    const created = await request(app)
      .post('/api/v1/salaries')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ employeeId, period: '2026-10', baseAmount: 500 });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
  });
});
