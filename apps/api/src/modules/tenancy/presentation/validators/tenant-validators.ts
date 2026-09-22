import { z } from 'zod';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const namePattern = /.+/;

/**
 * Esquemas estrictos: un `tenantId` (o cualquier campo) desconocido en el
 * body se RECHAZA con 400 — el tenant nunca viene del cliente (ADR-002).
 */
export const provisionTenantBodySchema = z.strictObject({
  slug: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(200).regex(namePattern),
  owner: z.strictObject({
    email: z.string().min(3).max(254).email(),
    password: z.string().min(1).max(128),
    displayName: z.string().min(1).max(120),
  }),
});

export const renameTenantBodySchema = z.strictObject({
  name: z.string().min(1).max(200),
});

export const tenantIdParamsSchema = z.object({
  id: z.string().regex(objectIdPattern, 'Invalid tenant id'),
});

export const tenantListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
