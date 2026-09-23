import { z } from 'zod';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../../domain/entities/ticket.js';
import { DESCRIPTION_MAX, RESOLUTION_MAX, SUBJECT_MAX } from '../../domain/rules/ticket-rules.js';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdPattern, 'Invalid id');

/**
 * Esquemas estrictos: cualquier campo desconocido se RECHAZA con 400
 * (ADR-002). `number` y `dueAt` NO existen en el body (los asigna/elige el
 * servidor: numeración `TK-*` y SLA derivado); `subject` va con `.trim()`
 * (zod 4 recorta ANTES del `min`: en blanco → 400 en create y en PATCH);
 * `resolution` acepta null (limpiar) y el requisito de "no vacío al
 * resolver" lo valida el servicio; `tenantId` nunca.
 */

const pageField = z.coerce.number().int().min(1).max(10_000).default(1);
const limitField = z.coerce.number().int().min(1).max(100).default(20);
const archivedField = z.enum(['true', 'false']).transform((value) => value === 'true');
const subjectField = z.string().trim().min(1).max(SUBJECT_MAX);
const descriptionField = z.string().max(DESCRIPTION_MAX);

export const createTicketBodySchema = z.strictObject({
  subject: subjectField,
  description: descriptionField.optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assigneeId: objectId.optional(),
});

export const patchTicketBodySchema = z.strictObject({
  subject: subjectField.optional(),
  description: descriptionField.nullable().optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assigneeId: objectId.nullable().optional(),
  resolution: z.string().max(RESOLUTION_MAX).nullable().optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  archived: z.boolean().optional(),
});

export const ticketListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assigneeId: objectId.optional(),
});
