/**
 * Superficie pública del módulo Inventory (FASE 11).
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 * Purchasing usa `postReceiptToStock` al pasar una recepción a `posted`.
 */
export {
  createInventoryRouters,
  INVENTORY_ROUTE_PATHS,
  type InventoryRouterDeps,
} from './presentation/routes/inventory-routes.js';
export {
  archiveProduct,
  assertProductActive,
  createProduct,
  getProduct,
  listProducts,
  updateProduct,
} from './application/product-service.js';
export {
  createManualMovement,
  getMovement,
  listBalances,
  listMovements,
  postReceiptToStock,
  recordMovement,
  assertWarehouseActive,
  type ReceiptPostingInput,
} from './application/stock-service.js';
export {
  archiveTransfer,
  createTransfer,
  getTransfer,
  listTransfers,
  updateTransfer,
} from './application/transfer-service.js';
export {
  approveCount,
  archiveCount,
  createCount,
  getCount,
  listCounts,
  updateCount,
} from './application/count-service.js';
export { toPublicProduct, type Product, type PublicProduct } from './domain/entities/product.js';
export {
  MANUAL_MOVEMENT_TYPES,
  MOVEMENT_TYPES,
  toPublicStockBalance,
  toPublicStockMovement,
  type ManualMovementType,
  type MovementType,
  type PublicStockBalance,
  type PublicStockMovement,
} from './domain/entities/stock.js';
export {
  COUNT_STATUSES,
  TRANSFER_STATUSES,
  toPublicInventoryCount,
  toPublicStockTransfer,
  type CountStatus,
  type InventoryCount,
  type PublicInventoryCount,
  type PublicStockTransfer,
  type StockTransfer,
  type TransferStatus,
} from './domain/entities/stock-documents.js';
export {
  COUNT_TRANSITIONS,
  TRANSFER_TRANSITIONS,
  canCountTransition,
  canTransferTransition,
} from './domain/rules/inventory-rules.js';
