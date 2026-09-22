/**
 * Superficie pública del módulo Sales (FASE 9).
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 */
export {
  createSalesRouter,
  createSalesRouters,
  SALE_ROUTE_PATHS,
  type SalesRouterDeps,
} from './presentation/routes/sale-routes.js';
export {
  approveQuote,
  archiveSale,
  createSale,
  getSale,
  listSales,
  updateSale,
} from './application/sale-service.js';
export {
  SALE_KINDS,
  SALE_PREFIX,
  SALE_REFS,
  SALE_REQUIRES_CUSTOMER,
  SALE_STATUSES,
  toPublicSaleDocument,
  type PublicSaleDocument,
  type SaleDocument,
  type SaleKind,
  type SaleLine,
  type SaleStatus,
} from './domain/entities/sale-document.js';
export {
  SALE_TRANSITIONS,
  canTransition,
  computeLine,
  computeTotals,
  normalizeLines,
  roundMoney,
  type SaleLineInput,
} from './domain/rules/sales-rules.js';
