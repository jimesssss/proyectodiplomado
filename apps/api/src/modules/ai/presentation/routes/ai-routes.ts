import { Router, type RequestHandler } from 'express';
import type { JwtService } from '../../../../core/auth/jwt.js';
import { requirePermission } from '../../../../core/auth/require-permission.js';
import {
  requireAuth,
  type AuthUser,
  type SessionChecker,
} from '../../../../core/auth/middleware.js';
import { crudIdParamsSchema } from '../../../../core/http/crud-router.js';
import { successListResponse, successResponse } from '../../../../core/http/envelope.js';
import { validate } from '../../../../core/validation/validate.js';
import {
  getInteraction,
  listInteractions,
  runAiTool,
  type InteractionListQuery,
  type RunToolInput,
} from '../../application/ai-service.js';
import { listAiTools } from '../../application/tool-registry.js';
import { interactionListQuerySchema, runToolBodySchema } from '../validators/ai-validators.js';

export const AI_ROUTE_PATH = '/api/v1/ai';

export interface AiRouterDeps {
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
 * Router AI (FASE 20, ADR-008): rutas PROPIAS (no CRUD — el registro de
 * gobernanza es inmutable: sin PATCH/DELETE publicados). Cadena por ruta:
 * auth → `requirePermission('ai:use')` (incluye el chequeo de `pv`) → Zod
 * estricto → handler. La capa de permisos de la tool SELECCIONADA se aplica
 * dentro de `runAiTool` (el permiso depende del body, no de la ruta).
 */
export function createAiRouter(deps: AiRouterDeps): { path: string; router: Router } {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);
  const canUseAi: RequestHandler = requirePermission('ai:use');

  // Catálogo de tools: descubrimiento para el agente/UI, sin datos.
  router.get('/tools', auth, canUseAi, (req, res) => {
    res.status(200).json(successResponse(req.requestId, { tools: listAiTools() }));
  });

  // Historial paginado de interacciones (gobernanza por tenant).
  router.get(
    '/interactions',
    auth,
    canUseAi,
    validate({ query: interactionListQuerySchema }),
    async (req, res) => {
      const user = currentUser(req);
      const query = req.query as unknown as InteractionListQuery;
      const page = await listInteractions(user.tenantId, query);
      res.status(200).json(
        successListResponse(req.requestId, page.items, {
          page: query.page,
          limit: query.limit,
          total: page.total,
        }),
      );
    },
  );

  // Detalle de UNA interacción (404 uniforme).
  router.get(
    '/interactions/:id',
    auth,
    canUseAi,
    validate({ params: crudIdParamsSchema }),
    async (req, res) => {
      const user = currentUser(req);
      const params = req.params as { id: string };
      const interaction = await getInteraction(user.tenantId, params.id);
      res.status(200).json(successResponse(req.requestId, interaction));
    },
  );

  // Ejecuta UNA tool autorizada y registra la interacción (201).
  router.post(
    '/interactions',
    auth,
    canUseAi,
    validate({ body: runToolBodySchema }),
    async (req, res) => {
      const user = currentUser(req);
      const body = req.body as RunToolInput;
      const interaction = await runAiTool(
        { tenantId: user.tenantId, userId: user.userId, permissions: user.permissions },
        req.requestId,
        body,
      );
      res.status(201).json(successResponse(req.requestId, interaction));
    },
  );

  return { path: AI_ROUTE_PATH, router };
}

export function createAiRouters(
  deps: AiRouterDeps,
): ReadonlyArray<{ path: string; router: Router }> {
  return [createAiRouter(deps)];
}
