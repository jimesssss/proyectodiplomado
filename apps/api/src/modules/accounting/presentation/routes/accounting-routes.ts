import type { Permission } from '@erp/permissions';
import { Router, type RequestHandler } from 'express';
import { auditFromRequest } from '../../../../core/audit/audit.js';
import { requireAuth } from '../../../../core/auth/middleware.js';
import { requirePermission } from '../../../../core/auth/require-permission.js';
import { successListResponse, successResponse } from '../../../../core/http/envelope.js';
import {
  createCrudRouter,
  crudIdParamsSchema,
  currentUser,
  type CrudListQueryBase,
  type CrudPatchBase,
  type CrudResourceSpec,
  type CrudRouterDeps,
} from '../../../../core/http/crud-router.js';
import { validate } from '../../../../core/validation/validate.js';
import type { PublicAccount } from '../../domain/entities/account.js';
import type { PublicTax } from '../../domain/entities/tax.js';
import {
  archiveAccount,
  createAccount,
  getAccount,
  listAccounts,
  updateAccount,
  type AccountListQuery,
  type CreateAccountInput,
  type PatchAccountInput,
} from '../../application/account-service.js';
import {
  createJournalEntry,
  getJournalEntry,
  listJournalEntries,
  postJournalEntry,
  updateJournalEntry,
  type CreateJournalEntryInput,
  type JournalListQuery,
  type PatchJournalEntryInput,
} from '../../application/journal-service.js';
import {
  createPeriod,
  getPeriod,
  listPeriods,
  updatePeriod,
  type CreatePeriodInput,
  type PatchPeriodInput,
  type PeriodListQuery,
} from '../../application/period-service.js';
import {
  archiveTax,
  createTax,
  getTax,
  listTaxes,
  updateTax,
  type CreateTaxInput,
  type PatchTaxInput,
  type TaxListQuery,
} from '../../application/tax-service.js';
import {
  accountListQuerySchema,
  createAccountBodySchema,
  createJournalBodySchema,
  createPeriodBodySchema,
  createTaxBodySchema,
  journalListQuerySchema,
  patchAccountBodySchema,
  patchJournalBodySchema,
  patchPeriodBodySchema,
  patchTaxBodySchema,
  periodListQuerySchema,
  taxListQuerySchema,
} from '../validators/accounting-validators.js';

export type AccountingRouterDeps = CrudRouterDeps;

/**
 * Montajes del módulo bajo `/api/v1/accounting/…` (convenciones §4): cuentas
 * e impuestos (CRUD vía fábrica, SIN DELETE — el catálogo no define
 * `:delete`; archivar via `PATCH {archived}`), períodos (máquina `open→closed`
 * SIN DELETE ni `archived`) y asientos (router propio: 5 rutas + máquina
 * `draft→posted|cancelled` con `POST /:id/post` y el permiso PROPIO
 * `accounting.journal:post`, patrón de `sales.quote:approve`).
 */
export const ACCOUNTING_ROUTE_PATHS = {
  accounts: '/api/v1/accounting/accounts',
  journalEntries: '/api/v1/accounting/journal-entries',
  periods: '/api/v1/accounting/periods',
  taxes: '/api/v1/accounting/taxes',
} as const;

function accountSpec(): CrudResourceSpec<
  PublicAccount,
  CreateAccountInput,
  PatchAccountInput & CrudPatchBase,
  AccountListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'accounting.account:read',
      create: 'accounting.account:create',
      update: 'accounting.account:update',
      // Sin `accounting.account:delete` en el catálogo → DELETE no publicado.
      delete: undefined,
    },
    entity: 'accounting.account',
    createSchema: createAccountBodySchema,
    patchSchema: patchAccountBodySchema,
    listQuerySchema: accountListQuerySchema,
    handlers: {
      create: (tenantId, body) => createAccount(tenantId, body),
      list: (tenantId, query) => listAccounts(tenantId, query),
      get: (tenantId, id) => getAccount(tenantId, id),
      update: (tenantId, id, patch) => updateAccount(tenantId, id, patch),
      archive: (tenantId, id) => archiveAccount(tenantId, id),
    },
  };
}

function taxSpec(): CrudResourceSpec<
  PublicTax,
  CreateTaxInput,
  PatchTaxInput & CrudPatchBase,
  TaxListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'accounting.tax:read',
      create: 'accounting.tax:create',
      update: 'accounting.tax:update',
      // Sin `accounting.tax:delete` en el catálogo → DELETE no publicado.
      delete: undefined,
    },
    entity: 'accounting.tax',
    createSchema: createTaxBodySchema,
    patchSchema: patchTaxBodySchema,
    listQuerySchema: taxListQuerySchema,
    handlers: {
      create: (tenantId, body) => createTax(tenantId, body),
      list: (tenantId, query) => listTaxes(tenantId, query),
      get: (tenantId, id) => getTax(tenantId, id),
      update: (tenantId, id, patch) => updateTax(tenantId, id, patch),
      archive: (tenantId, id) => archiveTax(tenantId, id),
    },
  };
}

/**
 * Períodos fiscales: 4 rutas a mano (la fábrica CRUD no aplica — el
 * recurso NO tiene `archived` ni ruta DELETE: se cierra, no se archiva).
 */
