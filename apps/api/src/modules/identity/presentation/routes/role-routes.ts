import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import type { JwtService } from '../../../../core/auth/jwt.js';
import { requireAuth, type SessionChecker } from '../../../../core/auth/middleware.js';
import { requirePermission } from '../../../../core/auth/require-permission.js';
import { auditFromRequest } from '../../../../core/audit/audit.js';
import { successListResponse, successResponse } from '../../../../core/http/envelope.js';
import { validate } from '../../../../core/validation/validate.js';
import {
  createRole,
  deleteRole,
  getRole,
  listRoles,
  updateRole,
} from '../../application/rbac-service.js';
import {
  createRoleBodySchema,
  listQuerySchema,
  patchRoleBodySchema,
  userIdParamsSchema,
} from '../validators/rbac-validators.js';

export interface RoleRouterDeps {
  readonly jwt: JwtService;
  readonly isSessionActive: SessionChecker;
}

/**
 * Administración de roles del tenant (FASE 6, ADR-005).
 * Los roles embutidos (`owner`, `super_admin`) no son documentos: no existen
 * aquí y no pueden crearse (400 por clave reservada).
 */
export function createRoleRouter(deps: RoleRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  router.get(
    '/',
    auth,
    requirePermission('role:read'),
    validate({ query: listQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as { page: number; limit: number };
      const page = await listRoles(currentUser(req).tenantId, query.page, query.limit);
      res.status(200).json(
        successListResponse(req.requestId, page.items, {
          page: page.page,
          limit: page.limit,
          total: page.total,
        }),
      );
    },
  );

  router.get(
    '/:id',
    auth,
    requirePermission('role:read'),
    validate({ params: userIdParamsSchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const role = await getRole(currentUser(req).tenantId, params.id);
      res.status(200).json(successResponse(req.requestId, role));
    },
  );

  router.post(
    '/',
    auth,
    requirePermission('role:create'),
    validate({ body: createRoleBodySchema }),
    async (req, res) => {
      const body = req.body as z.infer<typeof createRoleBodySchema>;
      const role = await createRole(currentUser(req).tenantId, body);
      await auditFromRequest(req, {
        action: 'role.create',
        entityType: 'role',
        entityId: role.id,
        newValue: { key: role.key, permissions: role.permissions },
      });
      res.status(201).json(successResponse(req.requestId, role));
    },
  );

  router.patch(
    '/:id',
    auth,
    requirePermission('role:update'),
    validate({ params: userIdParamsSchema, body: patchRoleBodySchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const body = req.body as z.infer<typeof patchRoleBodySchema>;
      const role = await updateRole(currentUser(req).tenantId, params.id, body);
      await auditFromRequest(req, {
        action: 'role.update',
        entityType: 'role',
        entityId: role.id,
        newValue: body,
      });
      res.status(200).json(successResponse(req.requestId, role));
    },
  );

  router.delete(
    '/:id',
    auth,
    requirePermission('role:delete'),
    validate({ params: userIdParamsSchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const result = await deleteRole(currentUser(req).tenantId, params.id);
      await auditFromRequest(req, {
        action: 'role.delete',
        entityType: 'role',
        entityId: params.id,
      });
      res.status(200).json(successResponse(req.requestId, result));
    },
  );

  return router;
}

function currentUser(req: { user?: { tenantId: string } }): { tenantId: string } {
  const user = req.user;
  if (user === undefined) {
    throw new Error('requireAuth should populate request.user');
  }
  return user;
}
