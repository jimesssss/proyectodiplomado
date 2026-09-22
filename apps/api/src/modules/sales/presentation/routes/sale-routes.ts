import type { Permission } from '@erp/permissions';
import type { RequestHandler, Router } from 'express';
import { auditFromRequest } from '../../../../core/audit/audit.js';
import { requireAuth } from '../../../../core/auth/middleware.js';
import { requirePermission } from '../../../../core/auth/require-permission.js';
import { successResponse } from '../../../../core/http/envelope.js';
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
import {
  SALE_KINDS,
  toPublicSaleDocument,
  type PublicSaleDocument,
  type SaleKind,
} from '../../domain/entities/sale-document.js';
import {
  approveQuote,
  archiveSale,
  createSale,
  getSale,
  listSales,
  updateSale,
  type CreateSaleInput,
  type PatchSaleInput,
  type SaleListQuery,
} from '../../application/sale-service.js';
import {
  createSaleBodySchema,
  patchSaleBodySchema,
  saleListQuerySchema,
} from '../validators/sale-validators.js';

export type SalesRouterDeps = CrudRouterDeps;

/** Rutas de API por tipo (kebab-case, plural — convenciones §1). */
export const SALE_ROUTE_PATHS: Record<SaleKind, string> = {
  'sales.quote': 'quotes',
  'sales.order': 'orders',
  'sales.delivery': 'deliveries',
  'sales.invoice': 'invoices',
  'sales.return': 'returns',
};

/**
 * CRUD de documentos de venta sobre la fábrica de core (autorización
 * `<tipo>:read|create|update|delete`, denegación por defecto; auditoría de
 * cada mutación). DELETE = soft-delete (`archived: true`). La cotización
 * añade `POST /:id/approve` con permiso PROPIO `sales.quote:approve` (la
 * aprobación nunca sale de un PATCH genérico).
 */
export function createSalesRouter(deps: SalesRouterDeps, kind: SaleKind): Router {
  const spec: CrudResourceSpec<
    PublicSaleDocument,
    CreateSaleInput,
    PatchSaleInput & CrudPatchBase,
    SaleListQuery & CrudListQueryBase
  > = {
    permissions: {
      read: `${kind}:read` as Permission,
      create: `${kind}:create` as Permission,
      update: `${kind}:update` as Permission,
      delete: `${kind}:delete` as Permission,
    },
    entity: kind,
    createSchema: createSaleBodySchema(kind),
    patchSchema: patchSaleBodySchema(kind),
    listQuerySchema: saleListQuerySchema(kind),
    handlers: {
      create: (tenantId, body) => createSale(tenantId, kind, body),
      list: (tenantId, query) => listSales(tenantId, kind, query),
      get: (tenantId, id) => getSale(tenantId, kind, id),
      update: (tenantId, id, patch) => updateSale(tenantId, kind, id, patch),
      archive: (tenantId, id) => archiveSale(tenantId, kind, id),
    },
  };

  const router = createCrudRouter(deps, spec);

  if (kind === 'sales.quote') {
    const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);
    router.post(
      '/:id/approve',
      auth,
      requirePermission('sales.quote:approve'),
      validate({ params: crudIdParamsSchema }),
      async (req, res) => {
        const params = req.params as { id: string };
        const user = currentUser(req);
        const approved = await approveQuote(user.tenantId, params.id, user.userId);
        await auditFromRequest(req, {
          action: 'sales.quote.approve',
          entityType: 'sales.quote',
          entityId: approved.id,
          newValue: approved,
          reason: 'status:approved',
        });
        res.status(200).json(successResponse(req.requestId, approved));
      },
    );
  }

  return router;
}

/** Montajes del módulo: los 5 tipos de documento, listos para la composition root. */
export function createSalesRouters(
  deps: SalesRouterDeps,
): readonly { path: string; router: Router }[] {
  return SALE_KINDS.map((kind) => ({
    path: `/api/v1/sales/${SALE_ROUTE_PATHS[kind]}`,
    router: createSalesRouter(deps, kind),
  }));
}

export { toPublicSaleDocument };
