/**
 * Superficie pública del módulo reporting (FASE 15).
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 */
export {
  REPORT_ROUTE_PATHS,
  createReportingRouter,
  createReportingRouters,
  type ReportingRouterDeps,
} from './presentation/routes/report-routes.js';
export type {
  CashFlowReport,
  CrmReport,
  InventoryReport,
  LowStockItem,
  PurchasesReport,
  ReportCatalogItem,
  ReportExportPayload,
  ReportKey,
  SalesReport,
} from './domain/entities/report.js';
