import { z } from 'zod';
import {
  PURCHASE_KINDS,
  PURCHASE_PATCH_STATUSES,
  PURCHASE_REFS,
  PURCHASE_REQUIRES_SUPPLIER,
  PURCHASE_REQUIRES_WAREHOUSE,
  PURCHASE_STATUSES,
  type PurchaseKind,
  type PurchaseStatus,
} from '../../domain/entities/purchase-document.js';
import {
  LINES_MAX,
  MONEY_MAX,
  NOTES_MAX,
  QUANTITY_MAX,
} from '../../domain/rules/purchase-rules.js';

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
const purchaseLineSchema = z.strictObject({
  description: z.string().min(1).max(200),
  quantity: z.number().gt(0).max(QUANTITY_MAX),
  unitPrice: z.number().min(0).max(MONEY_MAX),
  taxRate: z.number().min(0).max(100).default(0),
  discountPct: z.number().min(0).max(100).default(0),
});

/**
 * Línea de recepción: admite `productId` opcional (vínculo con el maestro de
 * productos que, al pasar a `posted`, alimenta el stock — FASE 11). Los demás
 * tipos usan la línea base estricta: `productId` → 400.
 */
const receiptLineSchema = purchaseLineSchema.extend({
  productId: objectId.optional(),
});

function linesFieldFor(kind: PurchaseKind) {
  const line = kind === 'goods.receipt' ? receiptLineSchema : purchaseLineSchema;
  return z.array(line).min(1).max(LINES_MAX);
}
const currencyField = z
  .string()
  .regex(/^[A-Za-z]{3}$/, 'Invalid currency (ISO-4217)')
  .optional();
const notesField = z.string().max(NOTES_MAX);

function statusEnum(statuses: readonly PurchaseStatus[]): z.ZodType<PurchaseStatus | undefined> {
  return z
    .enum(statuses as unknown as [PurchaseStatus, ...PurchaseStatus[]])
    .optional() as unknown as z.ZodType<PurchaseStatus | undefined>;
}

export function createPurchaseBodySchema(kind: PurchaseKind): z.ZodType {
  const refs = PURCHASE_REFS[kind];
  const shape: Record<string, z.ZodType> = {
    lines: linesFieldFor(kind),
    currency: currencyField,
    issueDate: z.coerce.date().optional(),
    notes: notesField.optional(),
  };
  if (PURCHASE_REQUIRES_SUPPLIER[kind]) {
    shape.supplierId = objectId;
  }
  if (PURCHASE_REQUIRES_WAREHOUSE[kind]) {
    // Recepción SIEMPRE nace con almacén destino (FK a Organization).
    shape.warehouseId = objectId;
  }
  if (refs.includes('requestId')) {
    shape.requestId = objectId.optional();
  }
  if (refs.includes('orderId')) {
    // La recepción SIEMPRE nace de una orden.
    shape.orderId = kind === 'goods.receipt' ? objectId : objectId.optional();
  }
  if (refs.includes('invoiceId')) {
    shape.invoiceId = objectId.optional();
  }
  return z.strictObject(shape);
}

export function patchPurchaseBodySchema(kind: PurchaseKind): z.ZodType {
  const refs = PURCHASE_REFS[kind];
  const shape: Record<string, z.ZodType> = {
    lines: linesFieldFor(kind).optional(),
    currency: currencyField,
    issueDate: z.coerce.date().optional(),
    notes: notesField.nullable().optional(),
    status: statusEnum(PURCHASE_PATCH_STATUSES[kind]),
    archived: z.boolean().optional(),
  };
  // En recepciones el proveedor se deriva de la orden: el campo NO existe.
  if (PURCHASE_REQUIRES_SUPPLIER[kind]) {
    shape.supplierId = objectId.optional();
  }
  if (PURCHASE_REQUIRES_WAREHOUSE[kind]) {
    // Almacén editable solo en borrador (bloqueo de campos de negocio).
    shape.warehouseId = objectId.optional();
  }
  if (refs.includes('requestId')) {
    shape.requestId = objectId.nullable().optional();
  }
  if (refs.includes('orderId')) {
    shape.orderId = objectId.nullable().optional();
  }
  if (refs.includes('invoiceId')) {
    shape.invoiceId = objectId.nullable().optional();
  }
  return z.strictObject(shape);
}

export function purchaseListQuerySchema(kind: PurchaseKind): z.ZodType {
  const refs = PURCHASE_REFS[kind];
  const shape: Record<string, z.ZodType> = {
    page: pageField,
    limit: limitField,
    archived: archivedField.optional(),
    status: statusEnum(PURCHASE_STATUSES[kind]),
    supplierId: objectId.optional(),
  };
  if (refs.includes('requestId')) {
    shape.requestId = objectId.optional();
  }
  if (refs.includes('orderId')) {
    shape.orderId = objectId.optional();
  }
  if (refs.includes('invoiceId')) {
    shape.invoiceId = objectId.optional();
  }
  return z.object(shape);
}

// --- Maestro de proveedores (patrón de customers, FASE 8) ---

const emailField = z.string().min(3).max(254).email('Invalid email');

const supplierAddressSchema = z.strictObject({
  street: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/, 'Invalid country (ISO-3166 alpha-2)')
    .optional(),
});

export const createSupplierBodySchema = z.strictObject({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  email: emailField.optional(),
  phone: z.string().max(40).optional(),
  taxId: z.string().max(40).optional(),
  address: supplierAddressSchema.optional(),
});

export const patchSupplierBodySchema = z.strictObject({
  name: z.string().min(1).max(120).optional(),
  email: emailField.nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  taxId: z.string().max(40).nullable().optional(),
  address: supplierAddressSchema.nullable().optional(),
  archived: z.boolean().optional(),
});

export const supplierListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
});

/** Validación de identidad de tipo (evita mounts huérfanos). */
export function assertPurchaseKind(kind: string): asserts kind is PurchaseKind {
  if (!(PURCHASE_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Unknown purchase kind: ${kind}`);
  }
}
