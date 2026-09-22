import { z } from 'zod';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

/**
 * Esquemas estrictos para RBAC: cualquier campo extra (incluido `tenantId`)
 * se RECHAZA con 400. `tenantId` sale del JWT, nunca del body (ADR-002).
 */
export const userIdParamsSchema = z.object({
  id: z.string().regex(objectIdPattern, 'Invalid id'),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createUserBodySchema = z.strictObject({
  email: z.string().min(3).max(254).email(),
  password: z.string().min(1).max(128),
  displayName: z.string().min(1).max(120),
  roles: z.array(z.string().min(1).max(64)).max(32).optional(),
});

export const patchUserBodySchema = z.strictObject({
  displayName: z.string().min(1).max(120).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  roles: z.array(z.string().min(1).max(64)).max(32).optional(),
});

export const createRoleBodySchema = z.strictObject({
  key: z.string().min(2).max(32),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().min(1).max(64)).max(200).optional(),
});

export const patchRoleBodySchema = z.strictObject({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().min(1).max(64)).max(200).optional(),
});
