import type { Permission } from '@erp/permissions';
import type { Router } from 'express';
import type {
  CrudListQueryBase,
  CrudPatchBase,
  CrudResourceSpec,
  CrudRouterDeps,
} from '../../../../core/http/crud-router.js';
import { createCrudRouter } from '../../../../core/http/crud-router.js';
import {
  PURCHASE_KINDS,
  type PublicPurchaseDocument,
  type PurchaseKind,
} from '../../domain/entities/purchase-document.js';
import type { PublicSupplier } from '../../domain/entities/supplier.js';
import {
  archivePurchase,
  createPurchase,
  getPurchase,
  listPurchases,
  updatePurchase,
  type CreatePurchaseInput,
  type PatchPurchaseInput,
  type PurchaseListQuery,
} from '../../application/purchase-service.js';
import {
  archiveSupplier,
  createSupplier,
  getSupplier,
  listSuppliers,
  updateSupplier,
  type CreateSupplierInput,
  type PatchSupplierInput,
  type SupplierListQuery,
} from '../../application/supplier-service.js';
import {
  createPurchaseBodySchema,
  createSupplierBodySchema,
  patchPurchaseBodySchema,
  patchSupplierBodySchema,
  purchaseListQuerySchema,
  supplierListQuerySchema,
} from '../validators/purchase-validators.js';

export type PurchasingRouterDeps = CrudRouterDeps;

/**
 * Rutas de API por tipo (kebab-case, plural — convenciones §1), bajo
 * `/api/v1/purchasing/…`. El maestro de proveedores vive en `/suppliers`
 * (simetría con `/customers`: datos maestros en la raíz).
 */
export const PURCHASE_ROUTE_PATHS: Record<PurchaseKind, string> = {
  'purchase.request': 'requests',
  'purchase.order': 'orders',
  'goods.receipt': 'receipts',
  'supplier.invoice': 'invoices',
  'purchase.return': 'returns',
};

/** Permisos literales por tipo (el catálogo es la fuente de verdad). */
const READ_PERMISSIONS: Record<PurchaseKind, Permission> = {
  'purchase.request': 'purchase.request:read',
  'purchase.order': 'purchase.order:read',
  'goods.receipt': 'goods.receipt:read',
  'supplier.invoice': 'supplier.invoice:read',
  'purchase.return': 'purchase.return:read',
};
const CREATE_PERMISSIONS: Record<PurchaseKind, Permission> = {
  'purchase.request': 'purchase.request:create',
  'purchase.order': 'purchase.order:create',
  'goods.receipt': 'goods.receipt:create',
  'supplier.invoice': 'supplier.invoice:create',
  'purchase.return': 'purchase.return:create',
};
const UPDATE_PERMISSIONS: Record<PurchaseKind, Permission> = {
  'purchase.request': 'purchase.request:update',
  'purchase.order': 'purchase.order:update',
  'goods.receipt': 'goods.receipt:update',
  'supplier.invoice': 'supplier.invoice:update',
  'purchase.return': 'purchase.return:update',
};
/**
 * `goods.receipt` NO tiene `:delete` en el catálogo: sus recepciones se
 * archivan con `PATCH {archived}` (`goods.receipt:update`) y NO se publica la
 * ruta DELETE (peticiones → 404).
 */
const DELETE_PERMISSIONS: Record<PurchaseKind, Permission | undefined> = {
  'purchase.request': 'purchase.request:delete',
  'purchase.order': 'purchase.order:delete',
  'goods.receipt': undefined,
  'supplier.invoice': 'supplier.invoice:delete',
  'purchase.return': 'purchase.return:delete',
};

function purchaseSpec(
  kind: PurchaseKind,
): CrudResourceSpec<
  PublicPurchaseDocument,
  CreatePurchaseInput,
  PatchPurchaseInput & CrudPatchBase,
  PurchaseListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: READ_PERMISSIONS[kind],
      create: CREATE_PERMISSIONS[kind],
      update: UPDATE_PERMISSIONS[kind],
      delete: DELETE_PERMISSIONS[kind],
    },
    entity: kind,
    createSchema: createPurchaseBodySchema(kind),
    patchSchema: patchPurchaseBodySchema(kind),
    listQuerySchema: purchaseListQuerySchema(kind),
    handlers: {
      create: (tenantId, body) => createPurchase(tenantId, kind, body),
      list: (tenantId, query) => listPurchases(tenantId, kind, query),
      get: (tenantId, id) => getPurchase(tenantId, kind, id),
      update: (tenantId, id, patch) => updatePurchase(tenantId, kind, id, patch),
      archive: (tenantId, id) => archivePurchase(tenantId, kind, id),
    },
  };
}

function supplierSpec(): CrudResourceSpec<
  PublicSupplier,
  CreateSupplierInput,
  PatchSupplierInput & CrudPatchBase,
  SupplierListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'supplier:read',
      create: 'supplier:create',
      update: 'supplier:update',
      delete: 'supplier:delete',
    },
    entity: 'supplier',
    createSchema: createSupplierBodySchema,
    patchSchema: patchSupplierBodySchema,
    listQuerySchema: supplierListQuerySchema,
    handlers: {
      create: (tenantId, body) => createSupplier(tenantId, body),
      list: (tenantId, query) => listSuppliers(tenantId, query),
      get: (tenantId, id) => getSupplier(tenantId, id),
      update: (tenantId, id, patch) => updateSupplier(tenantId, id, patch),
      archive: (tenantId, id) => archiveSupplier(tenantId, id),
    },
  };
}

/**
 * CRUD de compras sobre la fábrica de core (autorización por tipo, denegación
 * por defecto; auditoría de cada mutación). DELETE = soft-delete (`archived`),
 * salvo receipts (sin permiso `:delete` → solo `PATCH {archived}`).
 */
export function createPurchasingRouters(
  deps: PurchasingRouterDeps,
): readonly { path: string; router: Router }[] {
  return [
    { path: '/api/v1/suppliers', router: createCrudRouter(deps, supplierSpec()) },
    ...PURCHASE_KINDS.map((kind) => ({
      path: `/api/v1/purchasing/${PURCHASE_ROUTE_PATHS[kind]}`,
      router: createCrudRouter(deps, purchaseSpec(kind)),
    })),
  ];
}
