import { roundMoney } from '../../../core/domain/line-totals.js';
import {
  REPORT_CATALOG,
  REPORT_INVOICE_STATUSES,
  type CashFlowReport,
  type CurrencyTotals,
  type CrmReport,
  type InventoryReport,
  type LowStockItem,
  type PurchasesReport,
  type ReportCatalogItem,
  type ReportGroupBy,
  type ReportInvoiceStatus,
  type SalesReport,
} from '../domain/entities/report.js';
import { REPORT_TOP_N, periodFormat, roundRate, utcRange } from '../domain/rules/report-rules.js';
import * as reportRepo from '../infrastructure/repositories/report-repository.js';
import type { SeriesAggRow, TopAggRow } from '../infrastructure/repositories/report-repository.js';

/**
 * Servicio de reportes (FASE 15): agrega EN VIVO con los read models del
 * módulo (sin jobs/queue/read models precalculados — desviación PARTIAL
 * documentada). Multi-moneda SIN FX: los agregados siempre agrupan
 * `period + currency` y las tasas redondean a 4 decimales.
 */

export interface InvoiceReportInput {
  readonly from: string;
  readonly to: string;
  readonly groupBy: ReportGroupBy;
  readonly status?: ReportInvoiceStatus | undefined;
}

export interface DatedReportInput {
  readonly from: string;
  readonly to: string;
  readonly groupBy: ReportGroupBy;
}

export interface CrmReportInput {
  readonly from: string;
  readonly to: string;
}

export interface LowStockPage {
  readonly items: readonly LowStockItem[];
  readonly total: number;
}

export function listReportCatalog(): readonly ReportCatalogItem[] {
  return REPORT_CATALOG;
}

function statusesOf(status: ReportInvoiceStatus | undefined): readonly ReportInvoiceStatus[] {
  return status !== undefined ? [status] : REPORT_INVOICE_STATUSES;
}

function compareCurrency(
  a: { readonly currency: string },
  b: { readonly currency: string },
): number {
  if (a.currency === b.currency) {
    return 0;
  }
  return a.currency < b.currency ? -1 : 1;
}

/** Suma las filas de serie por moneda (nunca mezcla divisas). */
function foldCurrencyTotals(
  rows: readonly {
    readonly currency: string;
    readonly count: number;
    readonly subtotal: number;
    readonly tax: number;
    readonly total: number;
  }[],
): readonly CurrencyTotals[] {
  const acc = new Map<string, { count: number; subtotal: number; tax: number; total: number }>();
  for (const row of rows) {
    const current = acc.get(row.currency) ?? { count: 0, subtotal: 0, tax: 0, total: 0 };
    current.count += row.count;
    current.subtotal += row.subtotal;
    current.tax += row.tax;
    current.total += row.total;
    acc.set(row.currency, current);
  }
  return [...acc.entries()]
    .map(([currency, value]) => ({
      currency,
      count: value.count,
      subtotal: roundMoney(value.subtotal),
      tax: roundMoney(value.tax),
      total: roundMoney(value.total),
    }))
    .sort(compareCurrency);
}

/**
 * Top N POR MONEDA: el repositorio devuelve todo ordenado
 * `currency` asc / `total` desc y aquí se corta en `REPORT_TOP_N` — el
 * ranking jamás compara EUR con USD (sin FX).
 */
function topByCurrency(rows: readonly TopAggRow[]): SalesReport['topCustomers'] {
  const emitted = new Map<string, number>();
  const out: SalesReport['topCustomers'][number][] = [];
  for (const row of rows) {
    const count = emitted.get(row.currency) ?? 0;
    if (count >= REPORT_TOP_N) {
      continue;
    }
    emitted.set(row.currency, count + 1);
    out.push(row);
  }
  return out;
}

function roundSeries(rows: readonly SeriesAggRow[]): SalesReport['series'] {
  return rows.map((row) => ({
    period: row.period,
    currency: row.currency,
    count: row.count,
    subtotal: roundMoney(row.subtotal),
    tax: roundMoney(row.tax),
    total: roundMoney(row.total),
  }));
}

export async function getSalesReport(
  tenantId: string,
  input: InvoiceReportInput,
): Promise<SalesReport> {
  const range = utcRange(input.from, input.to);
  const statuses = statusesOf(input.status);
  const dateFormat = periodFormat(input.groupBy);
  const [series, top] = await Promise.all([
    reportRepo.aggregateSalesSeries(tenantId, range, dateFormat, statuses),
    reportRepo.aggregateTopCustomers(tenantId, range, statuses),
  ]);
  return {
    report: 'sales',
    from: input.from,
    to: input.to,
    groupBy: input.groupBy,
    series: roundSeries(series),
    totals: foldCurrencyTotals(series),
    topCustomers: topByCurrency(top),
  };
}

