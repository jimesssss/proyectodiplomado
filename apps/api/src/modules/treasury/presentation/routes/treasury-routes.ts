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
import type { PublicPayment, PublicReceipt } from '../../domain/entities/money-documents.js';
import type { PublicTreasuryAccount } from '../../domain/entities/treasury-account.js';
import {
  archivePayment,
  createPayment,
  getPayment,
  listPayments,
  updatePayment,
  type CreatePaymentInput,
  type PatchPaymentInput,
  type PaymentListQuery,
} from '../../application/payment-service.js';
import {
  archiveReceipt,
  createReceipt,
  getReceipt,
  listReceipts,
  updateReceipt,
  type CreateReceiptInput,
  type PatchReceiptInput,
  type ReceiptListQuery,
} from '../../application/receipt-service.js';
import {
  archiveTreasuryAccount,
  createTreasuryAccount,
  getTreasuryAccount,
  listAccountMovements,
  listTreasuryAccounts,
  updateTreasuryAccount,
  type CreateTreasuryAccountInput,
  type MovementListQuery,
  type PatchTreasuryAccountInput,
  type TreasuryAccountListQuery,
} from '../../application/treasury-account-service.js';
import {
  createBankTransaction,
  getBankTransaction,
  listBankTransactions,
  updateBankTransaction,
  type BankTxListQuery,
  type CreateBankTransactionInput,
  type PatchBankTransactionInput,
} from '../../application/bank-transaction-service.js';
import {
  createReconciliation,
  getReconciliation,
  listReconciliations,
  updateReconciliation,
  type CreateReconciliationInput,
  type PatchReconciliationInput,
  type ReconciliationListQuery,
} from '../../application/reconciliation-service.js';
import {
  bankTransactionListQuerySchema,
  createBankTransactionBodySchema,
  createPaymentBodySchema,
  createReceiptBodySchema,
  createReconciliationBodySchema,
  createTreasuryAccountBodySchema,
  movementsListQuerySchema,
  patchBankTransactionBodySchema,
  patchPaymentBodySchema,
  patchReceiptBodySchema,
  patchReconciliationBodySchema,
  patchTreasuryAccountBodySchema,
  paymentListQuerySchema,
  receiptListQuerySchema,
  reconciliationListQuerySchema,
  treasuryAccountListQuerySchema,
} from '../validators/treasury-validators.js';

export type TreasuryRouterDeps = CrudRouterDeps;

/**
 * Montajes del módulo bajo `/api/v1/treasury/…` (convenciones §4): cuentas
 * de tesorería (CRUD vía fábrica, SIN DELETE — el catálogo no define
 * `bank.account:delete`; archivar via `PATCH {archived}`) + sub-ruta de
 * extracto `GET /:id/movements` sobre el MISMO path, pagos y cobros (CRUD
 * con máquina `draft→posted|cancelled` publicada con `:update` — el catálogo
 * no define `payment:post`/`receipt:post`, patrón `goods.receipt`) y dos
 * routers propios (líneas de banco y conciliaciones, sin `archived` ni
 * DELETE). Los permisos de líneas de banco viajan sobre `bank.account:*`
 * (el catálogo no tiene `bank.transaction:*`) pero su auditoría usa el
 * canónico propio `bank.transaction`.
 */
export const TREASURY_ROUTE_PATHS = {
  accounts: '/api/v1/treasury/accounts',
  payments: '/api/v1/treasury/payments',
  receipts: '/api/v1/treasury/receipts',
  bankTransactions: '/api/v1/treasury/bank-transactions',
  reconciliations: '/api/v1/treasury/reconciliations',
} as const;

function accountSpec(): CrudResourceSpec<
  PublicTreasuryAccount,
  CreateTreasuryAccountInput,
  PatchTreasuryAccountInput & CrudPatchBase,
  TreasuryAccountListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'bank.account:read',
      create: 'bank.account:create',
      update: 'bank.account:update',
      // Sin `bank.account:delete` en el catálogo → DELETE no publicado.
      delete: undefined,
    },
    entity: 'bank.account',
    createSchema: createTreasuryAccountBodySchema,
    patchSchema: patchTreasuryAccountBodySchema,
    listQuerySchema: treasuryAccountListQuerySchema,
    handlers: {
      create: (tenantId, body) => createTreasuryAccount(tenantId, body),
      list: (tenantId, query) => listTreasuryAccounts(tenantId, query),
      get: (tenantId, id) => getTreasuryAccount(tenantId, id),
      update: (tenantId, id, patch) => updateTreasuryAccount(tenantId, id, patch),
      archive: (tenantId, id) => archiveTreasuryAccount(tenantId, id),
    },
  };
}

