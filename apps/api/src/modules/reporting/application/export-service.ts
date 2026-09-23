import {
  REPORT_INVOICE_STATUSES,
  type RangeReportKey,
  type ReportExportPayload,
  type ReportInvoiceStatus,
} from '../domain/entities/report.js';
import {
  EXPORT_MAX_ROWS,
  buildCsv,
  isoDateOnly,
  utcRange,
  type CsvCell,
} from '../domain/rules/report-rules.js';
import * as reportRepo from '../infrastructure/repositories/report-repository.js';

/**
 * Exportación CSV (FASE 15): síncrona DENTRO del envelope (desviación
 * PARTIAL — sin cola/notificación y solo CSV, sin Excel). Mismo filtro que su
 * reporte; `limit` (1..`EXPORT_MAX_ROWS`) se pide con `limit + 1` filas para
 * detectar truncado y avisarlo en `warning`.
 */

export type ExportInput =
  | { readonly key: 'inventory'; readonly limit: number }
  | {
      readonly key: RangeReportKey;
      readonly from: string;
      readonly to: string;
      readonly status?: ReportInvoiceStatus | undefined;
      readonly limit: number;
    };

const text = (value: string): CsvCell => ({ kind: 'text', value });
const num = (value: number): CsvCell => ({ kind: 'number', value });
const optionalNum = (value: number | null): CsvCell => (value === null ? text('') : num(value));
const optionalDate = (value: Date | null): CsvCell =>
  value === null ? text('') : text(isoDateOnly(value));
const timestamp = (value: Date): CsvCell => text(value.toISOString());

function statusesOf(status: ReportInvoiceStatus | undefined): readonly ReportInvoiceStatus[] {
  return status !== undefined ? [status] : REPORT_INVOICE_STATUSES;
}

function buildPayload(
  key: RangeReportKey | 'inventory',
  limit: number,
  headers: readonly string[],
  rows: readonly (readonly CsvCell[])[],
): ReportExportPayload {
  const truncated = rows.length > limit;
  const visible = truncated ? rows.slice(0, limit) : rows;
  return {
    report: key,
    format: 'csv',
    rowCount: visible.length,
    truncated,
    warning: truncated ? `Export truncated at ${limit} rows (max ${EXPORT_MAX_ROWS})` : null,
    csv: buildCsv(headers, visible),
  };
}

const SALES_HEADERS = [
  'number',
  'customer',
  'customerId',
  'issueDate',
  'status',
  'currency',
  'subtotal',
  'tax',
  'total',
] as const;

const PURCHASES_HEADERS = [
  'number',
  'supplier',
  'supplierId',
  'issueDate',
  'status',
  'currency',
  'subtotal',
  'tax',
  'total',
] as const;

const CASH_FLOW_HEADERS = [
  'createdAt',
  'accountId',
  'currency',
  'sourceType',
  'amount',
  'balanceAfter',
  'reason',
] as const;

const INVENTORY_HEADERS = ['code', 'name', 'unit', 'minStock', 'qty', 'cost', 'value'] as const;

const CRM_HEADERS = [
  'name',
  'stage',
  'currency',
  'amount',
  'expectedCloseDate',
  'createdAt',
] as const;

export async function exportReport(
  tenantId: string,
  input: ExportInput,
): Promise<ReportExportPayload> {
  // +1 fila para saber si había más allá del límite (truncado honesto).
  const fetchLimit = input.limit + 1;

  switch (input.key) {
    case 'sales': {
      const range = utcRange(input.from, input.to);
      const rows = await reportRepo.fetchSalesExport(
        tenantId,
        range,
        statusesOf(input.status),
        fetchLimit,
      );
      return buildPayload(
        'sales',
        input.limit,
        SALES_HEADERS,
        rows.map((row) => [
          text(row.number),
          text(row.customer),
          text(row.customerId),
          text(isoDateOnly(row.issueDate)),
          text(row.status),
          text(row.currency),
          num(row.subtotal),
          num(row.tax),
          num(row.total),
        ]),
      );
    }
    case 'purchases': {
      const range = utcRange(input.from, input.to);
      const rows = await reportRepo.fetchPurchasesExport(
        tenantId,
        range,
        statusesOf(input.status),
        fetchLimit,
      );
      return buildPayload(
        'purchases',
        input.limit,
        PURCHASES_HEADERS,
        rows.map((row) => [
          text(row.number),
          text(row.supplier),
          text(row.supplierId),
          text(isoDateOnly(row.issueDate)),
          text(row.status),
          text(row.currency),
          num(row.subtotal),
          num(row.tax),
          num(row.total),
        ]),
      );
    }
    case 'cashflow': {
      const rows = await reportRepo.fetchCashFlowExport(
        tenantId,
        utcRange(input.from, input.to),
        fetchLimit,
      );
      return buildPayload(
        'cashflow',
        input.limit,
        CASH_FLOW_HEADERS,
        rows.map((row) => [
          timestamp(row.createdAt),
          text(row.accountId),
          text(row.currency),
          text(row.sourceType),
          num(row.amount),
          num(row.balanceAfter),
          text(row.reason),
        ]),
      );
    }
    case 'inventory': {
      const rows = await reportRepo.fetchInventoryExport(tenantId, fetchLimit);
      return buildPayload(
        'inventory',
        input.limit,
        INVENTORY_HEADERS,
        rows.map((row) => [
          text(row.code),
          text(row.name),
          text(row.unit),
          optionalNum(row.minStock),
          num(row.qty),
          optionalNum(row.cost),
          optionalNum(row.value),
        ]),
      );
    }
    case 'crm': {
      const rows = await reportRepo.fetchCrmExport(
        tenantId,
        utcRange(input.from, input.to),
        fetchLimit,
      );
      return buildPayload(
        'crm',
        input.limit,
        CRM_HEADERS,
        rows.map((row) => [
          text(row.name),
          text(row.stage),
          text(row.currency),
          num(row.amount),
          optionalDate(row.expectedCloseDate),
          timestamp(row.createdAt),
        ]),
      );
    }
  }
}
