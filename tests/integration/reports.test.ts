/**
 * Integración Reporting — FASE 15.
 * Contra MongoDB real (memory server): catálogo estático, reportes
 * multi-moneda SIN FX (ventas/compras por `period+currency` con top-5 POR
 * moneda, draft/cancelled/archived fuera), flujo de caja con `$lookup` de
 * tesorería (inflow/outflow/net), inventario valorizado en $facet con
 * low-stock paginado (deficit desc), CRM con tasas leadRate/winRate,
 * defaults de rango por request + límites de escaneo (366 días/120 meses),
 * CSV en el envelope con truncado honesto, auditoría `report.export`, query
 * estricta POR CLAVE (400) y aislamiento cruzado tenant A/B.
 * Las fechas de fixture se capturan UNA VEZ (D*) para que un cambio de día
 * UTC entre beforeAll y aserciones no altere las cubetas.
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
import {
  createOrgRouter,
  ORG_KINDS_BY_PATH,
  ORG_ROUTE_PATHS,
} from '../../apps/api/src/modules/organization/index.js';
import { createTenantRouter, isTenantActive } from '../../apps/api/src/modules/tenancy/index.js';
import { createCrmRouters } from '../../apps/api/src/modules/crm/index.js';
import { createSalesRouters } from '../../apps/api/src/modules/sales/index.js';
import { createPurchasingRouters } from '../../apps/api/src/modules/purchasing/index.js';
import { createInventoryRouters } from '../../apps/api/src/modules/inventory/index.js';
import { createTreasuryRouters } from '../../apps/api/src/modules/treasury/index.js';
import { createReportingRouters } from '../../apps/api/src/modules/reporting/index.js';

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
    ...ORG_KINDS_BY_PATH.map((kind) => ({
      path: `/api/v1/${ORG_ROUTE_PATHS[kind]}`,
      router: createOrgRouter(deps, kind),
    })),
    ...createCrmRouters(deps),
    ...createSalesRouters(deps),
    ...createPurchasingRouters(deps),
    ...createInventoryRouters(deps),
    ...createTreasuryRouters(deps),
    ...createReportingRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';

let mongod: MongoMemoryServer | undefined;

const isoDaysAgo = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

// Fechas de fixture capturadas una sola vez (estables durante todo el run).
const D0 = isoDaysAgo(0);
const D1 = isoDaysAgo(1);
const D5 = isoDaysAgo(5);
const D10 = isoDaysAgo(10);
const D12 = isoDaysAgo(12);
const D14 = isoDaysAgo(14);
const D15 = isoDaysAgo(15);
const D20 = isoDaysAgo(20);
const D25 = isoDaysAgo(25);
const D30 = isoDaysAgo(30);
const D35 = isoDaysAgo(35);
const D40 = isoDaysAgo(40);
const D45 = isoDaysAgo(45);

interface Provisioned {
  readonly token: string;
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
  return { token: login.body.data.accessToken as string };
}

describe('reporting: catálogo, reportes multi-moneda, CSV y aislamiento', () => {
  let tokenA = '';
  let tokenB = '';
  let warehouseId = '';
  let custId1 = '';
  let custId2 = '';
  let custBId = '';
  let supplierId = '';
  let lowStockProductId = '';

  const postA = (path: string, body: object) =>
    request(app).post(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const patchA = (path: string, body: object) =>
    request(app).patch(path).set('Authorization', `Bearer ${tokenA}`).send(body);
  const getA = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenA}`);
  const getB = (path: string) => request(app).get(path).set('Authorization', `Bearer ${tokenB}`);

  /** Crea organization→company→branch→warehouse y devuelve el almacén. */
  async function createWarehouseChain(token: string, suffix: string): Promise<string> {
    const post = (path: string, body: object) =>
      request(app).post(path).set('Authorization', `Bearer ${token}`).send(body);
    const org = await post('/api/v1/organizations', {
      code: `ORG-${suffix}`,
      name: `Org ${suffix}`,
    });
    expect(org.status).toBe(201);
    const comp = await post('/api/v1/companies', {
      code: `COMP-${suffix}`,
      name: `Comp ${suffix}`,
      parentId: org.body.data.id as string,
    });
    expect(comp.status).toBe(201);
    const branch = await post('/api/v1/branches', {
      code: `BR-${suffix}`,
      name: `Branch ${suffix}`,
      parentId: comp.body.data.id as string,
    });
    expect(branch.status).toBe(201);
    const warehouse = await post('/api/v1/warehouses', {
      code: `WH-${suffix}`,
      name: `Warehouse ${suffix}`,
      parentId: branch.body.data.id as string,
    });
    expect(warehouse.status).toBe(201);
    return warehouse.body.data.id as string;
  }

  /** Crea un documento CRUD y aplica los PATCH de máquina en orden. */
  async function createDocument(
    path: string,
    body: object,
    patches: readonly object[],
    token: string = tokenA,
  ): Promise<string> {
    const created = await request(app)
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(created.status, `${path}: ${JSON.stringify(body)}`).toBe(201);
    const id = created.body.data.id as string;
    for (const patch of patches) {
      const res = await request(app)
        .patch(`${path}/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(patch);
      expect(res.status, `${path}/${id}: ${JSON.stringify(patch)}`).toBe(200);
    }
    return id;
  }

  async function addStock(productId: string, quantity: number): Promise<void> {
    const res = await postA('/api/v1/inventory/movements', {
      productId,
      warehouseId,
      type: 'manual_in',
      quantity,
      reason: 'Entrada inicial',
    });
    expect(res.status).toBe(201);
  }

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_reporting'), logger);

    tokenA = (await provision('rep-tenant-a', 'owner-a@rep.example')).token;
    tokenB = (await provision('rep-tenant-b', 'owner-b@rep.example')).token;
    warehouseId = await createWarehouseChain(tokenA, 'A');

    // --- Clientes / proveedor ---
    const c1 = await postA('/api/v1/customers', { code: 'CLI-1', name: 'Cliente Uno' });
    expect(c1.status).toBe(201);
    custId1 = c1.body.data.id as string;
    const c2 = await postA('/api/v1/customers', { code: 'CLI-2', name: 'Cliente Dos' });
    expect(c2.status).toBe(201);
    custId2 = c2.body.data.id as string;
    const cb = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ code: 'CLI-B', name: 'Cliente B' });
    expect(cb.status).toBe(201);
    custBId = cb.body.data.id as string;
    const sup = await postA('/api/v1/suppliers', { code: 'PROV-1', name: 'Proveedor Uno' });
    expect(sup.status).toBe(201);
    supplierId = sup.body.data.id as string;

    // --- Ventas A: i1/i2/i3 emitidos, i4 draft, i5 cancelada, i6 archivada ---
    await createDocument(
      '/api/v1/sales/invoices',
      {
        customerId: custId1,
        currency: 'EUR',
        issueDate: D10,
        lines: [{ description: 'Servicio 10', quantity: 1, unitPrice: 100, taxRate: 10 }],
      },
      [{ status: 'issued' }],
    );
    await createDocument(
      '/api/v1/sales/invoices',
      {
        customerId: custId1,
        currency: 'EUR',
        issueDate: D20,
        lines: [{ description: 'Servicio 20', quantity: 1, unitPrice: 200, taxRate: 10 }],
      },
      [{ status: 'issued' }, { status: 'paid' }],
    );
    await createDocument(
      '/api/v1/sales/invoices',
      {
        customerId: custId2,
        currency: 'USD',
        issueDate: D40,
        lines: [{ description: 'Servicio 40', quantity: 1, unitPrice: 50, taxRate: 0 }],
      },
      [{ status: 'issued' }],
    );
    await createDocument(
      '/api/v1/sales/invoices',
      {
        customerId: custId1,
        currency: 'EUR',
        issueDate: D15,
        lines: [{ description: 'Borrador', quantity: 1, unitPrice: 100, taxRate: 10 }],
      },
      [],
    );
    await createDocument(
      '/api/v1/sales/invoices',
      {
        customerId: custId1,
        currency: 'EUR',
        issueDate: D25,
        lines: [{ description: 'Cancelada', quantity: 1, unitPrice: 100, taxRate: 10 }],
      },
      [{ status: 'cancelled' }],
    );
    await createDocument(
      '/api/v1/sales/invoices',
      {
        customerId: custId1,
        currency: 'EUR',
        issueDate: D30,
        lines: [{ description: 'Archivada', quantity: 1, unitPrice: 100, taxRate: 10 }],
      },
      [{ status: 'issued' }, { archived: true }],
    );

    // --- Compras A: p1/p2 emitidos (+p2 pagado), p3 draft ---
    await createDocument(
      '/api/v1/purchasing/invoices',
      {
        supplierId,
        currency: 'EUR',
        issueDate: D12,
        lines: [{ description: 'Insumo 12', quantity: 1, unitPrice: 100, taxRate: 10 }],
      },
      [{ status: 'issued' }],
    );
    await createDocument(
      '/api/v1/purchasing/invoices',
      {
        supplierId,
        currency: 'USD',
        issueDate: D35,
        lines: [{ description: 'Insumo 35', quantity: 1, unitPrice: 80, taxRate: 0 }],
      },
      [{ status: 'issued' }, { status: 'paid' }],
    );
    await createDocument(
      '/api/v1/purchasing/invoices',
      {
        supplierId,
        currency: 'EUR',
        issueDate: D14,
        lines: [{ description: 'Borrador compra', quantity: 1, unitPrice: 100, taxRate: 10 }],
      },
      [],
    );

    // --- Tesorería A: opening 1000 + cobro 500 − pago 300 = net 1200 ---
    const account = await postA('/api/v1/treasury/accounts', {
      type: 'bank',
      code: 'BK-1',
      name: 'Banco Uno',
      currency: 'EUR',
      openingBalance: 1000,
    });
    expect(account.status).toBe(201);
    const accountId = account.body.data.id as string;
    await createDocument('/api/v1/treasury/receipts', { accountId, amount: 500 }, [
      { status: 'posted' },
    ]);
    await createDocument('/api/v1/treasury/receipts', { accountId, amount: 700 }, []); // draft: sin ledger
    await createDocument('/api/v1/treasury/payments', { accountId, amount: 300 }, [
      { status: 'posted' },
    ]);

    // --- Inventario A: P1/P2 con coste, P3 sin coste, P4 archivado ---
    const p1 = await postA('/api/v1/inventory/products', {
      code: 'rep-1',
      name: 'Repuesto 1',
      cost: 10.5,
      minStock: 5,
    });
    expect(p1.status).toBe(201);
    await addStock(p1.body.data.id as string, 10);
    const p2 = await postA('/api/v1/inventory/products', {
      code: 'rep-2',
      name: 'Repuesto 2',
      cost: 20,
      minStock: 100,
    });
    expect(p2.status).toBe(201);
    lowStockProductId = p2.body.data.id as string;
    await addStock(lowStockProductId, 3);
    const p3 = await postA('/api/v1/inventory/products', { code: 'rep-3', name: 'Repuesto 3' });
    expect(p3.status).toBe(201);
    await addStock(p3.body.data.id as string, 5);
    const p4 = await postA('/api/v1/inventory/products', {
      code: 'rep-4',
      name: 'Repuesto 4',
      cost: 999,
      minStock: 1,
    });
    expect(p4.status).toBe(201);
    await addStock(p4.body.data.id as string, 50);
    const archived = await request(app)
      .delete(`/api/v1/inventory/products/${p4.body.data.id as string}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(archived.status).toBe(200);

    // --- CRM A: 1 converted + 1 lost; 1 won, 1 lost, 1 abierta ---
    const lead1 = await postA('/api/v1/leads', {
      name: 'Lead Convertido',
      source: 'web',
      customerId: custId1,
    });
    expect(lead1.status).toBe(201);
    const lead1Id = lead1.body.data.id as string;
    for (const status of ['contacted', 'qualified', 'converted']) {
      expect((await patchA(`/api/v1/leads/${lead1Id}`, { status })).status).toBe(200);
    }
    const lead2 = await postA('/api/v1/leads', { name: 'Lead Perdido', source: 'event' });
    expect(lead2.status).toBe(201);
    expect(
      (await patchA(`/api/v1/leads/${lead2.body.data.id as string}`, { status: 'lost' })).status,
    ).toBe(200);

    const opp1 = await postA('/api/v1/opportunities', {
      name: 'Oportunidad EUR',
      customerId: custId1,
      stage: 'negotiation',
      amount: 500,
      currency: 'EUR',
    });
    expect(opp1.status).toBe(201);
    expect(
      (await patchA(`/api/v1/opportunities/${opp1.body.data.id as string}`, { stage: 'won' }))
        .status,
    ).toBe(200);
    const opp2 = await postA('/api/v1/opportunities', {
      name: 'Oportunidad USD',
      customerId: custId1,
      stage: 'proposal',
      amount: 300,
      currency: 'USD',
    });
    expect(opp2.status).toBe(201);
    expect(
      (
        await patchA(`/api/v1/opportunities/${opp2.body.data.id as string}`, {
          stage: 'lost',
          lostReason: 'Sin presupuesto',
        })
      ).status,
    ).toBe(200);
    const opp3 = await postA('/api/v1/opportunities', {
      name: 'Oportunidad USD 2',
      customerId: custId1,
      stage: 'proposal',
      amount: 200,
      currency: 'USD',
    });
    expect(opp3.status).toBe(201);

    // --- Tenant B: una factura USD emitida + cliente ---
    await createDocument(
      '/api/v1/sales/invoices',
      {
        customerId: custBId,
        currency: 'USD',
        issueDate: D5,
        lines: [{ description: 'B', quantity: 1, unitPrice: 40, taxRate: 0 }],
      },
      [{ status: 'issued' }],
      tokenB,
    );
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('catálogo: 5 reportes con sus params, sin datos ni tenantId', async () => {
    const res = await getA('/api/v1/reports');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta.requestId).toBeTruthy();
    const reports = res.body.data.reports as Array<{
      key: string;
      name: string;
      params: string[];
    }>;
    expect(reports.map((r) => r.key)).toEqual([
      'sales',
      'purchases',
      'cashflow',
      'inventory',
      'crm',
    ]);
    const sales = reports.find((r) => r.key === 'sales');
    expect(sales?.params).toEqual(['from', 'to', 'groupBy', 'status']);
    const cash = reports.find((r) => r.key === 'cashflow');
    expect(cash?.params).toEqual(['from', 'to', 'groupBy']);
    const inventory = reports.find((r) => r.key === 'inventory');
    expect(inventory?.params).toEqual([]); // snapshot sin filtros
    expect(JSON.stringify(res.body)).not.toContain('tenantId');
  });

  it('ventas por defecto: totales multi-moneda y top-5 POR moneda', async () => {
    const res = await getA('/api/v1/reports/sales');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.report).toBe('sales');
    expect(data.groupBy).toBe('month');
    expect(typeof data.from).toBe('string');
    expect(data.from < data.to).toBe(true);
    // EUR: i1 (110) + i2 (220); USD: i3 (50). draft/cancelled/archived fuera.
    expect(data.totals).toEqual([
      { currency: 'EUR', count: 2, subtotal: 300, tax: 30, total: 330 },
      { currency: 'USD', count: 1, subtotal: 50, tax: 0, total: 50 },
    ]);
    expect(data.topCustomers).toEqual([
      {
        id: custId1,
        name: 'Cliente Uno',
        code: 'CLI-1',
        currency: 'EUR',
        total: 330,
        count: 2,
      },
      {
        id: custId2,
        name: 'Cliente Dos',
        code: 'CLI-2',
        currency: 'USD',
        total: 50,
        count: 1,
      },
    ]);
    const series = data.series as Array<{ count: number; total: number }>;
    expect(series.reduce((sum, row) => sum + row.count, 0)).toBe(3);
    expect(series.reduce((sum, row) => sum + row.total, 0)).toBe(380);
    expect(JSON.stringify(res.body)).not.toContain('tenantId');
  });

  it('ventas: serie DIARIA exacta con from/to explícitos (excluye draft/cancelled/archived)', async () => {
    const res = await getA(`/api/v1/reports/sales?groupBy=day&from=${D45}&to=${D5}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.from).toBe(D45);
    expect(data.to).toBe(D5);
    expect(data.groupBy).toBe('day');
    // 3 filas exactas: D45..D5 cubre todas las de A (D10..D40); i4/i5/i6 (D15/D25/D30)
    // están en el rango pero draft/cancelled/archived → fuera.
    expect(data.series).toEqual([
      { period: D40, currency: 'USD', count: 1, subtotal: 50, tax: 0, total: 50 },
      { period: D20, currency: 'EUR', count: 1, subtotal: 200, tax: 20, total: 220 },
      { period: D10, currency: 'EUR', count: 1, subtotal: 100, tax: 10, total: 110 },
    ]);
  });

  it('ventas ?status=issued: excluye pagadas (y sigue sin draft/cancelled/archived)', async () => {
    const res = await getA('/api/v1/reports/sales?status=issued');
    expect(res.status).toBe(200);
    const data = res.body.data;
    // i2 (paid) fuera → EUR queda solo con i1.
    expect(data.totals).toEqual([
      { currency: 'EUR', count: 1, subtotal: 100, tax: 10, total: 110 },
      { currency: 'USD', count: 1, subtotal: 50, tax: 0, total: 50 },
    ]);
    expect(data.topCustomers).toEqual([
      {
        id: custId1,
        name: 'Cliente Uno',
        code: 'CLI-1',
        currency: 'EUR',
        total: 110,
        count: 1,
      },
      {
        id: custId2,
        name: 'Cliente Dos',
        code: 'CLI-2',
        currency: 'USD',
        total: 50,
        count: 1,
      },
    ]);
  });

  it('ventas: cubetas MENSUALES suman exactamente los totales (por moneda)', async () => {
    const res = await getA('/api/v1/reports/sales');
    const data = res.body.data;
    const series = data.series as Array<{
      period: string;
      currency: string;
      count: number;
      subtotal: number;
      tax: number;
      total: number;
    }>;
    expect(series.reduce((sum, row) => sum + row.count, 0)).toBe(3);
    expect(series.reduce((sum, row) => sum + row.total, 0)).toBe(380);
    const usd = series.filter((row) => row.currency === 'USD');
    expect(usd).toEqual([
      { period: D40.slice(0, 7), currency: 'USD', count: 1, subtotal: 50, tax: 0, total: 50 },
    ]);
    const eur = series.filter((row) => row.currency === 'EUR');
    expect(eur.reduce((sum, row) => sum + row.total, 0)).toBe(330);
    expect(eur.reduce((sum, row) => sum + row.subtotal, 0)).toBe(300);
    expect(eur.reduce((sum, row) => sum + row.tax, 0)).toBe(30);
    expect(data.totals).toEqual([
      { currency: 'EUR', count: 2, subtotal: 300, tax: 30, total: 330 },
      { currency: 'USD', count: 1, subtotal: 50, tax: 0, total: 50 },
    ]);
  });

  it('compras: totales por moneda y top-suppliers (p3 draft fuera)', async () => {
    const res = await getA('/api/v1/reports/purchases');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.totals).toEqual([
      { currency: 'EUR', count: 1, subtotal: 100, tax: 10, total: 110 },
      { currency: 'USD', count: 1, subtotal: 80, tax: 0, total: 80 },
    ]);
    expect(data.topSuppliers).toEqual([
      {
        id: supplierId,
        name: 'Proveedor Uno',
        code: 'PROV-1',
        currency: 'EUR',
        total: 110,
        count: 1,
      },
      {
        id: supplierId,
        name: 'Proveedor Uno',
        code: 'PROV-1',
        currency: 'USD',
        total: 80,
        count: 1,
      },
    ]);
    const series = data.series as Array<{ count: number }>;
    expect(series.reduce((sum, row) => sum + row.count, 0)).toBe(2);
  });

  it('flujo de caja: inflow 1500 / outflow 300 / net 1200 con moneda vía $lookup', async () => {
    const res = await getA('/api/v1/reports/cashflow');
    expect(res.status).toBe(200);
    const data = res.body.data;
    // opening 1000 + cobro posted 500; cobro draft 700 NO genera movimiento.
    expect(data.totals).toEqual([
      { currency: 'EUR', inflow: 1500, outflow: 300, net: 1200, count: 3 },
    ]);
    const series = data.series as Array<{
      currency: string;
      inflow: number;
      outflow: number;
      net: number;
      count: number;
    }>;
    expect(series.length).toBeGreaterThanOrEqual(1);
    expect(series.every((row) => row.currency === 'EUR')).toBe(true);
    expect(series.reduce((sum, row) => sum + row.inflow, 0)).toBe(1500);
    expect(series.reduce((sum, row) => sum + row.outflow, 0)).toBe(300);
    expect(series.reduce((sum, row) => sum + row.net, 0)).toBe(1200);
    expect(series.reduce((sum, row) => sum + row.count, 0)).toBe(3);
  });

  it('inventario: valorización $facet exacta (archivado fuera) y low-stock paginado', async () => {
    const res = await getA('/api/v1/reports/inventory');
    expect(res.status).toBe(200);
    // P1 10×10.5 + P2 3×20 = 165; P3 sin coste; P4 archivado (50×999) fuera.
    expect(res.body.data).toEqual({
      report: 'inventory',
      products: 3,
      valued: 2,
      unpriced: 1,
      stockValue: 165,
      lowStock: 1,
    });

    const low = await getA('/api/v1/reports/inventory/low-stock');
    expect(low.status).toBe(200);
    expect(low.body.data).toEqual([
      {
        productId: lowStockProductId,
        code: 'REP-2',
        name: 'Repuesto 2',
        unit: 'unit',
        minStock: 100,
        qty: 3,
        deficit: 97,
      },
    ]);
    expect(low.body.meta.total).toBe(1);
    expect(low.body.meta.page).toBe(1);
    expect(low.body.meta.limit).toBe(20);

    const page2 = await getA('/api/v1/reports/inventory/low-stock?page=2');
    expect(page2.status).toBe(200);
    expect(page2.body.data).toEqual([]);
    expect(page2.body.meta.total).toBe(1);
  });

  it('crm: leadRate y winRate con desgloses ordenados', async () => {
    const res = await getA('/api/v1/reports/crm');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.leads).toEqual({
      total: 2,
      byStatus: [
        { status: 'converted', count: 1 },
        { status: 'lost', count: 1 },
      ],
      leadRate: 0.5,
    });
    expect(data.opportunities).toEqual({
      total: 3,
      byStage: [
        { stage: 'lost', count: 1 },
        { stage: 'proposal', count: 1 },
        { stage: 'won', count: 1 },
      ],
      byCurrency: [
        { currency: 'EUR', amount: 500, count: 1 },
        { currency: 'USD', amount: 500, count: 2 },
      ],
      winRate: 0.5,
    });
    expect(data.report).toBe('crm');
    expect(data.from < data.to).toBe(true);
  });

  it('query estricta POR CLAVE: parámetros inválidos → 400 (nunca 500) y clave plana → 404', async () => {
    const bad: readonly string[] = [
      `/api/v1/reports/sales?from=${D0}&to=${D1}`, // from > to
      '/api/v1/reports/sales?from=2026-02-31', // calendario imposible
      '/api/v1/reports/sales?groupBy=week', // solo day|month
      `/api/v1/reports/sales?groupBy=day&from=${isoDaysAgo(370)}`, // > 366 días
      `/api/v1/reports/sales?from=${isoDaysAgo(4000)}`, // > 120 meses
      '/api/v1/reports/sales?tenantId=otro-tenant', // nunca del cliente
      '/api/v1/reports/sales?status=draft', // solo issued|paid
      `/api/v1/reports/inventory?from=${D0}`, // snapshot sin params
      '/api/v1/reports/crm?groupBy=month', // crm no agrupa
      '/api/v1/reports/sales/export?format=xlsx', // solo csv
      '/api/v1/reports/sales/export?limit=0', // limit ≥ 1
      '/api/v1/reports/nosuch/export', // clave de export desconocida
    ];
    for (const path of bad) {
      const res = await getA(path);
      expect(res.status, path).toBe(400);
      expect(res.body.error.code, path).toBe('VALIDATION_ERROR');
    }
    const missing = await getA('/api/v1/reports/unknown');
    expect(missing.status).toBe(404);

    // Los mensajes de límite viajan al cliente (issues de validación).
    const dayCap = await getA(`/api/v1/reports/sales?groupBy=day&from=${isoDaysAgo(370)}`);
    expect(JSON.stringify(dayCap.body)).toContain('366');
    const monthCap = await getA(`/api/v1/reports/sales?from=${isoDaysAgo(4000)}`);
    expect(JSON.stringify(monthCap.body)).toContain('120');
    const inverted = await getA(`/api/v1/reports/sales?from=${D0}&to=${D1}`);
    expect(JSON.stringify(inverted.body)).toContain('from must not be after to');
  });

  it('export sales: CSV en el envelope, filas = emitidas, limit trunca con warning y status filtra', async () => {
    const res = await getA('/api/v1/reports/sales/export');
    expect(res.status).toBe(200);
    const payload = res.body.data;
    expect(payload.report).toBe('sales');
    expect(payload.format).toBe('csv');
    expect(payload.rowCount).toBe(3); // i1+i2+i3 (draft/cancelled/archived fuera)
    expect(payload.truncated).toBe(false);
    expect(payload.warning).toBeNull();
    const lines = (payload.csv as string).split('\r\n');
    expect(lines[0]).toBe(
      'number,customer,customerId,issueDate,status,currency,subtotal,tax,total',
    );
    expect(lines.filter((line) => line.length > 0).length).toBe(4); // cabecera + 3
    expect(payload.csv as string).toContain('Cliente Uno');
    expect(payload.csv as string).toContain(',issued,EUR,100,10,110');
    expect(payload.csv as string).toContain(',paid,EUR,200,20,220');
    expect(payload.csv as string).toContain(`,issued,USD,50,0,50`);
    expect(payload.csv as string).toContain(D40); // fechas de negocio YYYY-MM-DD
    expect(JSON.stringify(res.body)).not.toContain('tenantId');

    const limited = await getA('/api/v1/reports/sales/export?limit=1');
    expect(limited.status).toBe(200);
    expect(limited.body.data.rowCount).toBe(1);
    expect(limited.body.data.truncated).toBe(true);
    expect(limited.body.data.warning).toContain('truncated at 1 rows');
    expect(limited.body.data.warning).toContain('5000');
    const limitedLines = (limited.body.data.csv as string)
      .split('\r\n')
      .filter((line) => line.length > 0);
    expect(limitedLines.length).toBe(2); // cabecera + 1

    const issued = await getA('/api/v1/reports/sales/export?status=issued');
    expect(issued.body.data.rowCount).toBe(2);
  });

  it('export inventory: snapshot valorizado en columnas (archivado fuera, sin coste → celda vacía)', async () => {
    const res = await getA('/api/v1/reports/inventory/export');
    expect(res.status).toBe(200);
    const payload = res.body.data;
    expect(payload.rowCount).toBe(3);
    expect(payload.truncated).toBe(false);
    const lines = (payload.csv as string).split('\r\n');
    expect(lines[0]).toBe('code,name,unit,minStock,qty,cost,value');
    expect(payload.csv as string).toContain('REP-1');
    expect(payload.csv as string).not.toContain('REP-4'); // archivado fuera
    expect(payload.csv as string).toContain('REP-2,Repuesto 2,unit,100,3,20,60');
    expect(payload.csv as string).toContain('REP-3,Repuesto 3,unit,,5,,');
  });

  it('exports cashflow/purchases/crm: cabeceras fijas, números crudos y filas esperadas', async () => {
    const cash = await getA('/api/v1/reports/cashflow/export');
    expect(cash.status).toBe(200);
    expect(cash.body.data.rowCount).toBe(3); // opening + cobro + pago (draft fuera)
    const cashLines = (cash.body.data.csv as string).split('\r\n');
    expect(cashLines[0]).toBe('createdAt,accountId,currency,sourceType,amount,balanceAfter,reason');
    expect(cash.body.data.csv as string).toContain('-300'); // número NEGATIVO sin guarda
    expect(cash.body.data.csv as string).toContain(',EUR,');

    const purchases = await getA('/api/v1/reports/purchases/export');
    expect(purchases.status).toBe(200);
    expect(purchases.body.data.rowCount).toBe(2); // p1+p2 (p3 draft fuera)
    const purchLines = (purchases.body.data.csv as string).split('\r\n');
    expect(purchLines[0]).toBe(
      'number,supplier,supplierId,issueDate,status,currency,subtotal,tax,total',
    );
    expect(purchases.body.data.csv as string).toContain('Proveedor Uno');

    const crm = await getA('/api/v1/reports/crm/export');
    expect(crm.status).toBe(200);
    expect(crm.body.data.rowCount).toBe(3); // oportunidades no archivadas
    const crmLines = (crm.body.data.csv as string).split('\r\n');
    expect(crmLines[0]).toBe('name,stage,currency,amount,expectedCloseDate,createdAt');
    expect(crm.body.data.csv as string).toContain('Oportunidad EUR');
    expect(crm.body.data.csv as string).toContain(',won,EUR,500,');
  });

  it('auditoría: cada exportación registra report.export con entityId = clave', async () => {
    const res = await getA('/api/v1/audit?action=report.export&limit=100');
    expect(res.status).toBe(200);
    const entries = res.body.data as Array<{
      action: string;
      entityType: string;
      entityId: string;
    }>;
    const exports = entries.filter((entry) => entry.action === 'report.export');
    expect(exports.length).toBeGreaterThanOrEqual(7); // 3 sales + inventory + cashflow + purchases + crm
    expect(exports.some((entry) => entry.entityId === 'sales')).toBe(true);
    expect(exports.some((entry) => entry.entityId === 'inventory')).toBe(true);
    expect(exports.every((entry) => entry.entityType === 'report')).toBe(true);
  });

  it('aislamiento: el tenant B solo ve lo suyo y A queda intacto', async () => {
    const salesB = await getB('/api/v1/reports/sales');
    expect(salesB.status).toBe(200);
    expect(salesB.body.data.totals).toEqual([
      { currency: 'USD', count: 1, subtotal: 40, tax: 0, total: 40 },
    ]);
    expect(salesB.body.data.topCustomers).toEqual([
      { id: custBId, name: 'Cliente B', code: 'CLI-B', currency: 'USD', total: 40, count: 1 },
    ]);

    const inventoryB = await getB('/api/v1/reports/inventory');
    expect(inventoryB.body.data).toEqual({
      report: 'inventory',
      products: 0,
      valued: 0,
      unpriced: 0,
      stockValue: 0,
      lowStock: 0,
    });
    const lowB = await getB('/api/v1/reports/inventory/low-stock');
    expect(lowB.body.data).toEqual([]);
    expect(lowB.body.meta.total).toBe(0);

    const crmB = await getB('/api/v1/reports/crm');
    expect(crmB.body.data.leads).toEqual({ total: 0, byStatus: [], leadRate: 0 });
    expect(crmB.body.data.opportunities).toEqual({
      total: 0,
      byStage: [],
      byCurrency: [],
      winRate: 0,
    });

    const cashB = await getB('/api/v1/reports/cashflow');
    expect(cashB.body.data.series).toEqual([]);
    expect(cashB.body.data.totals).toEqual([]);

    const purchasesB = await getB('/api/v1/reports/purchases');
    expect(purchasesB.body.data.totals).toEqual([]);
    expect(purchasesB.body.data.topSuppliers).toEqual([]);

    // A intacto tras todas las lecturas de B (sin fugas de tenant).
    const salesA = await getA('/api/v1/reports/sales');
    expect(salesA.body.data.totals).toEqual([
      { currency: 'EUR', count: 2, subtotal: 300, tax: 30, total: 330 },
      { currency: 'USD', count: 1, subtotal: 50, tax: 0, total: 50 },
    ]);
    expect(JSON.stringify(salesA.body)).not.toContain('tenantId');
  });
});