function paymentSpec(): CrudResourceSpec<
  PublicPayment,
  CreatePaymentInput,
  PatchPaymentInput & CrudPatchBase,
  PaymentListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'payment:read',
      create: 'payment:create',
      update: 'payment:update',
      // Sin `payment:delete` en el catálogo → DELETE no publicado.
      delete: undefined,
    },
    entity: 'payment',
    createSchema: createPaymentBodySchema,
    patchSchema: patchPaymentBodySchema,
    listQuerySchema: paymentListQuerySchema,
    handlers: {
      create: (tenantId, body) => createPayment(tenantId, body),
      list: (tenantId, query) => listPayments(tenantId, query),
      get: (tenantId, id) => getPayment(tenantId, id),
      // `PATCH {status:'posted'}` = publicación (mueve dinero) con `:update`.
      update: (tenantId, id, patch) => updatePayment(tenantId, id, patch),
      archive: (tenantId, id) => archivePayment(tenantId, id),
    },
  };
}

function receiptSpec(): CrudResourceSpec<
  PublicReceipt,
  CreateReceiptInput,
  PatchReceiptInput & CrudPatchBase,
  ReceiptListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'receipt:read',
      create: 'receipt:create',
      update: 'receipt:update',
      // Sin `receipt:delete` en el catálogo → DELETE no publicado.
      delete: undefined,
    },
    entity: 'receipt',
    createSchema: createReceiptBodySchema,
    patchSchema: patchReceiptBodySchema,
    listQuerySchema: receiptListQuerySchema,
    handlers: {
      create: (tenantId, body) => createReceipt(tenantId, body),
      list: (tenantId, query) => listReceipts(tenantId, query),
      get: (tenantId, id) => getReceipt(tenantId, id),
      update: (tenantId, id, patch) => updateReceipt(tenantId, id, patch),
      archive: (tenantId, id) => archiveReceipt(tenantId, id),
    },
  };
}

/**
 * Extracto de la cuenta (`GET /treasury/accounts/:id/movements`): montado
 * en el MISMO path que el CRUD de cuentas (dos routers encadenados; `/:id`
 * del CRUD no captura rutas de dos segmentos). Permiso `bank.account:read`.
 */
