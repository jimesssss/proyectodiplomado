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
import type { PublicProduct } from '../../domain/entities/product.js';
import type {
  PublicInventoryCount,
  PublicStockTransfer,
} from '../../domain/entities/stock-documents.js';
import {
  approveCount,
  createCount,
  getCount,
  listCounts,
  updateCount,
  archiveCount,
  type CountListQuery,
  type CreateCountInput,
  type PatchCountInput,
} from '../../application/count-service.js';
import {
  archiveProduct,
  createProduct,
  getProduct,
  listProducts,
  updateProduct,
  type CreateProductInput,
  type PatchProductInput,
  type ProductListQuery,
} from '../../application/product-service.js';
import {
  createManualMovement,
  getMovement,
  listBalances,
  listMovements,
  type BalanceListQuery,
  type CreateManualMovementInput,
  type MovementListQuery,
} from '../../application/stock-service.js';
import {
  archiveTransfer,
  createTransfer,
  getTransfer,
  listTransfers,
  updateTransfer,
  type CreateTransferInput,
  type PatchTransferInput,
  type TransferListQuery,
} from '../../application/transfer-service.js';
import {
  balanceListQuerySchema,
  countListQuerySchema,
  createCountBodySchema,
  createMovementBodySchema,
  createProductBodySchema,
  createTransferBodySchema,
  movementListQuerySchema,
  patchCountBodySchema,
  patchProductBodySchema,
  patchTransferBodySchema,
  productListQuerySchema,
  transferListQuerySchema,
} from '../validators/inventory-validators.js';

export type InventoryRouterDeps = CrudRouterDeps;

/**
 * Montajes del módulo bajo `/api/v1/inventory/…` (convenciones §4):
 * products (CRUD completo), stock (solo lectura del saldo proyectado),
 * movements (ledger append-only: GET/POST, SIN PATCH/DELETE), transfers y
 * counts (sin DELETE: el catálogo no define `:delete`; archivar via
 * `PATCH {archived}`). El conteo añade `POST /:id/approve` con el permiso
 * PROPIO `stock.count:approve` (patrón de `sales.quote:approve`).
 */
export const INVENTORY_ROUTE_PATHS = {
  products: '/api/v1/inventory/products',
  stock: '/api/v1/inventory/stock',
  movements: '/api/v1/inventory/movements',
  transfers: '/api/v1/inventory/transfers',
  counts: '/api/v1/inventory/counts',
} as const;

function productSpec(): CrudResourceSpec<
  PublicProduct,
  CreateProductInput,
  PatchProductInput & CrudPatchBase,
  ProductListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'product:read',
      create: 'product:create',
      update: 'product:update',
      delete: 'product:delete',
    },
    entity: 'product',
    createSchema: createProductBodySchema,
    patchSchema: patchProductBodySchema,
    listQuerySchema: productListQuerySchema,
    handlers: {
      create: (tenantId, body) => createProduct(tenantId, body),
      list: (tenantId, query) => listProducts(tenantId, query),
      get: (tenantId, id) => getProduct(tenantId, id),
      update: (tenantId, id, patch) => updateProduct(tenantId, id, patch),
      archive: (tenantId, id) => archiveProduct(tenantId, id),
    },
  };
}

