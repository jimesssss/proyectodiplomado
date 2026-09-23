import { z } from 'zod';
import { PRODUCTION_STATUSES } from '../../domain/entities/production-order.js';
import { LINES_MAX, NOTES_MAX, QUANTITY_MAX } from '../../domain/rules/manufacturing-rules.js';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdPattern, 'Invalid id');

/**
 * Esquemas estrictos: cualquier campo desconocido se RECHAZA con 400
 * (ADR-002). `code` solo existe en el create de la BOM (clave natural
 * inmutable → PATCH con `code` → 400); `number`/`status`/`tenantId`/`bomId`
 * no se envían nunca (los asigna el servidor o van en `status` del PATCH de
 * la orden). `lines`/`bomId` se fijan al crear la orden (snapshot del plan
 * POR UNIDAD) y NO admiten PATCH.
 */

const pageField = z.coerce.number().int().min(1).max(10_000).default(1);
const limitField = z.coerce.number().int().min(1).max(100).default(20);
const archivedField = z.enum(['true', 'false']).transform((value) => value === 'true');

const componentLineSchema = z.strictObject({
  productId: objectId,
  quantity: z.number().gt(0).max(QUANTITY_MAX),
});
const componentLinesField = z.array(componentLineSchema).min(1).max(LINES_MAX);
const notesField = z.string().max(NOTES_MAX);

// --- BOM (maestro) ---

export const createBomBodySchema = z.strictObject({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  productId: objectId,
  lines: componentLinesField,
});

export const patchBomBodySchema = z.strictObject({
  name: z.string().min(1).max(120).optional(),
  productId: objectId.optional(),
  lines: componentLinesField.optional(),
  archived: z.boolean().optional(),
});

export const bomListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
});

// --- Orden de producción ---

export const createOrderBodySchema = z
  .strictObject({
    productId: objectId,
    quantity: z.number().int().min(1).max(QUANTITY_MAX),
    warehouseId: objectId,
    bomId: objectId.optional(),
    lines: componentLinesField.optional(),
    notes: notesField.optional(),
  })
  .superRefine((value, ctx) => {
    // XOR: las líneas o salen de una BOM o se envían explícitas — nunca ambas.
    if (value.bomId !== undefined && value.lines !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either bomId or lines, not both',
        path: ['lines'],
      });
      return;
    }
    if (value.bomId === undefined && value.lines === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either bomId or lines is required',
        path: ['lines'],
      });
    }
  });

export const patchOrderBodySchema = z.strictObject({
  productId: objectId.optional(),
  quantity: z.number().int().min(1).max(QUANTITY_MAX).optional(),
  warehouseId: objectId.optional(),
  notes: notesField.nullish(),
  status: z.enum(PRODUCTION_STATUSES).optional(),
  archived: z.boolean().optional(),
});

export const orderListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  status: z.enum(PRODUCTION_STATUSES).optional(),
  archived: archivedField.optional(),
});
