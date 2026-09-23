import { z } from 'zod';

import { AI_INTERACTION_STATUSES } from '../../domain/entities/ai-interaction.js';
import { PROMPT_MAX } from '../../domain/rules/ai-rules.js';

/**
 * Validadores AI (FASE 20): body de ejecución `z.strictObject` (clave
 * desconocida → 400, incluye `?tenantId=`); el `args` es un objeto plano —
 * su validación REAL la impone el contrato Zod de la tool seleccionada
 * (400 `Invalid tool arguments` en la capa de permisos, ANTES de ejecutar).
 * El listado usa `z.object` (STRIP): parámetro desconocido descartado sin
 * error, `tenantId` SIEMPRE del JWT.
 */
export const runToolBodySchema = z.strictObject({
  tool: z.string().min(1).max(64),
  args: z.record(z.string(), z.unknown()).default({}),
  prompt: z.string().max(PROMPT_MAX).optional(),
});

export const interactionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tool: z.string().min(1).max(64).optional(),
  status: z.enum(AI_INTERACTION_STATUSES).optional(),
});