function createPeriodsRouter(deps: AccountingRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  router.get(
    '/',
    auth,
    requirePermission('accounting.period:read'),
    validate({ query: periodListQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as PeriodListQuery;
      const result = await listPeriods(currentUser(req).tenantId, query);
      res.status(200).json(
        successListResponse(req.requestId, result.items, {
          page: query.page,
          limit: query.limit,
          total: result.total,
        }),
      );
    },
  );

  router.get(
    '/:id',
    auth,
    requirePermission('accounting.period:read'),
    validate({ params: crudIdParamsSchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const period = await getPeriod(currentUser(req).tenantId, params.id);
      res.status(200).json(successResponse(req.requestId, period));
    },
  );

  router.post(
    '/',
    auth,
    requirePermission('accounting.period:create'),
    validate({ body: createPeriodBodySchema }),
    async (req, res) => {
      const body = req.body as CreatePeriodInput;
      const period = await createPeriod(currentUser(req).tenantId, body);
      await auditFromRequest(req, {
        action: 'accounting.period.create',
        entityType: 'accounting.period',
        entityId: period.id,
        newValue: period,
      });
      res.status(201).json(successResponse(req.requestId, period));
    },
  );

  router.patch(
    '/:id',
    auth,
    requirePermission('accounting.period:update'),
    validate({ params: crudIdParamsSchema, body: patchPeriodBodySchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const body = req.body as PatchPeriodInput;
      const updated = await updatePeriod(currentUser(req).tenantId, params.id, body);
      await auditFromRequest(req, {
        action: 'accounting.period.update',
        entityType: 'accounting.period',
        entityId: updated.id,
        newValue: updated,
        reason: body.status === undefined ? undefined : `status:${body.status}`,
      });
      res.status(200).json(successResponse(req.requestId, updated));
    },
  );

  return router;
}

/**
 * Asientos contables: 5 rutas a mano (sin `archived`: los asientos se
 * descartan cancelándose) + `POST /:id/post` con el permiso PROPIO
 * `accounting.journal:post`.
 */
function createJournalRouter(deps: AccountingRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  router.get(
    '/',
    auth,
    requirePermission('accounting.journal:read'),
    validate({ query: journalListQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as JournalListQuery;
      const result = await listJournalEntries(currentUser(req).tenantId, query);
      res.status(200).json(
        successListResponse(req.requestId, result.items, {
          page: query.page,
          limit: query.limit,
          total: result.total,
        }),
      );
    },
  );

  router.get(
    '/:id',
    auth,
    requirePermission('accounting.journal:read'),
    validate({ params: crudIdParamsSchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const entry = await getJournalEntry(currentUser(req).tenantId, params.id);
      res.status(200).json(successResponse(req.requestId, entry));
    },
  );

  router.post(
    '/',
    auth,
    requirePermission('accounting.journal:create'),
    validate({ body: createJournalBodySchema }),
    async (req, res) => {
      const body = req.body as CreateJournalEntryInput;
      const entry = await createJournalEntry(currentUser(req).tenantId, body);
      await auditFromRequest(req, {
        action: 'accounting.journal.create',
        entityType: 'accounting.journal',
        entityId: entry.id,
        newValue: entry,
        reason: `debitTotal:${String(entry.debitTotal)}`,
      });
      res.status(201).json(successResponse(req.requestId, entry));
    },
  );

  router.patch(
    '/:id',
    auth,
    requirePermission('accounting.journal:update'),
    validate({ params: crudIdParamsSchema, body: patchJournalBodySchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const body = req.body as PatchJournalEntryInput;
      const updated = await updateJournalEntry(currentUser(req).tenantId, params.id, body);
      await auditFromRequest(req, {
        action: 'accounting.journal.update',
        entityType: 'accounting.journal',
        entityId: updated.id,
        newValue: updated,
        reason: body.status === undefined ? undefined : `status:${body.status}`,
      });
      res.status(200).json(successResponse(req.requestId, updated));
    },
  );

  router.post(
    '/:id/post',
    auth,
    requirePermission('accounting.journal:post'),
    validate({ params: crudIdParamsSchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const posted = await postJournalEntry(currentUser(req).tenantId, params.id);
      await auditFromRequest(req, {
        action: 'accounting.journal.post',
        entityType: 'accounting.journal',
        entityId: posted.id,
        newValue: posted,
        reason: 'status:posted',
      });
      res.status(200).json(successResponse(req.requestId, posted));
    },
  );

  return router;
}

/** Los 4 montajes del módulo, listos para la composition root. */
export function createAccountingRouters(
  deps: AccountingRouterDeps,
): readonly { path: string; router: Router }[] {
  return [
    { path: ACCOUNTING_ROUTE_PATHS.accounts, router: createCrudRouter(deps, accountSpec()) },
    { path: ACCOUNTING_ROUTE_PATHS.journalEntries, router: createJournalRouter(deps) },
    { path: ACCOUNTING_ROUTE_PATHS.periods, router: createPeriodsRouter(deps) },
    { path: ACCOUNTING_ROUTE_PATHS.taxes, router: createCrudRouter(deps, taxSpec()) },
  ];
}

/** Re-export para la matriz de permisos (permisos usados por recurso). */
export type AccountingPermission = Extract<
  Permission,
  | `accounting.account:${string}`
  | `accounting.journal:${string}`
  | `accounting.period:${string}`
  | `accounting.tax:${string}`
>;
