import { PERMISSION_CATALOG_VERSION } from '@erp/permissions';
import { Router, type RequestHandler } from 'express';
import type { JwtService } from '../../../../core/auth/jwt.js';
import {
  requireAuth,
  type AuthUser,
  type SessionChecker,
} from '../../../../core/auth/middleware.js';
import { ForbiddenError } from '../../../../core/errors/app-error.js';
import { successResponse } from '../../../../core/http/envelope.js';
import { validate } from '../../../../core/validation/validate.js';
import { searchCrm } from '../../application/search-service.js';
import { searchQuerySchema } from '../validators/crm-validators.js';

export {
  CRM_SEARCH_TYPES,
  searchCrm,
  type CrmSearchType,
  type SearchCrmOptions,
  type SearchCrmResult,
  type SearchResultItem,
} from '../../application/search-service.js';

export interface SearchRouterDeps {
  readonly jwt: JwtService;
  readonly isSessionActive: SessionChecker;
}

function currentUser(req: { user?: AuthUser }): AuthUser {
  const user = req.user;
  if (user === undefined) {
    throw new Error('requireAuth should populate request.user');
  }
  return user;
}

/**
 * Búsqueda global de CRM (`GET /search`, desde FASE 8 — convenciones §4).
 * La lógica vive en `application/search-service.ts` (extraída en FASE 20
 * para reutilizarla como tool `crm.search` de IA — ADR-008): aquí solo
 * queda auth + `pv` del catálogo + Zod estricto + envelope. Búsqueda
 * LITERAL por tenant con `<recurso>:read` POR TIPO (sin permiso → el tipo
 * no aparece, no hay 403 global). Mismo `pv` que `requirePermission`
 * (token desactualizado → 403 con re-login).
 */
export function createSearchRouter(deps: SearchRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  router.get('/', auth, validate({ query: searchQuerySchema }), async (req, res) => {
    const user = currentUser(req);
    if (user.permVersion !== PERMISSION_CATALOG_VERSION) {
      throw new ForbiddenError('Permissions catalog outdated. Sign in again.', {
        expectedVersion: PERMISSION_CATALOG_VERSION,
        tokenVersion: user.permVersion,
      });
    }
    const query = req.query as unknown as {
      q: string;
      types?: string | undefined;
      limit: number;
    };
    const result = await searchCrm(
      user.tenantId,
      { q: query.q, types: query.types, limit: query.limit },
      user.permissions,
    );
    res.status(200).json(successResponse(req.requestId, result));
  });

  return router;
}
