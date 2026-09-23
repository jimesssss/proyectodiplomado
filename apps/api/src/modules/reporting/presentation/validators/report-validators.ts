import { z } from 'zod';
import {
  REPORT_GROUP_BY,
  REPORT_INVOICE_STATUSES,
  type ReportGroupBy,
  type ReportInvoiceStatus,
} from '../../domain/entities/report.js';
import {
  EXPORT_MAX_ROWS,
  REPORT_DATE_PATTERN,
  checkDateRange,
  isValidReportDate,
  resolveDateRange,
} from '../../domain/rules/report-rules.js';

/**
 * Validadores de Reporting (FASE 15): `z.strictObject` POR CLAVE — un parámetro
 * desconocido para ese reporte se RECHAZA con 400 (incluye `?tenantId=` y
 * `from/to` sobre el snapshot de inventario o `groupBy` en CRM). Fechas
 * `YYYY-MM-DD` con roundtrip de calendario; los defaults (`to` = hoy,
 * `from` = to − 365d) y los límites (366 días con `day`, 120 meses con
 * `month`) se resuelven POR REQUEST — nunca congelados en el esquema.
 */

const dateField = z
  .string()
  .regex(REPORT_DATE_PATTERN, 'Invalid date (use YYYY-MM-DD)')
  .refine(isValidReportDate, { message: 'Invalid calendar date' });

const groupByField = z.enum(REPORT_GROUP_BY).default('month');

/** El catálogo es la fuente de verdad: solo `issued`/`paid` (nunca borradores). */
const invoiceStatusField = z.enum(
  REPORT_INVOICE_STATUSES as unknown as [ReportInvoiceStatus, ...ReportInvoiceStatus[]],
);

const formatField = z.enum(['csv']).default('csv');
const limitField = z.coerce.number().int().min(1).max(EXPORT_MAX_ROWS).default(EXPORT_MAX_ROWS);
const pageField = z.coerce.number().int().min(1).max(10_000).default(1);
const listLimitField = z.coerce.number().int().min(1).max(100).default(20);

interface RangeInput {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

function resolveOutput(value: RangeInput): { from: string; to: string } {
  const resolved = resolveDateRange(value.from, value.to, new Date());
  return { from: resolved.from, to: resolved.to };
}

function refineResolved(
  value: { readonly from: string; readonly to: string },
  groupBy: ReportGroupBy,
  ctx: z.RefinementCtx,
): void {
  const check = checkDateRange(value.from, value.to, groupBy);
  if (!check.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['from'],
      message: check.message,
    });
  }
}

// --- Reportes con rango ---

export const invoiceReportQuerySchema = z
  .strictObject({
    from: dateField.optional(),
    to: dateField.optional(),
    groupBy: groupByField,
    status: invoiceStatusField.optional(),
  })
  .transform((value) => ({
    ...resolveOutput(value),
    groupBy: value.groupBy,
    status: value.status,
  }))
  .superRefine((value, ctx) => refineResolved(value, value.groupBy, ctx));

export const cashFlowReportQuerySchema = z
  .strictObject({
    from: dateField.optional(),
    to: dateField.optional(),
    groupBy: groupByField,
  })
  .transform((value) => ({ ...resolveOutput(value), groupBy: value.groupBy }))
  .superRefine((value, ctx) => refineResolved(value, value.groupBy, ctx));

export const crmReportQuerySchema = z
  .strictObject({
    from: dateField.optional(),
    to: dateField.optional(),
  })
  .transform(resolveOutput)
  .superRefine((value, ctx) => refineResolved(value, 'month', ctx));

// --- Inventario: snapshot actual SIN parámetros (cualquier query → 400) ---

export const inventoryReportQuerySchema = z.strictObject({});

export const lowStockQuerySchema = z.strictObject({
  page: pageField,
  limit: listLimitField,
});

// --- Exportaciones CSV ---

export const exportInvoiceQuerySchema = z
  .strictObject({
    format: formatField,
    from: dateField.optional(),
    to: dateField.optional(),
    status: invoiceStatusField.optional(),
    limit: limitField,
  })
  .transform((value) => ({
    ...resolveOutput(value),
    format: value.format,
    status: value.status,
    limit: value.limit,
  }))
  .superRefine((value, ctx) => refineResolved(value, 'month', ctx));

export const exportRangeQuerySchema = z
  .strictObject({
    format: formatField,
    from: dateField.optional(),
    to: dateField.optional(),
    limit: limitField,
  })
  .transform((value) => ({
    ...resolveOutput(value),
    format: value.format,
    limit: value.limit,
  }))
  .superRefine((value, ctx) => refineResolved(value, 'month', ctx));

export const exportInventoryQuerySchema = z.strictObject({
  format: formatField,
  limit: limitField,
});

/**
 * Techo de `/:key/export`: `inventory`, `sales` y `purchases` tienen ruta
 * explícita (query estricta propia); aquí solo pasan `cashflow`/`crm` y
 * cualquier otra clave → 400.
 */
export const LOOKUP_EXPORT_KEYS = ['cashflow', 'crm'] as const;
export type LookupExportKey = (typeof LOOKUP_EXPORT_KEYS)[number];

export const exportLookupKeyParamsSchema = z.object({ key: z.enum(LOOKUP_EXPORT_KEYS) });

// --- Tipos de query ya parseados (los handlers casteán `req.query`) ---

export type InvoiceReportQuery = z.infer<typeof invoiceReportQuerySchema>;
export type CashFlowReportQuery = z.infer<typeof cashFlowReportQuerySchema>;
export type CrmReportQuery = z.infer<typeof crmReportQuerySchema>;
export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;
export type ExportInvoiceQuery = z.infer<typeof exportInvoiceQuerySchema>;
export type ExportRangeQuery = z.infer<typeof exportRangeQuerySchema>;
export type ExportInventoryQuery = z.infer<typeof exportInventoryQuerySchema>;
