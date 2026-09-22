/**
 * Integración CRM — FASE 8.
 * Contra MongoDB real (memory server): CRUD de los 5 recursos, FK validadas
 * dentro del tenant, transiciones de lead/oportunidad, soft-delete,
 * auditoría de mutaciones y aislamiento cruzado entre tenants.
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
import { createCrmRouters } from '../../apps/api/src/modules/crm/index.js';

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
    {
      path: '/api/v1/tenants',
      router: createTenantRouter(deps),
    },
    {
      path: '/api/v1/audit',
      router: createAuditRouter(deps),
    },
    ...createCrmRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';
const MISSING_ID = 'ffffffffffffffffffffffff';

let mongod: MongoMemoryServer | undefined;

interface Provisioned {
  readonly token: string;
  readonly userId: string;
}

async function provision(slug: string, email: string): Promise<Provisioned> {
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
    token: login.body.data.accessToken as string,
    userId: login.body.data.user.id as string,
  };
}

describe('crm: clientes, contactos, leads, oportunidades y actividades', () => {
  let tokenA = '';
  let tokenB = '';
  let ownerAUserId = '';
  let customerId = '';
  let bCustomerId = '';
  let leadId = '';
  let oppId = '';
  let oppLostId = '';
  let activityId = '';
  let contactAnaId = '';

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_crm'), logger);
    const a = await provision('crm-tenant-a', 'owner-a@crm.example');
    const b = await provision('crm-tenant-b', 'owner-b@crm.example');
    tokenA = a.token;
    tokenB = b.token;
    ownerAUserId = a.userId;
    // Cliente del tenant B: se usa para comprobar FKs cruzadas → 404.
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ code: 'B-CLI', name: 'B Client' });
    expect(res.status).toBe(201);
    bCustomerId = res.body.data.id as string;
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('crea un cliente: 201, normaliza código/email/dirección y no expone tenantId', async () => {
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        code: 'cli uno',
        name: 'Cliente Uno',
        email: 'Info@Ejemplo.COM',
        address: { street: '  Main 1  ', country: 'es' },
      });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('CLI-UNO');
    expect(res.body.data.type).toBe('company');
    expect(res.body.data.email).toBe('info@ejemplo.com');
    expect(res.body.data.address.street).toBe('Main 1');
    expect(res.body.data.address.country).toBe('ES');
    expect(res.body.data.archived).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('tenantId');
    customerId = res.body.data.id as string;
  });

  it('rechaza código duplicado en el mismo tenant (409) y código inválido (400)', async () => {
    const dup = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'CLI-UNO', name: 'Otro' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');

    const invalid = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: '@@@', name: 'Inválido' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('actualiza el cliente: campos editables, null limpia y el código es inmutable', async () => {
    const renamed = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Cliente Uno S.A.' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe('Cliente Uno S.A.');

    const cleared = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.email).toBeNull();

    const code = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'OTRO' });
    expect(code.status).toBe(400);

    const empty = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});
    expect(empty.status).toBe(400);
  });

  it('contactos: FK obligatoria, desconocida → 404 y un solo principal por cliente', async () => {
    const ana = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ customerId, firstName: 'Ana', lastName: 'Torres', isPrimary: true });
    expect(ana.status).toBe(201);
    expect(ana.body.data.isPrimary).toBe(true);
    contactAnaId = ana.body.data.id as string;

    const luis = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ customerId, firstName: 'Luis', lastName: 'Ramos', isPrimary: true });
    expect(luis.status).toBe(201);

    const unknownFk = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ customerId: MISSING_ID, firstName: 'X', lastName: 'Y' });
    expect(unknownFk.status).toBe(404);

    const list = await request(app)
      .get(`/api/v1/contacts?customerId=${customerId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(2);
    const anaRow = (list.body.data as Array<{ id: string; isPrimary: boolean }>).find(
      (c) => c.id === contactAnaId,
    );
    expect(anaRow?.isPrimary).toBe(false); // degradado al crear el nuevo principal
  });

  it('lead: transiciones validadas, salto rechazado y conversión con cliente', async () => {
    const created = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Lead Norte', source: 'web', email: 'Lead@Norte.example' });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('new');
    expect(created.body.data.email).toBe('lead@norte.example');
    leadId = created.body.data.id as string;

    const jump = await request(app)
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'qualified' });
    expect(jump.status).toBe(409); // new → qualified no existe

    const contacted = await request(app)
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'contacted' });
    expect(contacted.status).toBe(200);

    const same = await request(app)
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'contacted' });
    expect(same.status).toBe(409);

    const qualified = await request(app)
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'qualified' });
    expect(qualified.status).toBe(200);

    const noCustomer = await request(app)
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'converted' });
    expect(noCustomer.status).toBe(400); // convertir exige cliente

    const converted = await request(app)
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'converted', customerId });
    expect(converted.status).toBe(200);
    expect(converted.body.data.status).toBe('converted');
    expect(converted.body.data.customerId).toBe(customerId);

    const unlink = await request(app)
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ customerId: null });
    expect(unlink.status).toBe(409); // convertido no se desvincula

    const reopen = await request(app)
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'contacted' });
    expect(reopen.status).toBe(409); // converted es terminal
  });

  it('lead: assignedTo debe ser usuario del tenant; FK de cliente ajeno → 404', async () => {
    const unknownUser = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Lead Asignado', source: 'event', assignedTo: MISSING_ID });
    expect(unknownUser.status).toBe(400);
    expect(unknownUser.body.error.message).toBe('Unknown user');

    const assigned = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Lead Asignado', source: 'event', assignedTo: ownerAUserId });
    expect(assigned.status).toBe(201);
    expect(assigned.body.data.assignedTo).toBe(ownerAUserId);

    const foreignCustomer = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Lead Cruzado', source: 'other', customerId: bCustomerId });
    expect(foreignCustomer.status).toBe(404);
  });

  it('lead: listado filtra por status', async () => {
    const converted = await request(app)
      .get('/api/v1/leads?status=converted&limit=100')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(converted.status).toBe(200);
    expect((converted.body.data as Array<{ id: string }>).some((lead) => lead.id === leadId)).toBe(
      true,
    );

    const lost = await request(app)
      .get('/api/v1/leads?status=lost')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(lost.status).toBe(200);
    expect((lost.body.data as Array<{ id: string }>).some((lead) => lead.id === leadId)).toBe(
      false,
    );
  });

  it('oportunidad: solo etapas abiertas al crear; camino hasta won y terminales', async () => {
    const closedAtCreate = await request(app)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'No Creada', customerId, stage: 'won' });
    expect(closedAtCreate.status).toBe(400); // won/lost no se crean

    const created = await request(app)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Oppo Uno', customerId, stage: 'prospecting', amount: 1500, currency: 'eur' });
    expect(created.status).toBe(201);
    expect(created.body.data.currency).toBe('EUR');
    expect(created.body.data.amount).toBe(1500);
    oppId = created.body.data.id as string;

    const skip = await request(app)
      .patch(`/api/v1/opportunities/${oppId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ stage: 'proposal' });
    expect(skip.status).toBe(409); // prospecting → proposal no existe

    for (const stage of ['qualification', 'proposal', 'negotiation', 'won']) {
      const step = await request(app)
        .patch(`/api/v1/opportunities/${oppId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ stage });
      expect(step.status).toBe(200);
      expect(step.body.data.stage).toBe(stage);
    }

    const reopen = await request(app)
      .patch(`/api/v1/opportunities/${oppId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ stage: 'prospecting' });
    expect(reopen.status).toBe(409); // won es terminal

    const unknownCustomer = await request(app)
      .patch(`/api/v1/opportunities/${oppId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ customerId: MISSING_ID });
    expect(unknownCustomer.status).toBe(404);
  });

  it('oportunidad: lost exige lostReason y no se admite suelto', async () => {
    const created = await request(app)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Oppo Dos', customerId });
    expect(created.status).toBe(201);
    oppLostId = created.body.data.id as string;

    const looseReason = await request(app)
      .patch(`/api/v1/opportunities/${oppLostId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ lostReason: 'Precio' });
    expect(looseReason.status).toBe(400); // solo con stage: lost

    const withoutReason = await request(app)
      .patch(`/api/v1/opportunities/${oppLostId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ stage: 'lost' });
    expect(withoutReason.status).toBe(400);

    const lost = await request(app)
      .patch(`/api/v1/opportunities/${oppLostId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ stage: 'lost', lostReason: 'Precio fuera de rango' });
    expect(lost.status).toBe(200);
    expect(lost.body.data.stage).toBe('lost');
    expect(lost.body.data.lostReason).toBe('Precio fuera de rango');
  });

  it('actividad: exige enlace, completedAt lo fija el servidor y no se queda sin enlaces', async () => {
    const noLink = await request(app)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'call', subject: 'Primera llamada' });
    expect(noLink.status).toBe(400);

    const unknownLink = await request(app)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'task', subject: 'Tarea', leadId: MISSING_ID });
    expect(unknownLink.status).toBe(404);

    const created = await request(app)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'call', subject: 'Primera llamada', leadId });
    expect(created.status).toBe(201);
    expect(created.body.data.completed).toBe(false);
    expect(created.body.data.completedAt).toBeNull();
    activityId = created.body.data.id as string;

    const done = await request(app)
      .patch(`/api/v1/activities/${activityId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ completed: true, completedAt: '2001-01-01T00:00:00Z' });
    expect(done.status).toBe(400); // completedAt no es editable (strict)

    const completed = await request(app)
      .patch(`/api/v1/activities/${activityId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ completed: true });
    expect(completed.status).toBe(200);
    expect(completed.body.data.completed).toBe(true);
    expect(completed.body.data.completedAt).not.toBeNull();
    expect(completed.body.data.completedAt).not.toBe('2001-01-01T00:00:00.000Z');

    const relink = await request(app)
      .patch(`/api/v1/activities/${activityId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ leadId: null, customerId });
    expect(relink.status).toBe(200);
    expect(relink.body.data.customerId).toBe(customerId);
    expect(relink.body.data.leadId).toBeNull();

    const lastLink = await request(app)
      .patch(`/api/v1/activities/${activityId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ customerId: null });
    expect(lastLink.status).toBe(400); // no puede quedar sin enlaces

    const list = await request(app)
      .get(`/api/v1/activities?customerId=${customerId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('soft-delete: archivar, doble archive → 409 y restaurar con listados filtrados', async () => {
    const archived = await request(app)
      .delete(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(archived.status).toBe(200);
    expect(archived.body.data.archived).toBe(true);

    const twice = await request(app)
      .delete(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(twice.status).toBe(409);

    const patchAgain = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ archived: true });
    expect(patchAgain.status).toBe(409);

    const trueList = await request(app)
      .get('/api/v1/customers?archived=true&limit=100')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(trueList.status).toBe(200);
    expect((trueList.body.data as Array<{ id: string }>).some((c) => c.id === customerId)).toBe(
      true,
    );

    const restored = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ archived: false });
    expect(restored.status).toBe(200);
    expect(restored.body.data.archived).toBe(false);

    const activeList = await request(app)
      .get('/api/v1/customers?archived=false&limit=100')
      .set('Authorization', `Bearer ${tokenA}`);
    expect((activeList.body.data as Array<{ id: string }>).some((c) => c.id === customerId)).toBe(
      true,
    );
  });

  it('aislamiento: el tenant B no ve ni toca recursos de A y puede reusar códigos', async () => {
    const getA = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getA.status).toBe(404);

    const patchA = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Hackeado' });
    expect(patchA.status).toBe(404);

    const deleteA = await request(app)
      .delete(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(deleteA.status).toBe(404);

    const leadA = await request(app)
      .get(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(leadA.status).toBe(404);

    const fkToA = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ customerId, firstName: 'Intruso', lastName: 'Khan' });
    expect(fkToA.status).toBe(404);

    // La unicidad del código es POR TENANT: el mismo código existe en B.
    const sameCode = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ code: 'cli uno', name: 'B Cliente' });
    expect(sameCode.status).toBe(201);

    const listB = await request(app)
      .get('/api/v1/customers?limit=100')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(listB.status).toBe(200);
    expect(listB.body.meta.total).toBe(2);
    expect((listB.body.data as Array<{ id: string }>).every((c) => c.id !== customerId)).toBe(true);
  });

  it('auditoría: registra creaciones, cambios de estado, archive y restore de CRM', async () => {
    const created = await request(app)
      .get('/api/v1/audit?action=customer.create&limit=50')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(created.status).toBe(200);
    expect(
      (created.body.data as Array<{ entityId: string }>).some((e) => e.entityId === customerId),
    ).toBe(true);

    const statusChange = await request(app)
      .get(`/api/v1/audit?action=lead.update&entityId=${leadId}&limit=50`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(statusChange.status).toBe(200);
    expect(
      (statusChange.body.data as Array<{ metadata?: { reason?: string } }>).some(
        (e) => e.metadata?.reason === 'status:contacted',
      ),
    ).toBe(true);

    const archived = await request(app)
      .get('/api/v1/audit?action=customer.archive&limit=50')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(archived.status).toBe(200);
    expect(archived.body.meta.total).toBeGreaterThanOrEqual(1);

    const restored = await request(app)
      .get('/api/v1/audit?action=customer.restore&limit=50')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(restored.status).toBe(200);
    expect(restored.body.meta.total).toBeGreaterThanOrEqual(1);

    // Los tenants no ven la auditoría ajena: B no tiene trazas de A.
    const fromB = await request(app)
      .get('/api/v1/audit?action=customer.create&limit=50')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(fromB.status).toBe(200);
    expect(
      (fromB.body.data as Array<{ entityId: string }>).every((e) => e.entityId !== customerId),
    ).toBe(true);
  });

  it('búsqueda global /search: literal, por tenant y filtrable por tipos', async () => {
    const found = await request(app)
      .get('/api/v1/search?q=Cliente')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(found.status).toBe(200);
    const hit = (
      found.body.data.results as Array<{
        type: string;
        id: string;
        subtitle: string | null;
      }>
    ).find((r) => r.id === customerId);
    expect(hit?.type).toBe('customer');
    expect(hit?.subtitle).toBe('CLI-UNO');

    const onlyLeads = await request(app)
      .get('/api/v1/search?q=Cliente&types=lead')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(onlyLeads.status).toBe(200);
    expect(
      (onlyLeads.body.data.results as Array<{ type: string }>).every((r) => r.type === 'lead'),
    ).toBe(true);

    const tooShort = await request(app)
      .get('/api/v1/search?q=x')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(tooShort.status).toBe(400);

    const metachars = await request(app)
      .get('/api/v1/search?q=c++%20(x)')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(metachars.status).toBe(200); // regex escapada: nada revienta

    const badType = await request(app)
      .get('/api/v1/search?q=cliente&types=bogus')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(badType.status).toBe(400);
    expect(badType.body.error.message).toBe('Unknown search type');
  });
});
