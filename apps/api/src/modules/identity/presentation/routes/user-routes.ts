import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import type { JwtService } from '../../../../core/auth/jwt.js';
import { requireAuth, type SessionChecker } from '../../../../core/auth/middleware.js';
import { requirePermission } from '../../../../core/auth/require-permission.js';
import { successListResponse, successResponse } from '../../../../core/http/envelope.js';
import { validate } from '../../../../core/validation/validate.js';
import {
  createAppUser,
  getAppUser,
  listAppUsers,
  updateAppUser,
} from '../../application/rbac-service.js';
import {
  createUserBodySchema,
  listQuerySchema,
  patchUserBodySchema,
  userIdParamsSchema,
} from '../validators/rbac-validators.js';

export interface UserRouterDeps {
  readonly jwt: JwtService;
  readonly isSessionActive: SessionChecker;
}

/**
 * Administración de usuarios del tenant (FASE 6).
 * `tenantId` SIEMPRE del JWT; id ajeno → 404 uniforme. No hay DELETE:
 * el usuario se deshabilita (`status: disabled`) para conservar la integridad.
 */
export function createUserRouter(deps: UserRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  router.get(
    '/',
    auth,
    requirePermission('user:read'),
    validate({ query: listQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as { page: number; limit: number };
      const page = await listAppUsers(currentUser(req).tenantId, query.page, query.limit);
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
    requirePermission('user:read'),
    validate({ params: userIdParamsSchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const user = await getAppUser(currentUser(req).tenantId, params.id);
      res.status(200).json(successResponse(req.requestId, user));
    },
  );

  router.post(
    '/',
    auth,
    requirePermission('user:create'),
    validate({ body: createUserBodySchema }),
    async (req, res) => {
      const body = req.body as z.infer<typeof createUserBodySchema>;
      const user = await createAppUser(currentUser(req).tenantId, body);
      res.status(201).json(successResponse(req.requestId, user));
    },
  );

  router.patch(
    '/:id',
    auth,
    requirePermission('user:update'),
    validate({ params: userIdParamsSchema, body: patchUserBodySchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const body = req.body as z.infer<typeof patchUserBodySchema>;
      const user = await updateAppUser(currentUser(req).tenantId, params.id, body);
      res.status(200).json(successResponse(req.requestId, user));
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
