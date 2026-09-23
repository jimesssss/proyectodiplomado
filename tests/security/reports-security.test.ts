/**
 * Seguridad Reporting — FASE 15.
 * Patrón de `workflow-security.test.ts`: provision de tenant + roles con permisos
 * EXACTOS. Cubre: 401 en las 8 rutas, 403 con `details.permission` por clave
 * (`report:read`/`report:export`), permisos subyacentes ENCADENADOS (ADR-008 §1:
 * `sales.invoice:read`, `supplier.invoice:read`, `bank.account:read`,
 * `product:read`, `lead:read`, `customer:read`), token con `pv` obsoleta,
 * CSV injection neutralizado, query estricta por clave (tenantId, from inválido,
 * groupBy, status, format, clave desconocida → 400; clave de lectura desconocida
 * → 404) y ninguna respuesta con `tenantId`.
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
import { createInventoryRouters } from '../../apps/api/src/modules/inventory/index.js';
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
    { path: '/api/v1/users', router: createUserRouter(deps) },
    { path: '/api/v1/roles', router: createRoleRouter(deps) },
    ...createInventoryRouters(deps),
    ...createReportingRouters(deps),
  ],
});

const PASSWORD = 'Erp-Secret-2026';

/** Las 8 rutas del módulo: 7 de lectura (`report:read`) + export (`report:export`). */
const READ_PATHS = [
  '/api/v1/reports',
  '/api/v1/reports/sales',
  '/api/v1/reports/purchases',
  '/api/v1/reports/cashflow',
  '/api/v1/reports/inventory',
  '/api/v1/reports/inventory/low-stock',
  '/api/v1/reports/crm',
] as const;
const EXPORT_PATH = '/api/v1/reports/sales/export';
const ALL_PATHS = [...READ_PATHS, EXPORT_PATH];

/** Primer permiso subyacente esperado por cada ruta (tras `report:read`). */
const UNDERLYING: ReadonlyArray<readonly [string, string]> = [
  ['/api/v1/reports/sales', 'sales.invoice:read'],
  ['/api/v1/reports/purchases', 'supplier.invoice:read'],
  ['/api/v1/reports/cashflow', 'bank.account:read'],
  ['/api/v1/reports/inventory', 'product:read'],
  ['/api/v1/reports/inventory/low-stock', 'product:read'],
  ['/api/v1/reports/crm', 'lead:read'],
];

let mongod: MongoMemoryServer | undefined;
let ownerToken = '';
let readerToken = '';
let reportOnlyToken = '';
let partialChainToken = '';
let reportSalesToken = '';
let exportOnlyToken = '';

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

