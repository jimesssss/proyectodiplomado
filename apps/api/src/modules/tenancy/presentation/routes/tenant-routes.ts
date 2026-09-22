import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import type { JwtService } from '../../../../core/auth/jwt.js';
import { requireAuth, type SessionChecker } from '../../../../core/auth/middleware.js';
import { requirePermission } from '../../../../core/auth/require-permission.js';
import { successListResponse, successResponse } from '../../../../core/http/envelope.js';
import { NotFoundError } from '../../../../core/errors/app-error.js';
import { validate } from '../../../../core/validation/validate.js';
import {
  getTenantById,
  listTenants,
  provisionTenant,
  reactivateTenant,
  renameTenant,
  suspendTenant,
} from '../../application/tenant-service.js';
import { toPublicTenant } from '../../domain/entities/tenant.js';
import {
  provisionTenantBodySchema,
  renameTenantBodySchema,
  tenantIdParamsSchema,
  tenantListQuerySchema,
} from '../validators/tenant-validators.js';

export interface TenantRouterDeps {
  readonly jwt: JwtService;
  readonly isSessionActive: SessionChecker;
}

/**
 * Rutas /api/v1/tenants.
 * Autorización por permisos `recurso:acción` (ADR-005, FASE 6): los permisos
 * de plataforma (`tenant:read/suspend/reactivate`) NO los tiene el `owner` de
 * un tenant; `super_admin` sí (catálogo compartido `@erp/permissions`).
 * El tenant SIEMPRE sale del JWT (ADR-002): `:id` solo resuelve el propio.
 */
export function createTenantRouter(deps: TenantRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  function requireUser(): NonNullable<Express.Request['user']> {
    throw new Error('requireAuth should populate request.user');
  }

  // Provisionamiento de tenant + owner (bootstrap de alta de empresa).
  router.post('/', validate({ body: provisionTenantBodySchema }), async (req, res) => {
    const body = req.body as z.infer<typeof provisionTenantBodySchema>;
    const result = await provisionTenant({
      name: body.name,
      owner: body.owner,
      ...(body.slug !== undefined ? { slug: body.slug } : {}),
    });
    res.status(201).json(successResponse(req.requestId, result));
  });

  // El propio tenant del JWT (registrado antes de /:id).
  router.get('/current', auth, async (req, res) => {
    const user = req.user ?? requireUser();
    const tenant = await getTenantById(user.tenantId);
    res.status(200).json(successResponse(req.requestId, toPublicTenant(tenant)));
  });

  router.patch(
    '/current',
    auth,
    requirePermission('tenant:update'),
    validate({ body: renameTenantBodySchema }),
    async (req, res) => {
      const user = req.user ?? requireUser();
      const body = req.body as z.infer<typeof renameTenantBodySchema>;
      const tenant = await renameTenant(user.tenantId, body.name);
      res.status(200).json(successResponse(req.requestId, toPublicTenant(tenant)));
    },
  );

  // Listado global: solo plataforma (permiso `tenant:read`). Paginado.
  router.get(
    '/',
    auth,
    requirePermission('tenant:read'),
    validate({ query: tenantListQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as z.infer<typeof tenantListQuerySchema>;
      const page = await listTenants(query.page, query.limit);
      res.status(200).json(
        successListResponse(req.requestId, page.items, {
          page: page.page,
          limit: page.limit,
          total: page.total,
        }),
      );
    },
  );

  router.post(
    '/:id/suspend',
    auth,
    requirePermission('tenant:suspend'),
    validate({ params: tenantIdParamsSchema }),
    async (req, res) => {
      const params = req.params as z.infer<typeof tenantIdParamsSchema>;
      const tenant = await suspendTenant(params.id);
      res.status(200).json(successResponse(req.requestId, toPublicTenant(tenant)));
    },
  );

  router.post(
    '/:id/reactivate',
    auth,
    requirePermission('tenant:reactivate'),
    validate({ params: tenantIdParamsSchema }),
    async (req, res) => {
      const params = req.params as z.infer<typeof tenantIdParamsSchema>;
      const tenant = await reactivateTenant(params.id);
      res.status(200).json(successResponse(req.requestId, toPublicTenant(tenant)));
    },
  );

  // Lectura por id: resuelve SOLO el tenant del propio JWT; cualquier otro id
  // responde 404 idéntico a un inexistente (sin revelar existencia ajena).
  router.get('/:id', auth, validate({ params: tenantIdParamsSchema }), async (req, res) => {
    const user = req.user ?? requireUser();
    const params = req.params as z.infer<typeof tenantIdParamsSchema>;
    if (params.id.toLowerCase() !== user.tenantId.toLowerCase()) {
      throw new NotFoundError('Tenant not found');
    }
    const tenant = await getTenantById(user.tenantId);
    res.status(200).json(successResponse(req.requestId, toPublicTenant(tenant)));
  });

  return router;
}
