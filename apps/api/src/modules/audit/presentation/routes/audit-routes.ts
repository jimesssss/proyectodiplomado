import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import type { JwtService } from '../../../../core/auth/jwt.js';
import { requireAuth, type SessionChecker } from '../../../../core/auth/middleware.js';
import { requirePermission } from '../../../../core/auth/require-permission.js';
import { successListResponse } from '../../../../core/http/envelope.js';
import { validate } from '../../../../core/validation/validate.js';
import { listAudit } from '../../application/audit-service.js';
import { auditListQuerySchema } from '../validators/audit-validators.js';

export interface AuditRouterDeps {
  readonly jwt: JwtService;
  readonly isSessionActive: SessionChecker;
}

/**
 * GET /api/v1/audit — consulta paginada del log del propio tenant.
 * Requiere `audit:read` (matriz de permisos); solo-lectura por diseño:
 * no hay POST/PATCH/DELETE (append-only en core/audit).
 */
export function createAuditRouter(deps: AuditRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  router.get(
    '/',
    auth,
    requirePermission('audit:read'),
    validate({ query: auditListQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as z.infer<typeof auditListQuerySchema>;
      const user = req.user;
      if (user === undefined) {
        throw new Error('requireAuth should populate request.user');
      }
      const page = await listAudit(user.tenantId, query);
      res.status(200).json(
        successListResponse(req.requestId, page.items, {
          page: page.page,
          limit: page.limit,
          total: page.total,
        }),
      );
    },
  );

  return router;
}