export async function getPurchasesReport(
  tenantId: string,
  input: InvoiceReportInput,
): Promise<PurchasesReport> {
  const range = utcRange(input.from, input.to);
  const statuses = statusesOf(input.status);
  const dateFormat = periodFormat(input.groupBy);
  const [series, top] = await Promise.all([
    reportRepo.aggregatePurchasesSeries(tenantId, range, dateFormat, statuses),
    reportRepo.aggregateTopSuppliers(tenantId, range, statuses),
  ]);
  return {
    report: 'purchases',
    from: input.from,
    to: input.to,
    groupBy: input.groupBy,
    series: roundSeries(series),
    totals: foldCurrencyTotals(series),
    topSuppliers: topByCurrency(top),
  };
}

export async function getCashFlowReport(
  tenantId: string,
  input: DatedReportInput,
): Promise<CashFlowReport> {
  const rows = await reportRepo.aggregateCashFlowSeries(
    tenantId,
    utcRange(input.from, input.to),
    periodFormat(input.groupBy),
  );
  const series = rows.map((row) => {
    const inflow = roundMoney(row.inflow);
    const outflow = roundMoney(row.outflow);
    return {
      period: row.period,
      currency: row.currency,
      inflow,
      outflow,
      net: roundMoney(inflow - outflow),
      count: row.count,
    };
  });
  const acc = new Map<string, { inflow: number; outflow: number; count: number }>();
  for (const point of series) {
    const current = acc.get(point.currency) ?? { inflow: 0, outflow: 0, count: 0 };
    current.inflow += point.inflow;
    current.outflow += point.outflow;
    current.count += point.count;
    acc.set(point.currency, current);
  }
  const totals = [...acc.entries()]
    .map(([currency, value]) => ({
      currency,
      inflow: roundMoney(value.inflow),
      outflow: roundMoney(value.outflow),
      net: roundMoney(roundMoney(value.inflow) - roundMoney(value.outflow)),
      count: value.count,
    }))
    .sort(compareCurrency);
  return {
    report: 'cashflow',
    from: input.from,
    to: input.to,
    groupBy: input.groupBy,
    series,
    totals,
  };
}

/** Snapshot actual: sin rango de fechas (costes sin moneda → RISK). */
export async function getInventoryReport(tenantId: string): Promise<InventoryReport> {
  const summary = await reportRepo.aggregateInventory(tenantId);
  if (summary === null) {
    return {
      report: 'inventory',
      products: 0,
      valued: 0,
      unpriced: 0,
      stockValue: 0,
      lowStock: 0,
    };
  }
  return {
    report: 'inventory',
    products: summary.products,
    valued: summary.valued,
    unpriced: summary.unpriced,
    stockValue: roundMoney(summary.stockValue),
    lowStock: summary.lowStock,
  };
}

export async function listLowStock(
  tenantId: string,
  page: number,
  limit: number,
): Promise<LowStockPage> {
  return reportRepo.listLowStock(tenantId, page, limit);
}

/**
 * CRM con tasas: `leadRate = converted/total` y `winRate = won/(won+lost)`
 * (4 dec.; 0 cuando el denominador es 0). Los estados `converted`/`won`/
 * `lost` son valores del módulo CRM — si CRM los renombrara, estas tasas
 * deberían seguirlo (RISK documentado).
 */
export async function getCrmReport(tenantId: string, input: CrmReportInput): Promise<CrmReport> {
  const range = utcRange(input.from, input.to);
  const [leadRows, oppRows] = await Promise.all([
    reportRepo.aggregateLeadStatus(tenantId, range),
    reportRepo.aggregateOpportunityStages(tenantId, range),
  ]);

  const leadTotal = leadRows.reduce((sum, row) => sum + row.count, 0);
  const converted = leadRows.find((row) => row.status === 'converted')?.count ?? 0;

  const oppTotal = oppRows.reduce((sum, row) => sum + row.count, 0);
  const stageAcc = new Map<string, number>();
  for (const row of oppRows) {
    stageAcc.set(row.stage, (stageAcc.get(row.stage) ?? 0) + row.count);
  }
  const byStage = [...stageAcc.entries()].map(([stage, count]) => ({ stage, count }));
  // `oppRows` viene agrupada por stage+currency: plegar por moneda (sin FX).
  const currencyAcc = new Map<string, { amount: number; count: number }>();
  for (const row of oppRows) {
    const acc = currencyAcc.get(row.currency) ?? { amount: 0, count: 0 };
    acc.amount += row.amount;
    acc.count += row.count;
    currencyAcc.set(row.currency, acc);
  }
  const byCurrency = [...currencyAcc.entries()]
    .map(([currency, acc]) => ({
      currency,
      amount: roundMoney(acc.amount),
      count: acc.count,
    }))
    .sort(compareCurrency);
  const won = stageAcc.get('won') ?? 0;
  const lost = stageAcc.get('lost') ?? 0;

  return {
    report: 'crm',
    from: input.from,
    to: input.to,
    leads: {
      total: leadTotal,
      byStatus: leadRows.map((row) => ({ status: row.status, count: row.count })),
      leadRate: roundRate(leadTotal > 0 ? converted / leadTotal : 0),
    },
    opportunities: {
      total: oppTotal,
      byStage,
      byCurrency,
      winRate: roundRate(won + lost > 0 ? won / (won + lost) : 0),
    },
  };
}
