/**
 * Superficie pública del módulo Manufacturing (FASE 16).
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 */
export {
  createManufacturingRouters,
  MANUFACTURING_ROUTE_PATHS,
  type ManufacturingRouterDeps,
} from './presentation/routes/manufacturing-routes.js';
export { archiveBom, createBom, getBom, listBoms, updateBom } from './application/bom-service.js';
export {
  archiveProductionOrder,
  createProductionOrder,
  getProductionOrder,
  listProductionOrders,
  updateProductionOrder,
} from './application/production-order-service.js';
export {
  PRODUCTION_PREFIX,
  PRODUCTION_STATUSES,
  toPublicProductionOrder,
  type ProductionOrder,
  type ProductionStatus,
  type PublicProductionOrder,
} from './domain/entities/production-order.js';
export { toPublicBom, type Bom, type BomLine, type PublicBom } from './domain/entities/bom.js';
export {
  PRODUCTION_TRANSITIONS,
  canProductionTransition,
  computeComponentRequirements,
  normalizeBomCode,
  roundQuantity,
  validateComponentLines,
} from './domain/rules/manufacturing-rules.js';
