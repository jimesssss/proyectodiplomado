import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { JwtService } from '../../../../core/auth/jwt.js';
import {
  requireAuth,
  type AuthUser,
  type SessionChecker,
} from '../../../../core/auth/middleware.js';
import { requireRole } from '../../../../core/auth/require-role.js';
import { successListResponse, successResponse } from '../../../../core/http/envelope.js';
import { validate } from '../../../../core/validation/validate.js';
import {
  archiveOrgUnit,
  createOrgUnit,
  getOrgUnit,
  listOrgUnits,
  updateOrgUnit,
} from '../../application/org-service.js';
import type { OrgKind } from '../../domain/entities/org-unit.js';
import {
  createOrgBodySchema,
  orgIdParamsSchema,
  orgListQuerySchema,
  patchOrgBodySchema,
  type OrgCreateBody,
} from '../validators/org-validators.js';

export interface OrgRouterDeps {
  readonly jwt: JwtService;
  readonly isSessionActive: SessionChecker;
}

/** Rutas de API por tipo (kebab-case, plural — convenciones §1). */
export const ORG_ROUTE_PATHS: Record<OrgKind, string> = {
  organization: 'organizations',
  company: 'companies',
  branch: 'branches',
  department: 'departments',
  warehouse: 'warehouses',
  costCenter: 'cost-centers',
};

export const ORG_KINDS_BY_PATH: readonly OrgKind[] = [
  'organization',
  'company',
  'branch',
  'department',
  'warehouse',
  'costCenter',
];

function currentUser(req: { user?: AuthUser }): AuthUser {
  const user = req.user;
  if (user === undefined) {
    throw new Error('requireAuth should populate request.user');
  }
  return user;
}

/**
 * CRUD por tipo de unidad organizativa.
 * Lectura: cualquier usuario autenticado del tenant.
 * Escritura: roles provisionales `owner`/`super_admin` (hasta RBAC FASE 6).
 * `tenantId` SIEMPRE del JWT; `:id` ajeno o inexistente → 404 uniforme.
 */
export function createOrgRouter(deps: OrgRouterDeps, kind: OrgKind): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);
  const writer: RequestHandler = requireRole('owner', 'super_admin');
  const bodySchema = createOrgBodySchema(kind);

  router.post('/', auth, writer, validate({ body: bodySchema }), async (req, res) => {
    const body = req.body as OrgCreateBody;
    const unit = await createOrgUnit(currentUser(req).tenantId, kind, body);
    res.status(201).json(successResponse(req.requestId, unit));
  });

  router.get('/', auth, validate({ query: orgListQuerySchema }), async (req, res) => {
    const query = req.query as unknown as { page: number; limit: number };
    const page = await listOrgUnits(currentUser(req).tenantId, kind, query.page, query.limit);
    res.status(200).json(
      successListResponse(req.requestId, page.items, {
        page: page.page,
        limit: page.limit,
        total: page.total,
      }),
    );
  });

  router.get('/:id', auth, validate({ params: orgIdParamsSchema }), async (req, res) => {
    const params = req.params as { id: string };
    const unit = await getOrgUnit(currentUser(req).tenantId, kind, params.id);
    res.status(200).json(successResponse(req.requestId, unit));
  });

  router.patch(
    '/:id',
    auth,
    writer,
    validate({ params: orgIdParamsSchema, body: patchOrgBodySchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const body = req.body as {
        name?: string | undefined;
        status?: 'active' | 'archived' | undefined;
      };
      const unit = await updateOrgUnit(currentUser(req).tenantId, kind, params.id, body);
      res.status(200).json(successResponse(req.requestId, unit));
    },
  );

  router.delete('/:id', auth, writer, validate({ params: orgIdParamsSchema }), async (req, res) => {
    const params = req.params as { id: string };
    const unit = await archiveOrgUnit(currentUser(req).tenantId, kind, params.id);
    res.status(200).json(successResponse(req.requestId, unit));
  });

  return router;
}
