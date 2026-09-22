import { z } from 'zod';
import {
  SALE_PATCH_STATUSES,
  SALE_REFS,
  SALE_REQUIRES_CUSTOMER,
  SALE_STATUSES,
  type SaleKind,
  type SaleStatus,
} from '../../domain/entities/sale-document.js';
import { LINES_MAX, MONEY_MAX, NOTES_MAX, QUANTITY_MAX } from '../../domain/rules/sales-rules.js';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdPattern, 'Invalid id');

/**
 * Esquemas estrictos por tipo de documento: cualquier campo desconocido
 * (incluido `tenantId` o `number` — este último lo asigna el servidor con la
 * numeración secuencial) se RECHAZA con 400 (ADR-002).
 */

const pageField = z.coerce.number().int().min(1).max(10_000).default(1);
const limitField = z.coerce.number().int().min(1).max(100).default(20);
const archivedField = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Línea de documento: importes validados; subtotales calculados por el servidor. */
const saleLineSchema = z.strictObject({
  description: z.string().min(1).max(200),
  quantity: z.number().gt(0).max(QUANTITY_MAX),
  unitPrice: z.number().min(0).max(MONEY_MAX),
  taxRate: z.number().min(0).max(100).default(0),
  discountPct: z.number().min(0).max(100).default(0),
});

const linesField = z.array(saleLineSchema).min(1).max(LINES_MAX);
const currencyField = z
  .string()
  .regex(/^[A-Za-z]{3}$/, 'Invalid currency (ISO-4217)')
  .optional();
const notesField = z.string().max(NOTES_MAX);

/** El `status` permitido en PATCH nunca incluye estados solo-al-approve. */
function patchStatusField(kind: SaleKind): z.ZodType<SaleStatus | undefined> {
  const statuses = SALE_PATCH_STATUSES[kind];
  return z
    .enum(statuses as unknown as [SaleStatus, ...SaleStatus[]])
    .optional() as unknown as z.ZodType<SaleStatus | undefined>;
}

export function createSaleBodySchema(kind: SaleKind): z.ZodType {
  const refs = SALE_REFS[kind];
  const shape: Record<string, z.ZodType> = {
    lines: linesField,
    currency: currencyField,
    issueDate: z.coerce.date().optional(),
    notes: notesField.optional(),
  };
  if (SALE_REQUIRES_CUSTOMER[kind]) {
    shape.customerId = objectId;
  }
  if (refs.includes('opportunityId')) {
    shape.opportunityId = objectId.optional();
  }
  if (refs.includes('quoteId')) {
    shape.quoteId = objectId.optional();
  }
  if (refs.includes('orderId')) {
    // El envío SIEMPRE nace de un pedido.
    shape.orderId = kind === 'sales.delivery' ? objectId : objectId.optional();
  }
  if (refs.includes('invoiceId')) {
    shape.invoiceId = objectId.optional();
  }
  if (kind === 'sales.quote') {
    shape.validUntil = z.coerce.date().optional();
  }
  return z.strictObject(shape);
}

export function patchSaleBodySchema(kind: SaleKind): z.ZodType {
  const refs = SALE_REFS[kind];
  const shape: Record<string, z.ZodType> = {
    lines: linesField.optional(),
    currency: currencyField,
    issueDate: z.coerce.date().optional(),
    notes: notesField.nullable().optional(),
    status: patchStatusField(kind),
    archived: z.boolean().optional(),
  };
  if (SALE_REQUIRES_CUSTOMER[kind]) {
    shape.customerId = objectId.optional();
  }
  if (refs.includes('opportunityId')) {
    shape.opportunityId = objectId.nullable().optional();
  }
  if (refs.includes('quoteId')) {
    shape.quoteId = objectId.nullable().optional();
  }
  if (refs.includes('orderId')) {
    shape.orderId = objectId.nullable().optional();
  }
  if (refs.includes('invoiceId')) {
    shape.invoiceId = objectId.nullable().optional();
  }
  if (kind === 'sales.quote') {
    shape.validUntil = z.coerce.date().nullable().optional();
  }
  return z.strictObject(shape);
}

export function saleListQuerySchema(kind: SaleKind): z.ZodType {
  const refs = SALE_REFS[kind];
  const shape: Record<string, z.ZodType> = {
    page: pageField,
    limit: limitField,
    archived: archivedField.optional(),
    status: z.enum(SALE_STATUSES[kind] as unknown as [SaleStatus, ...SaleStatus[]]).optional(),
    customerId: objectId.optional(),
  };
  if (refs.includes('orderId')) {
    shape.orderId = objectId.optional();
  }
  if (refs.includes('quoteId')) {
    shape.quoteId = objectId.optional();
  }
  if (refs.includes('invoiceId')) {
    shape.invoiceId = objectId.optional();
  }
  if (refs.includes('opportunityId')) {
    shape.opportunityId = objectId.optional();
  }
  return z.object(shape);
}
