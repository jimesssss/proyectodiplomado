import { z } from 'zod';

/**
 * Query estricta de /audit: paginación (convenciones §5) + filtros opcionales
 * con formato canónico de `action`/`entityType` (sin inyección de operators).
 */
const canonicalPattern = /^[a-z][a-z0-9.:_-]{0,63}$/;
const opaqueEntityIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export const auditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().regex(canonicalPattern, 'Invalid action').optional(),
  entityType: z.string().regex(canonicalPattern, 'Invalid entityType').optional(),
  entityId: z.string().min(1).max(64).regex(opaqueEntityIdPattern, 'Invalid entityId').optional(),
});
