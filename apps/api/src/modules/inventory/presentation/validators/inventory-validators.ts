import { z } from 'zod';
import { MANUAL_MOVEMENT_TYPES, MOVEMENT_TYPES } from '../../domain/entities/stock.js';
import { COUNT_STATUSES, TRANSFER_STATUSES } from '../../domain/entities/stock-documents.js';
import { NOTES_MAX } from '../../domain/rules/inventory-rules.js';
import { QUANTITY_MAX } from '../../../../core/domain/line-totals.js';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdPattern, 'Invalid id');

/**
 * Esquemas estrictos: cualquier campo desconocido (incluido `tenantId`,
 * `archived`, `status` o `number` en create) se RECHAZA con 400 (ADR-002).
 * Los saldos y el ledger no se escriben por body: `balanceAfter`, `qty` y
 * `productId`/`warehouseId` del saldo lo derivan SIEMPRE los servicios.
 */

const pageField = z.coerce.number().int().min(1).max(10_000).default(1);
const limitField = z.coerce.number().int().min(1).max(100).default(20);
const archivedField = z.enum(['true', 'false']).transform((value) => value === 'true');

// --- Maestro de productos (patrón customers/suppliers) ---
const productImageUrl = z.string().trim().max(2048).url().refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}, 'Image reference must be an HTTPS URL without credentials').nullable().optional();

export const createProductBodySchema = z.strictObject({
  imageUrl: productImageUrl,
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  description: z.string().max(2_000).optional(),
  unit: z.string().min(1).max(32).default('unit'),
  cost: z.number().min(0).max(1e12).optional(),
  price: z.number().min(0).max(1e12).optional(),
  minStock: z.number().min(0).max(QUANTITY_MAX).optional(),
});

export const patchProductBodySchema = z.strictObject({
  imageUrl: productImageUrl,
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2_000).nullable().optional(),
  unit: z.string().min(1).max(32).optional(),
  cost: z.number().min(0).max(1e12).nullable().optional(),
  price: z.number().min(0).max(1e12).nullable().optional(),
  minStock: z.number().min(0).max(QUANTITY_MAX).nullable().optional(),
  archived: z.boolean().optional(),
});

export const productListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
});

// --- Saldos y movimientos ---

export const balanceListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  productId: objectId.optional(),
  warehouseId: objectId.optional(),
});

export const movementListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  productId: objectId.optional(),
  warehouseId: objectId.optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
});

/** Solo tipos MANUALES en el body del cliente (los del sistema los crea el servidor). */
export const createMovementBodySchema = z.strictObject({
  productId: objectId,
  warehouseId: objectId,
  type: z.enum(MANUAL_MOVEMENT_TYPES),
  quantity: z.number().gt(0).max(QUANTITY_MAX),
  reason: z.string().min(1).max(200),
});

// --- Transferencias ---

const transferLineSchema = z.strictObject({
  productId: objectId,
  quantity: z.number().gt(0).max(QUANTITY_MAX),
});

export const createTransferBodySchema = z
  .strictObject({
    fromWarehouseId: objectId,
    toWarehouseId: objectId,
    lines: z.array(transferLineSchema).min(1).max(200),
    notes: z.string().max(NOTES_MAX).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.fromWarehouseId === value.toWarehouseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['toWarehouseId'],
        message: 'fromWarehouseId and toWarehouseId must differ',
      });
    }
  });

export const patchTransferBodySchema = z
  .strictObject({
    fromWarehouseId: objectId.optional(),
    toWarehouseId: objectId.optional(),
    lines: z.array(transferLineSchema).min(1).max(200).optional(),
    notes: z.string().max(NOTES_MAX).nullable().optional(),
    status: z.enum(TRANSFER_STATUSES).optional(),
    archived: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.fromWarehouseId !== undefined &&
      value.toWarehouseId !== undefined &&
      value.fromWarehouseId === value.toWarehouseId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['toWarehouseId'],
        message: 'fromWarehouseId and toWarehouseId must differ',
      });
    }
  });

export const transferListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  status: z.enum(TRANSFER_STATUSES).optional(),
  archived: archivedField.optional(),
});

// --- Conteos físicos ---

const countLineSchema = z.strictObject({
  productId: objectId,
  countedQty: z.number().min(0).max(QUANTITY_MAX),
});

export const createCountBodySchema = z.strictObject({
  warehouseId: objectId,
  lines: z.array(countLineSchema).min(1).max(200),
  notes: z.string().max(NOTES_MAX).optional(),
});

export const patchCountBodySchema = z.strictObject({
  warehouseId: objectId.optional(),
  lines: z.array(countLineSchema).min(1).max(200).optional(),
  notes: z.string().max(NOTES_MAX).nullable().optional(),
  // `approved` está en el enum a propósito: el servicio responde 409 indicando
  // el endpoint de aprobación (el cliente ve un error accionable, no un 400).
  status: z.enum(COUNT_STATUSES).optional(),
  archived: z.boolean().optional(),
});

export const countListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  status: z.enum(COUNT_STATUSES).optional(),
  archived: archivedField.optional(),
});
