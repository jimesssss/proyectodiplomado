/**
 * Integración HR — FASE 19.
 * Contra MongoDB real (memory server): empleado con código normalizado/único
 * POR tenant (e inmutable) y email único, máquina laboral con `terminated`
 * terminal (la ficha ahí se congela), DELETE = soft-delete con filtros;
 * asistencia ÚNICA por empleado+día (día a medianoche UTC, horas `HH:MM`,
 * salida ≥ entrada, `status` derivado `open|closed`, sin ruta DELETE → 404);
 * nómina ÚNICA por empleado+período (`YYYY-MM`) con `netAmount` derivado
 * (roundMoney) y sin ruta DELETE; FK de empleado → 404 uniforme o
 * `409 Employee is archived`; aislamiento cruzado (tenant B) y auditoría.
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
import { createAuditRouter } from '../../apps/api/src/modules/audit/index.js';
import {
  createAuthRouter,
  createSessionChecker,
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
    { path: '/api/v1/audit', router: createAuditRouter(deps) },
    ...createHrRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';

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

describe('hr: empleados, asistencia y nómina', () => {
  let tokenA = '';
  let tokenB = '';
  let employeeA1Id = '';
  let employeeA2Id = '';
  let employeeBId = '';
  let attA1Id = '';
  let attA2Id = '';
  let salA1Id = '';

  const postA = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const getA = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenA}`);
  const patchA = (path: string, body: object) =>
    request(app).patch(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const delA = (path: string) => request(app).delete(path).set('Authorization', `Bearer ${tokenA}`);
  const postB = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenB}`).send(body);
  const getB = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenB}`);
  const patchB = (path: string, body: object) =>
    request(app).patch(path).set('Authorization', `Bearer ${tokenB}`).send(body);
  const delB = (path: string) => request(app).delete(path).set('Authorization', `Bearer ${tokenB}`);

  const employeeA1 = (overrides: object = {}) => ({
    code: ' ana torres ',
    firstName: '  Ana  ',
    lastName: 'Torres ',
    email: ' Ana.Torres@Example.COM ',
    position: 'Ingeniera de soporte',
    hireDate: '2026-01-15',
    ...overrides,
  });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_hr'), logger);
    tokenA = await provision('hr-tenant-a', 'owner-a@hr.example');
    tokenB = await provision('hr-tenant-b', 'owner-b@hr.example');
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('empleado: alta con código normalizado, defaults, recortes y validaciones', async () => {
    const created = await postA('/api/v1/employees', employeeA1());
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const employee = created.body.data;
    expect(employee.code).toBe('ANA-TORRES'); // trim + mayúsculas + espacios → '-'
    expect(employee.firstName).toBe('Ana'); // zod `.trim()`
    expect(employee.lastName).toBe('Torres');
    expect(employee.email).toBe('ana.torres@example.com'); // normalizado a minúsculas
    expect(employee.position).toBe('Ingeniera de soporte');
    expect(employee.department).toBeNull();
    expect(employee.userId).toBeNull();
    expect(employee.status).toBe('active');
    expect(employee.archived).toBe(false);
    expect(employee.hireDate).toBe('2026-01-15T00:00:00.000Z');
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    employeeA1Id = employee.id as string;

    const badCode = await postA('/api/v1/employees', employeeA1({ code: 'x' }));
    expect(badCode.status).toBe(400); // 'X' < 2 chars tras normalizar
    expect(JSON.stringify(badCode.body)).toContain('Invalid code');

    const blankName = await postA('/api/v1/employees', employeeA1({ firstName: '   ' }));
    expect(blankName.status).toBe(400); // trim + min(1): nunca 500

    const badEmail = await postA('/api/v1/employees', employeeA1({ email: 'nope' }));
    expect(badEmail.status).toBe(400);
    expect(JSON.stringify(badEmail.body)).toContain('Invalid email');

    const unknownUser = await postA('/api/v1/employees', employeeA1({ userId: MISSING_ID }));
    expect(unknownUser.status).toBe(400);
    expect(JSON.stringify(unknownUser.body)).toContain('Unknown user');

    const injected = await postA('/api/v1/employees', employeeA1({ tenantId: 'evil' }));
    expect(injected.status).toBe(400); // estricto: tenantId solo del JWT
  });

  it('clave natural: código y email ÚNICOS por tenant; code inmutable', async () => {
    const dupCode = await postA('/api/v1/employees', employeeA1({ code: 'ana torres' }));
    expect(dupCode.status).toBe(409);
    expect(JSON.stringify(dupCode.body)).toContain('Code already exists');

    const dupEmail = await postA(
      '/api/v1/employees',
      employeeA1({ code: 'emp-dos', email: 'ANA.TORRES@example.com' }),
    );
    expect(dupEmail.status).toBe(409);
    expect(JSON.stringify(dupEmail.body)).toContain('Email already exists');

    const second = await postA(
      '/api/v1/employees',
      employeeA1({
        code: 'emp dos',
        email: 'emp2@example.com',
        firstName: 'Luis',
        lastName: 'Gómez',
      }),
    );
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(second.body.data.code).toBe('EMP-DOS');
    employeeA2Id = second.body.data.id as string;

    // El MISMO código existe sin conflicto en el tenant B (unicidad por tenant).
    const fromB = await postB(
      '/api/v1/employees',
      employeeA1({ code: 'emp dos', email: 'emp2@example.com' }),
    );
    expect(fromB.status, JSON.stringify(fromB.body)).toBe(201);
    employeeBId = fromB.body.data.id as string;

    const immutableCode = await patchA(`/api/v1/employees/${employeeA2Id}`, { code: 'NUEVO' });
    expect(immutableCode.status).toBe(400); // `code` no existe en el PATCH
  });

  it('máquina laboral: terminated congela la ficha y no tiene salida', async () => {
    const inactive = await patchA(`/api/v1/employees/${employeeA1Id}`, { status: 'inactive' });
    expect(inactive.status, JSON.stringify(inactive.body)).toBe(200);
    expect(inactive.body.data.status).toBe('inactive');

    const back = await patchA(`/api/v1/employees/${employeeA1Id}`, { status: 'active' });
    expect(back.status).toBe(200); // reincorporación

    const terminated = await patchA(`/api/v1/employees/${employeeA1Id}`, { status: 'terminated' });
    expect(terminated.status, JSON.stringify(terminated.body)).toBe(200);
    expect(terminated.body.data.status).toBe('terminated');

    const edit = await patchA(`/api/v1/employees/${employeeA1Id}`, { position: 'x' });
    expect(edit.status).toBe(409);
    expect(JSON.stringify(edit.body)).toContain('Only non-terminal employees can be edited');

    const repeated = await patchA(`/api/v1/employees/${employeeA1Id}`, { status: 'terminated' });
    expect(repeated.status).toBe(409);
    expect(JSON.stringify(repeated.body)).toContain('Status is already the requested one');

    const invalid = await patchA(`/api/v1/employees/${employeeA1Id}`, { status: 'active' });
    expect(invalid.status).toBe(409); // terminal sin salida
    expect(JSON.stringify(invalid.body)).toContain('Invalid status transition');

    const bogus = await patchA(`/api/v1/employees/${employeeA1Id}`, { status: 'bogus' });
    expect(bogus.status).toBe(400);

    const empty = await patchA(`/api/v1/employees/${employeeA1Id}`, {});
    expect(empty.status).toBe(400);
    expect(JSON.stringify(empty.body)).toContain('No valid fields to update');
  });

  it('DELETE de empleado = soft-delete, restaurar y filtros de cola', async () => {
    const deleted = await delA(`/api/v1/employees/${employeeA1Id}`);
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    expect(deleted.body.data.archived).toBe(true);

    const again = await delA(`/api/v1/employees/${employeeA1Id}`);
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain('Employee is already archived');

    const restored = await patchA(`/api/v1/employees/${employeeA1Id}`, { archived: false });
    expect(restored.status).toBe(200);
    expect(restored.body.data.archived).toBe(false);
    const unarchived = await getA('/api/v1/employees?archived=true');
    expect(unarchived.body.meta.total).toBe(0);

    const rearchived = await patchA(`/api/v1/employees/${employeeA1Id}`, { archived: true });
    expect(rearchived.status).toBe(200);

    const archivedList = await getA('/api/v1/employees?archived=true');
    expect(archivedList.body.meta.total).toBe(1); // A1

    const active = await getA('/api/v1/employees?status=active');
    expect(active.body.meta.total).toBe(1); // A2
    const terminated = await getA('/api/v1/employees?status=terminated');
    expect(terminated.body.meta.total).toBe(1); // A1

    const all = await getA('/api/v1/employees');
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(2);

    // Parámetro desconocido se descarta (sin efecto, sin error).
    const unknownParam = await getA('/api/v1/employees?department=Sales');
    expect(unknownParam.status).toBe(200);
    expect(unknownParam.body.meta.total).toBe(2);

    const badId = await getA('/api/v1/employees/not-an-id');
    expect(badId.status).toBe(400); // ObjectId estricto en params
  });

  it('asistencia: día único por empleado, horas HH:MM y status derivado', async () => {
    const closed = await postA('/api/v1/attendance', {
      employeeId: employeeA2Id,
      date: '2026-09-20T10:00:00.000Z',
      checkIn: '08:00',
      checkOut: '17:30',
      notes: '  Jornada completa  ',
    });
    expect(closed.status, JSON.stringify(closed.body)).toBe(201);
    const record = closed.body.data;
    expect(record.date).toBe('2026-09-20T00:00:00.000Z'); // trunca a medianoche UTC
    expect(record.checkIn).toBe('08:00');
    expect(record.checkOut).toBe('17:30');
    expect(record.status).toBe('closed'); // derivado de checkOut
    expect(record.notes).toBe('Jornada completa');
    expect(record.archived).toBe(false);
    expect(JSON.stringify(closed.body)).not.toContain('tenantId');
    attA1Id = record.id as string;

    const open = await postA('/api/v1/attendance', {
      employeeId: employeeA2Id,
      date: '2026-09-21',
      checkIn: '09:00',
    });
    expect(open.status, JSON.stringify(open.body)).toBe(201);
    expect(open.body.data.status).toBe('open'); // sin checkOut
    expect(open.body.data.checkOut).toBeNull();
    attA2Id = open.body.data.id as string;

    const dup = await postA('/api/v1/attendance', {
      employeeId: employeeA2Id,
      date: '2026-09-20T23:00:00.000Z', // mismo DÍA tras truncar
      checkIn: '10:00',
    });
    expect(dup.status).toBe(409);
    expect(JSON.stringify(dup.body)).toContain('Attendance already recorded for this date');

    const unknownEmployee = await postA('/api/v1/attendance', {
      employeeId: MISSING_ID,
      date: '2026-09-22',
      checkIn: '08:00',
    });
    expect(unknownEmployee.status).toBe(404); // FK mismo módulo → 404 uniforme

    const archivedEmployee = await postA('/api/v1/attendance', {
      employeeId: employeeA1Id, // archivado en el test de filtros
      date: '2026-09-22',
      checkIn: '08:00',
    });
    expect(archivedEmployee.status).toBe(409);
    expect(JSON.stringify(archivedEmployee.body)).toContain('Employee is archived');

    const badOrder = await postA('/api/v1/attendance', {
      employeeId: employeeA2Id,
      date: '2026-09-22',
      checkIn: '10:00',
      checkOut: '09:00',
    });
    expect(badOrder.status).toBe(400);
    expect(JSON.stringify(badOrder.body)).toContain('checkOut must be on or after checkIn');

    const badTime = await postA('/api/v1/attendance', {
      employeeId: employeeA2Id,
      date: '2026-09-22',
      checkIn: '25:00',
    });
    expect(badTime.status).toBe(400);
    expect(JSON.stringify(badTime.body)).toContain('Invalid time');
  });

  it('asistencia: fichar/abrir, inmutables, sin ruta DELETE y filtros por rango', async () => {
    const closed = await patchA(`/api/v1/attendance/${attA2Id}`, { checkOut: '17:00' });
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    expect(closed.body.data.status).toBe('closed');

    const badOrder = await patchA(`/api/v1/attendance/${attA2Id}`, { checkOut: '08:00' });
    expect(badOrder.status).toBe(400); // checkIn 09:00 > 08:00

    const noCheckIn = await patchA(`/api/v1/attendance/${attA2Id}`, { checkIn: null });
    expect(noCheckIn.status).toBe(400); // no se puede perder la entrada con salida puesta
    expect(JSON.stringify(noCheckIn.body)).toContain('checkIn is required when checkOut is set');

    const reopen = await patchA(`/api/v1/attendance/${attA2Id}`, { checkOut: null });
    expect(reopen.status, JSON.stringify(reopen.body)).toBe(200);
    expect(reopen.body.data.status).toBe('open');

    const together = await patchA(`/api/v1/attendance/${attA2Id}`, {
      checkIn: '07:00',
      checkOut: '16:00',
    });
    expect(together.status).toBe(200);

    const immutableEmployee = await patchA(`/api/v1/attendance/${attA2Id}`, {
      employeeId: MISSING_ID,
    });
    expect(immutableEmployee.status).toBe(400); // fijo al crear
    const immutableDate = await patchA(`/api/v1/attendance/${attA2Id}`, { date: '2026-09-01' });
    expect(immutableDate.status).toBe(400);

    const empty = await patchA(`/api/v1/attendance/${attA2Id}`, {});
    expect(empty.status).toBe(400);
    expect(JSON.stringify(empty.body)).toContain('No valid fields to update');

    // `attendance:*` no tiene `:delete` → la ruta DELETE NO se publica.
    const deleteRoute = await delA(`/api/v1/attendance/${attA2Id}`);
    expect(deleteRoute.status).toBe(404);

    const archived = await patchA(`/api/v1/attendance/${attA2Id}`, { archived: true });
    expect(archived.status).toBe(200);
    const again = await patchA(`/api/v1/attendance/${attA2Id}`, { archived: true });
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain('Attendance is already archived');
    const restored = await patchA(`/api/v1/attendance/${attA2Id}`, { archived: false });
    expect(restored.status).toBe(200);

    const mine = await getA(`/api/v1/attendance?employeeId=${employeeA2Id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.meta.total).toBe(2);

    const range = await getA('/api/v1/attendance?from=2026-09-21&to=2026-09-22');
    expect(range.status).toBe(200);
    expect(range.body.meta.total).toBe(1); // solo 09-21

    const inverted = await getA('/api/v1/attendance?from=2026-09-22&to=2026-09-21');
    expect(inverted.status).toBe(400);
    expect(JSON.stringify(inverted.body)).toContain('from must be on or before to');

    const badEmployee = await getA('/api/v1/attendance?employeeId=nope');
    expect(badEmployee.status).toBe(400);

    const all = await getA('/api/v1/attendance');
    expect(all.body.meta.total).toBe(2);
    expect(JSON.stringify(all.body)).not.toContain('tenantId');
  });

  it('nómina: renglón único por empleado+período, neto derivado y validaciones', async () => {
    const created = await postA('/api/v1/salaries', {
      employeeId: employeeA2Id,
      period: '2026-09',
      baseAmount: 1000.005, // → 1000.01 con roundMoney al escribir
      bonusAmount: 50,
      deductionAmount: 100.5,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const salary = created.body.data;
    expect(salary.baseAmount).toBe(1000.01);
    expect(salary.bonusAmount).toBe(50);
    expect(salary.deductionAmount).toBe(100.5);
    expect(salary.netAmount).toBe(949.51); // DERIVADO: roundMoney(1000.01 + 50 − 100.5)
    expect(salary.archived).toBe(false);
    expect(JSON.stringify(created.body)).not.toContain('tenantId');
    salA1Id = salary.id as string;

    const defaults = await postA('/api/v1/salaries', {
      employeeId: employeeA2Id,
      period: '2026-08',
      baseAmount: 900,
    });
    expect(defaults.status, JSON.stringify(defaults.body)).toBe(201);
    expect(defaults.body.data.bonusAmount).toBe(0); // defaults
    expect(defaults.body.data.deductionAmount).toBe(0);
    expect(defaults.body.data.netAmount).toBe(900);

    const dup = await postA('/api/v1/salaries', {
      employeeId: employeeA2Id,
      period: '2026-09',
      baseAmount: 1,
    });
    expect(dup.status).toBe(409);
    expect(JSON.stringify(dup.body)).toContain('Salary record already exists');

    const fromB = await postB('/api/v1/salaries', {
      employeeId: employeeBId,
      period: '2026-09',
      baseAmount: 500,
    });
    expect(fromB.status, JSON.stringify(fromB.body)).toBe(201); // mismo par en OTRO tenant

    const unknownEmployee = await postA('/api/v1/salaries', {
      employeeId: MISSING_ID,
      period: '2026-07',
      baseAmount: 100,
    });
    expect(unknownEmployee.status).toBe(404);

    const archivedEmployee = await postA('/api/v1/salaries', {
      employeeId: employeeA1Id, // archivado
      period: '2026-07',
      baseAmount: 100,
    });
    expect(archivedEmployee.status).toBe(409);
    expect(JSON.stringify(archivedEmployee.body)).toContain('Employee is archived');

    const badPeriod = await postA('/api/v1/salaries', {
      employeeId: employeeA2Id,
      period: '2026-13',
      baseAmount: 100,
    });
    expect(badPeriod.status).toBe(400);
    expect(JSON.stringify(badPeriod.body)).toContain('Invalid period');

    const negative = await postA('/api/v1/salaries', {
      employeeId: employeeA2Id,
      period: '2026-06',
      baseAmount: -5,
    });
    expect(negative.status).toBe(400);

    const injected = await postA('/api/v1/salaries', {
      employeeId: employeeA2Id,
      period: '2026-06',
      baseAmount: 100,
      tenantId: 'evil',
    });
    expect(injected.status).toBe(400);
  });

  it('nómina: PATCH desplaza el neto derivado, inmutables y sin ruta DELETE', async () => {
    const patched = await patchA(`/api/v1/salaries/${salA1Id}`, { baseAmount: 1100 });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    expect(patched.body.data.baseAmount).toBe(1100);
    expect(patched.body.data.netAmount).toBe(1049.5); // 1100 + 50 − 100.5 recalculado

    const immutableEmployee = await patchA(`/api/v1/salaries/${salA1Id}`, {
      employeeId: MISSING_ID,
    });
    expect(immutableEmployee.status).toBe(400); // fijo al crear
    const immutablePeriod = await patchA(`/api/v1/salaries/${salA1Id}`, { period: '2026-10' });
    expect(immutablePeriod.status).toBe(400);

    const empty = await patchA(`/api/v1/salaries/${salA1Id}`, {});
    expect(empty.status).toBe(400);
    expect(JSON.stringify(empty.body)).toContain('No valid fields to update');

    // `hr.salary:*` no tiene `:delete` → la ruta DELETE NO se publica.
    const deleteRoute = await delA(`/api/v1/salaries/${salA1Id}`);
    expect(deleteRoute.status).toBe(404);

    const archived = await patchA(`/api/v1/salaries/${salA1Id}`, { archived: true });
    expect(archived.status).toBe(200);
    const again = await patchA(`/api/v1/salaries/${salA1Id}`, { archived: true });
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain('Salary is already archived');
    const restored = await patchA(`/api/v1/salaries/${salA1Id}`, { archived: false });
    expect(restored.status).toBe(200);

    const byPeriod = await getA('/api/v1/salaries?period=2026-09');
    expect(byPeriod.status).toBe(200);
    expect(byPeriod.body.meta.total).toBe(1);

    const byEmployee = await getA(`/api/v1/salaries?employeeId=${employeeA2Id}`);
    expect(byEmployee.body.meta.total).toBe(2);

    const badPeriod = await getA('/api/v1/salaries?period=202609');
    expect(badPeriod.status).toBe(400);

    const archivedList = await getA('/api/v1/salaries?archived=true');
    expect(archivedList.body.meta.total).toBe(0);
  });

  it('aislamiento: B no ve ni toca empleados, asistencia ni nómina de A', async () => {
    const employee = await getB(`/api/v1/employees/${employeeA1Id}`);
    expect(employee.status).toBe(404);
    const patchFromB = await patchB(`/api/v1/employees/${employeeA1Id}`, { position: 'hack' });
    expect(patchFromB.status).toBe(404);
    const deleteFromB = await delB(`/api/v1/employees/${employeeA1Id}`);
    expect(deleteFromB.status).toBe(404);

    const attendance = await getB(`/api/v1/attendance/${attA1Id}`);
    expect(attendance.status).toBe(404);
    const salary = await getB(`/api/v1/salaries/${salA1Id}`);
    expect(salary.status).toBe(404);

    const employeesA = await getA('/api/v1/employees');
    expect(employeesA.body.meta.total).toBe(2);
    const employeesB = await getB('/api/v1/employees');
    expect(employeesB.body.meta.total).toBe(1);
    const attendanceB = await getB('/api/v1/attendance');
    expect(attendanceB.body.meta.total).toBe(0);
    const salaryB = await getB('/api/v1/salaries');
    expect(salaryB.body.meta.total).toBe(1);
  });

  it('auditoría: altas, transiciones con reason y archivado por tenant', async () => {
    const creates = await getA('/api/v1/audit?action=employee.create&limit=50');
    expect(creates.status).toBe(200);
    expect(creates.body.meta.total).toBe(2); // A1 y A2 — solo éxitos

    const updates = await getA(
      `/api/v1/audit?action=employee.update&entityId=${employeeA1Id}&limit=50`,
    );
    expect(updates.status).toBe(200);
    expect(
      (
        updates.body.data as Array<{
          metadata?: { reason?: string };
        }>
      ).some((e) => e.metadata?.reason === 'status:terminated'),
    ).toBe(true);

    const archives = await getA(
      `/api/v1/audit?action=employee.archive&entityId=${employeeA1Id}&limit=50`,
    );
    expect(archives.status).toBe(200);
    expect(archives.body.meta.total).toBe(1); // el DELETE de A1

    const attendance = await getA('/api/v1/audit?action=attendance.create&limit=50');
    expect(attendance.body.meta.total).toBe(2);

    const salary = await getA(`/api/v1/audit?action=salary.update&entityId=${salA1Id}&limit=50`);
    expect(salary.status).toBe(200);
    expect(salary.body.meta.total).toBeGreaterThan(0); // baseAmount y/o archived

    const fromB = await getB(
      `/api/v1/audit?action=employee.update&entityId=${employeeA1Id}&limit=50`,
    );
    expect(fromB.body.meta.total).toBe(0);
  });
});