async function createUser(owner: string, email: string, roles: string[]): Promise<string> {
  const res = await request(app)
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${owner}`)
    .send({ email, password: PASSWORD, displayName: email.split('@')[0], roles });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return login(email);
}

async function createRole(owner: string, key: string, permissions: string[]): Promise<void> {
  const res = await request(app)
    .post('/api/v1/roles')
    .set('Authorization', `Bearer ${owner}`)
    .send({ key, name: key, permissions });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

describe('reports security', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_reporting_sec'), logger);

    const res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'Sec Reports',
        slug: 'sec-reports',
        owner: { email: 'sec-reports@example.com', password: PASSWORD, displayName: 'Owner' },
      });
    expect(res.status).toBe(201);
    ownerToken = await login('sec-reports@example.com');

    // Roles con permisos EXACTOS (denegación por defecto).
    await createRole(ownerToken, 'report-only', ['report:read']);
    await createRole(ownerToken, 'partial-chain', ['report:read', 'sales.invoice:read']);
    await createRole(ownerToken, 'report-sales', [
      'report:read',
      'sales.invoice:read',
      'customer:read',
    ]);
    await createRole(ownerToken, 'export-only', [
      'report:export',
      'sales.invoice:read',
      'customer:read',
    ]);

    readerToken = await createUser(ownerToken, 'sec-reader@example.com', []);
    reportOnlyToken = await createUser(ownerToken, 'sec-report@example.com', ['report-only']);
    partialChainToken = await createUser(ownerToken, 'sec-partial@example.com', ['partial-chain']);
    reportSalesToken = await createUser(ownerToken, 'sec-sales@example.com', ['report-sales']);
    exportOnlyToken = await createUser(ownerToken, 'sec-export@example.com', ['export-only']);
  }, 60_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('401 en las 8 rutas sin token y con token corrupto', async () => {
    for (const path of ALL_PATHS) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error.code, path).toBe('UNAUTHENTICATED');
    }
    const corrupt = await request(app)
      .get('/api/v1/reports')
      .set('Authorization', 'Bearer not-a-token');
    expect(corrupt.status).toBe(401);
    expect(corrupt.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('roles vacíos → 403 con details.permission (report:read ×7, report:export)', async () => {
    for (const path of READ_PATHS) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${readerToken}`);
      expect(res.status, path).toBe(403);
      expect(res.body.error.message, path).toBe('Missing permission');
      expect(res.body.error.details.permission, path).toBe('report:read');
    }
    const exportRes = await request(app)
      .get(EXPORT_PATH)
      .set('Authorization', `Bearer ${readerToken}`);
    expect(exportRes.status).toBe(403);
    expect(exportRes.body.error.details.permission).toBe('report:export');
  });

  it('report:read sin subyacentes → 403 con el PRIMER subyacente exacto por ruta', async () => {
    const catalog = await request(app)
      .get('/api/v1/reports')
      .set('Authorization', `Bearer ${reportOnlyToken}`);
    expect(catalog.status).toBe(200); // el catálogo es estático: solo report:read

    for (const [path, permission] of UNDERLYING) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${reportOnlyToken}`);
      expect(res.status, path).toBe(403);
      expect(res.body.error.details.permission, path).toBe(permission);
    }
    const exportRes = await request(app)
      .get(EXPORT_PATH)
      .set('Authorization', `Bearer ${reportOnlyToken}`);
    expect(exportRes.status).toBe(403);
    expect(exportRes.body.error.details.permission).toBe('report:export');
  });

  it('encadenamiento: report:read + sales.invoice:read → falla en customer:read', async () => {
    const res = await request(app)
      .get('/api/v1/reports/sales')
      .set('Authorization', `Bearer ${partialChainToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Missing permission');
    expect(res.body.error.details.permission).toBe('customer:read');
  });

  it('cadena completa → /sales 200 pero export 403 (report:export)', async () => {
    const ok = await request(app)
      .get('/api/v1/reports/sales')
      .set('Authorization', `Bearer ${reportSalesToken}`);
    expect(ok.status).toBe(200);

    const exportRes = await request(app)
      .get(EXPORT_PATH)
      .set('Authorization', `Bearer ${reportSalesToken}`);
    expect(exportRes.status).toBe(403);
    expect(exportRes.body.error.details.permission).toBe('report:export');
  });

  it('export-only: /reports y /sales 403 (report:read) pero /sales/export 200', async () => {
    const read = await request(app)
      .get('/api/v1/reports')
      .set('Authorization', `Bearer ${exportOnlyToken}`);
    expect(read.status).toBe(403);
    expect(read.body.error.details.permission).toBe('report:read');

    const report = await request(app)
      .get('/api/v1/reports/sales')
      .set('Authorization', `Bearer ${exportOnlyToken}`);
    expect(report.status).toBe(403);
    expect(report.body.error.details.permission).toBe('report:read');

    const exportRes = await request(app)
      .get(EXPORT_PATH)
      .set('Authorization', `Bearer ${exportOnlyToken}`);
    expect(exportRes.status).toBe(200); // export ≠ consultar
    expect(exportRes.body.data.format).toBe('csv');
  });

  it('token con pv obsoleta → 403 de re-autenticación en report + export; /auth/me 200', async () => {
    const ownerClaims = jwt.verifyAccessToken(ownerToken);
    const stale = jwt.signAccessToken({
      userId: ownerClaims.sub,
      tenantId: ownerClaims.tenantId,
      roles: ownerClaims.roles,
      permissions: [...ownerClaims.permissions],
      permVersion: PERMISSION_CATALOG_VERSION - 1,
      sessionId: ownerClaims.sid,
    });

    const report = await request(app)
      .get('/api/v1/reports')
      .set('Authorization', `Bearer ${stale}`);
    expect(report.status).toBe(403);
    expect(report.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const exportRes = await request(app).get(EXPORT_PATH).set('Authorization', `Bearer ${stale}`);
    expect(exportRes.status).toBe(403);
    expect(exportRes.body.error.message).toBe('Permissions catalog outdated. Sign in again.');

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${stale}`);
    expect(me.status).toBe(200); // solo-autenticada sigue operativa
  });

  it('query estricta: tenantId y claves desconocidas por reporte → 400 (nunca 500)', async () => {
    const bad = [
      '/api/v1/reports/sales?tenantId=507f1f77bcf86cd799439011',
      '/api/v1/reports/inventory?archived=true',
      '/api/v1/reports/sales?from=2026-02-31',
      '/api/v1/reports/sales?groupBy=week',
      '/api/v1/reports/sales?status=issued&groupBy=bogus',
      '/api/v1/reports/cashflow?status=issued',
      '/api/v1/reports/crm?groupBy=month',
      '/api/v1/reports/inventory?from=2026-01-01',
      '/api/v1/reports/sales/export?format=xlsx',
      '/api/v1/reports/nosuch/export',
    ];
    for (const path of bad) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status, path).toBe(400);
      expect(res.body.error.code, path).toBe('VALIDATION_ERROR');
      expect(res.body.success, path).toBe(false);
    }
    const unknown = await request(app)
      .get('/api/v1/reports/unknown')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(unknown.status).toBe(404);
  });

  it('CSV injection: celda que empieza por = viaja con prefijo apóstrofo', async () => {
    const created = await request(app)
      .post('/api/v1/inventory/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'evil-1', name: '=HYPERLINK("http://evil","x")' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const res = await request(app)
      .get('/api/v1/reports/inventory/export')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const csv = res.body.data.csv as string;
    expect(csv).toContain("'=HYPERLINK");
    for (const line of csv.split('\r\n')) {
      if (line.length > 0) {
        expect(['=', '+', '-', '@']).not.toContain(line[0]);
      }
    }
  });

  it('ninguna respuesta incluye tenantId (siempre del JWT, nunca en el envelope)', async () => {
    const paths = ['/api/v1/reports', '/api/v1/reports/sales', EXPORT_PATH];
    for (const path of paths) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status, path).toBe(200);
      expect(JSON.stringify(res.body), path).not.toContain('tenantId');
    }
  });
});
