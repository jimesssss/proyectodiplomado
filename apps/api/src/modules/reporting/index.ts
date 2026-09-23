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
// Superficie consumida por la tool `reports.sales_kpis` de IA (FASE 20):
// la tool exige LOS MISMOS permisos (ADR-008 §1) y valida el rango con las
// MISMAS reglas que `GET /reports/sales`.
export { getSalesReport, type InvoiceReportInput } from './application/report-service.js';
export {
  REPORT_GROUP_BY,
  REPORT_INVOICE_STATUSES,
  REPORT_UNDERLYING_PERMISSIONS,
} from './domain/entities/report.js';
export {
  REPORT_DATE_PATTERN,
  checkDateRange,
  isValidReportDate,
} from './domain/rules/report-rules.js';
export type {
  CashFlowReport,
  CrmReport,
  InventoryReport,
  LowStockItem,
  PurchasesReport,
  ReportCatalogItem,
  ReportExportPayload,
  ReportGroupBy,
  ReportInvoiceStatus,
  ReportKey,
  SalesReport,
} from './domain/entities/report.js';
