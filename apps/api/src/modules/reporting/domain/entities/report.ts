import type { Permission } from '@erp/permissions';

/**
 * Dominio Reporting (FASE 15): catálogo estático de reportes, permisos
 * ENCADENADOS (ADR-008 §1 — un reporte aplica los MISMOS permisos
 * subyacentes que su API base: nunca expone datos que la API filtraría) y
 * formas de respuesta. Multi-moneda SIN FX: cada agregado agrupa
 * `period + currency` — jamás se suman USD+EUR (decisión documentada en
 * `docs/api/reports.md`).
 */

/** Claves de reporte: destinos de exportación y endpoints con datos. */
export const REPORT_KEYS = ['sales', 'purchases', 'cashflow', 'inventory', 'crm'] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

/** Claves con rango de fechas (`inventory` es snapshot actual, sin rango). */
export const RANGE_REPORT_KEYS = ['sales', 'purchases', 'cashflow', 'crm'] as const;
export type RangeReportKey = (typeof RANGE_REPORT_KEYS)[number];

export const REPORT_GROUP_BY = ['day', 'month'] as const;
export type ReportGroupBy = (typeof REPORT_GROUP_BY)[number];

/**
 * Estados que cuentan ventas/compras: `draft`/`cancelled` jamás entran y
 * `archived` (soft-delete) se excluye aparte con `archived: {$ne: true}`.
 */
export type ReportInvoiceStatus = 'issued' | 'paid';
export const REPORT_INVOICE_STATUSES: readonly ReportInvoiceStatus[] = ['issued', 'paid'];

/** Ficha del catálogo `GET /reports` (descubrimiento estático, sin datos). */
export interface ReportCatalogItem {
  readonly key: ReportKey;
  readonly name: string;
  /** Parámetros que admite ese reporte (vacío = snapshot sin filtros). */
  readonly params: readonly string[];
}

export const REPORT_CATALOG: readonly ReportCatalogItem[] = [
  { key: 'sales', name: 'Ventas', params: ['from', 'to', 'groupBy', 'status'] },
  { key: 'purchases', name: 'Compras', params: ['from', 'to', 'groupBy', 'status'] },
  { key: 'cashflow', name: 'Flujo de caja', params: ['from', 'to', 'groupBy'] },
  { key: 'inventory', name: 'Inventario', params: [] },
  { key: 'crm', name: 'CRM', params: ['from', 'to'] },
];

/**
 * Permisos subyacentes por reporte: se suman a `report:read` (o
 * `report:export` en el export) — un reporte jamás "filtra menos" que la API
 * que lo alimenta. Para exportar se exigen LOS MISMOS subyacentes que para
 * consultarlo.
 */
export const REPORT_UNDERLYING_PERMISSIONS: Record<ReportKey, readonly Permission[]> = {
  sales: ['sales.invoice:read', 'customer:read'],
  purchases: ['supplier.invoice:read', 'supplier:read'],
  cashflow: ['bank.account:read'],
  inventory: ['product:read', 'stock.movement:read'],
  crm: ['lead:read', 'opportunity:read'],
};

/** Totales por moneda (nunca mezclan divisas). */
export interface CurrencyTotals {
  readonly currency: string;
  readonly count: number;
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
}

/** Punto de serie temporal: una fila por `period + currency`. */
export interface SeriesPoint extends CurrencyTotals {
  readonly period: string;
}

/** Entrada de "top" por moneda (`id` = ObjectId como string). */
export interface TopEntry {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly currency: string;
  readonly total: number;
  readonly count: number;
}

export interface SalesReport {
  readonly report: 'sales';
  readonly from: string;
  readonly to: string;
  readonly groupBy: ReportGroupBy;
  readonly series: readonly SeriesPoint[];
  readonly totals: readonly CurrencyTotals[];
  readonly topCustomers: readonly TopEntry[];
}

export interface PurchasesReport {
  readonly report: 'purchases';
  readonly from: string;
  readonly to: string;
  readonly groupBy: ReportGroupBy;
  readonly series: readonly SeriesPoint[];
  readonly totals: readonly CurrencyTotals[];
  readonly topSuppliers: readonly TopEntry[];
}

export interface CashFlowPoint {
  readonly period: string;
  readonly currency: string;
  readonly inflow: number;
  readonly outflow: number;
  readonly net: number;
  readonly count: number;
}

export interface CashFlowTotals {
  readonly currency: string;
  readonly inflow: number;
  readonly outflow: number;
  readonly net: number;
  readonly count: number;
}

export interface CashFlowReport {
  readonly report: 'cashflow';
  readonly from: string;
  readonly to: string;
  readonly groupBy: ReportGroupBy;
  readonly series: readonly CashFlowPoint[];
  readonly totals: readonly CashFlowTotals[];
}

/** Snapshot actual del catálogo activo (sin rango de fechas). */
export interface InventoryReport {
  readonly report: 'inventory';
  readonly products: number;
  /** Productos CON `cost` (los sin coste no se valorizan). */
  readonly valued: number;
  readonly unpriced: number;
  /** `Σ qty × cost` por producto no archivado (coste sin moneda → RISK). */
  readonly stockValue: number;
  /** Productos no archivados con `minStock` y saldo por debajo. */
  readonly lowStock: number;
}

export interface LowStockItem {
  readonly productId: string;
  readonly code: string;
  readonly name: string;
  readonly unit: string;
  readonly minStock: number;
  readonly qty: number;
  readonly deficit: number;
}

export interface CrmReport {
  readonly report: 'crm';
  readonly from: string;
  readonly to: string;
  readonly leads: {
    readonly total: number;
    readonly byStatus: readonly { readonly status: string; readonly count: number }[];
    /** `converted / total` a 4 decimales (0 si no hay leads). */
    readonly leadRate: number;
  };
  readonly opportunities: {
    readonly total: number;
    readonly byStage: readonly { readonly stage: string; readonly count: number }[];
    readonly byCurrency: readonly {
      readonly currency: string;
      readonly amount: number;
      readonly count: number;
    }[];
    /** `won / (won + lost)` a 4 decimales (0 si ninguna cerró). */
    readonly winRate: number;
  };
}

/** Exportación CSV síncrona devuelta dentro del envelope. */
export interface ReportExportPayload {
  readonly report: ReportKey;
  readonly format: 'csv';
  readonly rowCount: number;
  readonly truncated: boolean;
  readonly warning: string | null;
  readonly csv: string;
}
