/**
 * Superficie pública del módulo Purchasing (FASE 10).
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 */
export {
  createPurchasingRouters,
  PURCHASE_ROUTE_PATHS,
  type PurchasingRouterDeps,
} from './presentation/routes/purchase-routes.js';
export {
  archivePurchase,
  createPurchase,
  getPurchase,
  listPurchases,
  updatePurchase,
} from './application/purchase-service.js';
export {
  archiveSupplier,
  createSupplier,
  getSupplier,
  listSuppliers,
  updateSupplier,
} from './application/supplier-service.js';
export {
  PURCHASE_KINDS,
  PURCHASE_PREFIX,
  PURCHASE_REFS,
  PURCHASE_REQUIRES_SUPPLIER,
  PURCHASE_STATUSES,
  toPublicPurchaseDocument,
  type PublicPurchaseDocument,
  type PurchaseDocument,
  type PurchaseKind,
  type PurchaseLine,
  type PurchaseStatus,
} from './domain/entities/purchase-document.js';
export {
  toPublicSupplier,
  type PublicSupplier,
  type Supplier,
  type SupplierAddress,
} from './domain/entities/supplier.js';
export {
  PURCHASE_TRANSITIONS,
  canTransition,
  computeLine,
  computeTotals,
  normalizeCode as normalizeSupplierCode,
  normalizeLines,
  type PurchaseLineInput,
} from './domain/rules/purchase-rules.js';
