import type { Router } from 'express';
import {
  createCrudRouter,
  type CrudListQueryBase,
  type CrudPatchBase,
  type CrudResourceSpec,
  type CrudRouterDeps,
} from '../../../../core/http/crud-router.js';
import {
  archiveBom,
  createBom,
  getBom,
  listBoms,
  updateBom,
  type BomListQuery,
  type CreateBomInput,
  type PatchBomInput,
} from '../../application/bom-service.js';
import {
  archiveProductionOrder,
  createProductionOrder,
  getProductionOrder,
  listProductionOrders,
  updateProductionOrder,
  type CreateProductionOrderInput,
  type PatchProductionOrderInput,
  type ProductionOrderListQuery,
} from '../../application/production-order-service.js';
import type { PublicBom } from '../../domain/entities/bom.js';
import type { PublicProductionOrder } from '../../domain/entities/production-order.js';
import {
  bomListQuerySchema,
  createBomBodySchema,
  createOrderBodySchema,
  orderListQuerySchema,
  patchBomBodySchema,
  patchOrderBodySchema,
} from '../validators/manufacturing-validators.js';

export type ManufacturingRouterDeps = CrudRouterDeps;

/**
 * Montajes del módulo bajo `/api/v1/manufacturing/…` (convenciones §4 fila
 * 16): boms (CRUD sin DELETE — el catálogo no define `bom:delete`; archivar
 * vía `PATCH {archived}`) y orders (sin DELETE — la máquina de estados
 * draft→in_progress→completed/cancelled va por `PATCH {status}` con
 * `production.order:update`, patrón de recepciones/transferencias; el
 * `completed` dispara el pre-chequeo y los movimientos de stock).
 */
export const MANUFACTURING_ROUTE_PATHS = {
  boms: '/api/v1/manufacturing/boms',
  orders: '/api/v1/manufacturing/orders',
} as const;

function bomSpec(): CrudResourceSpec<
  PublicBom,
  CreateBomInput,
  PatchBomInput & CrudPatchBase,
  BomListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'bom:read',
      create: 'bom:create',
      update: 'bom:update',
      // Sin `bom:delete` en el catálogo → ruta DELETE no publicada (404).
    },
    entity: 'bom',
    createSchema: createBomBodySchema,
    patchSchema: patchBomBodySchema,
    listQuerySchema: bomListQuerySchema,
    handlers: {
      create: (tenantId, body) => createBom(tenantId, body),
      list: (tenantId, query) => listBoms(tenantId, query),
      get: (tenantId, id) => getBom(tenantId, id),
      update: (tenantId, id, patch) => updateBom(tenantId, id, patch),
      archive: (tenantId, id) => archiveBom(tenantId, id),
    },
  };
}

function orderSpec(): CrudResourceSpec<
  PublicProductionOrder,
  CreateProductionOrderInput,
  PatchProductionOrderInput & CrudPatchBase,
  ProductionOrderListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'production.order:read',
      create: 'production.order:create',
      update: 'production.order:update',
      // Sin `production.order:delete` en el catálogo → 404 (se cancela, no se borra).
    },
    entity: 'production.order',
    createSchema: createOrderBodySchema,
    patchSchema: patchOrderBodySchema,
    listQuerySchema: orderListQuerySchema,
    handlers: {
      create: (tenantId, body) => createProductionOrder(tenantId, body),
      list: (tenantId, query) => listProductionOrders(tenantId, query),
      get: (tenantId, id) => getProductionOrder(tenantId, id),
      update: (tenantId, id, patch) => updateProductionOrder(tenantId, id, patch),
      archive: (tenantId, id) => archiveProductionOrder(tenantId, id),
    },
  };
}

/** Los 2 montajes del módulo, listos para la composition root. */
export function createManufacturingRouters(
  deps: ManufacturingRouterDeps,
): readonly { path: string; router: Router }[] {
  return [
    { path: MANUFACTURING_ROUTE_PATHS.boms, router: createCrudRouter(deps, bomSpec()) },
    { path: MANUFACTURING_ROUTE_PATHS.orders, router: createCrudRouter(deps, orderSpec()) },
  ];
}
