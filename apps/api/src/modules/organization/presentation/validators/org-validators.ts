import { z } from 'zod';
import { PARENT_KIND, type OrgKind } from '../../domain/entities/org-unit.js';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdPattern, 'Invalid id');

/**
 * Esquemas estrictos: cualquier campo desconocido (incluido `tenantId`) se
 * RECHAZA con 400 — el tenant y el padre validado salen del JWT/BD, no del
 * cliente (ADR-002).
 */
export function createOrgBodySchema(kind: OrgKind) {
  const base = {
    code: z.string().min(1).max(64),
    name: z.string().min(1).max(200),
  };
  return PARENT_KIND[kind] === null
    ? z.strictObject(base)
    : z.strictObject({ ...base, parentId: objectId });
}

export const patchOrgBodySchema = z.strictObject({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'archived']).optional(),
});

export const orgIdParamsSchema = z.object({
  id: z.string().regex(objectIdPattern, 'Invalid id'),
});

export const orgListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export interface OrgCreateBody {
  readonly code: string;
  readonly name: string;
  readonly parentId?: string | undefined;
}