function createMovementsRouter(deps: TreasuryRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  router.get(
    '/:id/movements',
    auth,
    requirePermission('bank.account:read'),
    validate({ params: crudIdParamsSchema, query: movementsListQuerySchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const query = req.query as unknown as MovementListQuery;
      const result = await listAccountMovements(currentUser(req).tenantId, params.id, query);
      res.status(200).json(
        successListResponse(req.requestId, result.items, {
          page: query.page,
          limit: query.limit,
          total: result.total,
        }),
      );
    },
  );

  return router;
}

/**
 * Líneas de estado de cuenta: 4 rutas a mano (sin `archived` ni máquina:
 * solo `description` es editable). Permisos `bank.account:*` (el catálogo
 * no define `bank.transaction:*`); auditoría con el canónico propio
 * `bank.transaction`.
 */
function createBankTransactionsRouter(deps: TreasuryRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  router.get(
    '/',
    auth,
    requirePermission('bank.account:read'),
    validate({ query: bankTransactionListQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as BankTxListQuery;
      const result = await listBankTransactions(currentUser(req).tenantId, query);
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
    requirePermission('bank.account:read'),
    validate({ params: crudIdParamsSchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const tx = await getBankTransaction(currentUser(req).tenantId, params.id);
      res.status(200).json(successResponse(req.requestId, tx));
    },
  );

  router.post(
    '/',
    auth,
    requirePermission('bank.account:create'),
    validate({ body: createBankTransactionBodySchema }),
    async (req, res) => {
      const body = req.body as CreateBankTransactionInput;
      const tx = await createBankTransaction(currentUser(req).tenantId, body);
      await auditFromRequest(req, {
        action: 'bank.transaction.create',
        entityType: 'bank.transaction',
        entityId: tx.id,
        newValue: tx,
      });
      res.status(201).json(successResponse(req.requestId, tx));
    },
  );

  router.patch(
    '/:id',
    auth,
    requirePermission('bank.account:update'),
    validate({ params: crudIdParamsSchema, body: patchBankTransactionBodySchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const body = req.body as PatchBankTransactionInput;
      const updated = await updateBankTransaction(currentUser(req).tenantId, params.id, body);
      await auditFromRequest(req, {
        action: 'bank.transaction.update',
        entityType: 'bank.transaction',
        entityId: updated.id,
        newValue: updated,
      });
      res.status(200).json(successResponse(req.requestId, updated));
    },
  );

  return router;
}

/**
 * Conciliaciones: 4 rutas a mano (sin `archived` ni máquina: las líneas se
 * corrigen reemplazándolas en el PATCH, re-validadas). Permiso propio
 * `reconciliation:*`.
 */
function createReconciliationsRouter(deps: TreasuryRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  router.get(
    '/',
    auth,
    requirePermission('reconciliation:read'),
    validate({ query: reconciliationListQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as ReconciliationListQuery;
      const result = await listReconciliations(currentUser(req).tenantId, query);
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
    requirePermission('reconciliation:read'),
    validate({ params: crudIdParamsSchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const recon = await getReconciliation(currentUser(req).tenantId, params.id);
      res.status(200).json(successResponse(req.requestId, recon));
    },
  );

  router.post(
    '/',
    auth,
    requirePermission('reconciliation:create'),
    validate({ body: createReconciliationBodySchema }),
    async (req, res) => {
      const body = req.body as CreateReconciliationInput;
      const recon = await createReconciliation(currentUser(req).tenantId, body);
      await auditFromRequest(req, {
        action: 'reconciliation.create',
        entityType: 'reconciliation',
        entityId: recon.id,
        newValue: recon,
        reason: `lines:${String(recon.lines.length)}`,
      });
      res.status(201).json(successResponse(req.requestId, recon));
    },
  );

  router.patch(
    '/:id',
    auth,
    requirePermission('reconciliation:update'),
    validate({ params: crudIdParamsSchema, body: patchReconciliationBodySchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const body = req.body as PatchReconciliationInput;
      const updated = await updateReconciliation(currentUser(req).tenantId, params.id, body);
      await auditFromRequest(req, {
        action: 'reconciliation.update',
        entityType: 'reconciliation',
        entityId: updated.id,
        newValue: updated,
        reason: body.lines === undefined ? undefined : `lines:${String(body.lines.length)}`,
      });
      res.status(200).json(successResponse(req.requestId, updated));
    },
  );

  return router;
}

/** Los 6 montajes del módulo, listos para la composition root. */
export function createTreasuryRouters(
  deps: TreasuryRouterDeps,
): readonly { path: string; router: Router }[] {
  return [
    // Cuentas: CRUD + extracto sobre el MISMO path (el orden importa).
    { path: TREASURY_ROUTE_PATHS.accounts, router: createCrudRouter(deps, accountSpec()) },
    { path: TREASURY_ROUTE_PATHS.accounts, router: createMovementsRouter(deps) },
    { path: TREASURY_ROUTE_PATHS.payments, router: createCrudRouter(deps, paymentSpec()) },
    { path: TREASURY_ROUTE_PATHS.receipts, router: createCrudRouter(deps, receiptSpec()) },
    { path: TREASURY_ROUTE_PATHS.bankTransactions, router: createBankTransactionsRouter(deps) },
    { path: TREASURY_ROUTE_PATHS.reconciliations, router: createReconciliationsRouter(deps) },
  ];
}

/** Re-export para la matriz de permisos (permisos usados por recurso). */
export type TreasuryPermission = Extract<
  Permission,
  `bank.account:${string}` | `payment:${string}` | `receipt:${string}` | `reconciliation:${string}`
>;