/** `GET /inventory/stock` — solo lectura: no hay escritura directa de saldos. */
function createStockRouter(deps: InventoryRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);
  router.get(
    '/',
    auth,
    requirePermission('stock.movement:read'),
    validate({ query: balanceListQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as BalanceListQuery;
      const result = await listBalances(currentUser(req).tenantId, query);
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
 * `GET/POST /inventory/movements` + `GET /:id` — el ledger es append-only:
 * la fábrica CRUD NO se usa aquí porque `stock.movement` no tiene ni
 * `:update` ni `:delete` en el catálogo (no se publican esas rutas).
 */
function createMovementsRouter(deps: InventoryRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  router.get(
    '/',
    auth,
    requirePermission('stock.movement:read'),
    validate({ query: movementListQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as MovementListQuery;
      const result = await listMovements(currentUser(req).tenantId, query);
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
    requirePermission('stock.movement:read'),
    validate({ params: crudIdParamsSchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const movement = await getMovement(currentUser(req).tenantId, params.id);
      res.status(200).json(successResponse(req.requestId, movement));
    },
  );

  router.post(
    '/',
    auth,
    requirePermission('stock.movement:create'),
    validate({ body: createMovementBodySchema }),
    async (req, res) => {
      const body = req.body as CreateManualMovementInput;
      const movement = await createManualMovement(currentUser(req).tenantId, body);
      await auditFromRequest(req, {
        action: 'stock.movement.create',
        entityType: 'stock.movement',
        entityId: movement.id,
        newValue: movement,
        reason: `quantity:${String(movement.qty)}`,
      });
      res.status(201).json(successResponse(req.requestId, movement));
    },
  );

  return router;
}

function transferSpec(): CrudResourceSpec<
  PublicStockTransfer,
  CreateTransferInput,
  PatchTransferInput & CrudPatchBase,
  TransferListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'stock.transfer:read',
      create: 'stock.transfer:create',
      update: 'stock.transfer:update',
      // Sin `stock.transfer:delete` en el catálogo → DELETE no publicado.
      delete: undefined,
    },
    entity: 'stock.transfer',
    createSchema: createTransferBodySchema,
    patchSchema: patchTransferBodySchema,
    listQuerySchema: transferListQuerySchema,
    handlers: {
      create: (tenantId, body) => createTransfer(tenantId, body),
      list: (tenantId, query) => listTransfers(tenantId, query),
      get: (tenantId, id) => getTransfer(tenantId, id),
      update: (tenantId, id, patch) => updateTransfer(tenantId, id, patch),
      archive: (tenantId, id) => archiveTransfer(tenantId, id),
    },
  };
}

function countSpec(): CrudResourceSpec<
  PublicInventoryCount,
  CreateCountInput,
  PatchCountInput & CrudPatchBase,
  CountListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'stock.count:read',
      create: 'stock.count:create',
      update: 'stock.count:update',
      // Sin `stock.count:delete` en el catálogo → DELETE no publicado.
      delete: undefined,
    },
    entity: 'stock.count',
    createSchema: createCountBodySchema,
    patchSchema: patchCountBodySchema,
    listQuerySchema: countListQuerySchema,
    handlers: {
      create: (tenantId, body) => createCount(tenantId, body),
      list: (tenantId, query) => listCounts(tenantId, query),
      get: (tenantId, id) => getCount(tenantId, id),
      update: (tenantId, id, patch) => updateCount(tenantId, id, patch),
      archive: (tenantId, id) => archiveCount(tenantId, id),
    },
  };
}

/** CRUD + `POST /:id/approve` (permiso propio `stock.count:approve`). */
function createCountsRouter(deps: InventoryRouterDeps): Router {
  const router = createCrudRouter(deps, countSpec());
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);
  router.post(
    '/:id/approve',
    auth,
    requirePermission('stock.count:approve'),
    validate({ params: crudIdParamsSchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const approved = await approveCount(currentUser(req).tenantId, params.id);
      await auditFromRequest(req, {
        action: 'stock.count.approve',
        entityType: 'stock.count',
        entityId: approved.id,
        newValue: approved,
        reason: 'status:approved',
      });
      res.status(200).json(successResponse(req.requestId, approved));
    },
  );
  return router;
}

/** Los 5 montajes del módulo, listos para la composition root. */
export function createInventoryRouters(
  deps: InventoryRouterDeps,
): readonly { path: string; router: Router }[] {
  return [
    { path: INVENTORY_ROUTE_PATHS.products, router: createCrudRouter(deps, productSpec()) },
    { path: INVENTORY_ROUTE_PATHS.stock, router: createStockRouter(deps) },
    { path: INVENTORY_ROUTE_PATHS.movements, router: createMovementsRouter(deps) },
    { path: INVENTORY_ROUTE_PATHS.transfers, router: createCrudRouter(deps, transferSpec()) },
    { path: INVENTORY_ROUTE_PATHS.counts, router: createCountsRouter(deps) },
  ];
}

/** Re-export para la matriz de permisos (permisos usados por recurso). */
export type InventoryPermission = Extract<
  Permission,
  | `product:${string}`
  | `stock.movement:${string}`
  | `stock.transfer:${string}`
  | `stock.count:${string}`
>;
