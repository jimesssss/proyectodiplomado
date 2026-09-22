import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { JwtService } from '../../../../core/auth/jwt.js';
import { requireAuth, type SessionChecker } from '../../../../core/auth/middleware.js';
import { successResponse } from '../../../../core/http/envelope.js';
import { permissionCatalog, permissionGroups } from '../../application/rbac-service.js';

export interface PermissionRouterDeps {
  readonly jwt: JwtService;
  readonly isSessionActive: SessionChecker;
}

/**
 * Catálogo de permisos (constante en código, `@erp/permissions`).
 * Cualquier autenticado puede leerlo (la UI debe saber qué mostrar);
 * NO es una colección ni se escribe por API.
 */
export function createPermissionRouter(deps: PermissionRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  router.get('/', auth, (_req, res) => {
    const catalog = permissionCatalog();
    res
      .status(200)
      .json(successResponse(_req.requestId, { ...catalog, groups: permissionGroups() }));
  });

  return router;
}
