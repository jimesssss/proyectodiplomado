import type { Permission } from '@erp/permissions';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { ZodType } from 'zod';
import type { JwtService } from '../auth/jwt.js';
import { requireAuth, type AuthUser, type SessionChecker } from '../auth/middleware.js';
import { requirePermission } from '../auth/require-permission.js';
import { auditFromRequest } from '../audit/audit.js';
import { successListResponse, successResponse } from './envelope.js';
import { validate } from '../validation/validate.js';

/**
 * Fábrica de routers CRUD reutilizable (FASE 8 → FASE 9+): UN set de
 * middlewares para cualquier recurso con el mismo contrato:
 * auth → `requirePermission` por verbo → Zod estricto → envelope → auditoría.
 * Denegación por defecto (ADR-005); `tenantId` SIEMPRE del JWT (lo extraen
 * los handlers); `:id` ajeno o inexistente → 404 uniforme (del servicio).
 */

export interface CrudRouterDeps {
  readonly jwt: JwtService;
  readonly isSessionActive: SessionChecker;
}

export interface CrudListQueryBase {
  readonly page: number;
  readonly limit: number;
}

/** Subconjunto de todo patch usado por la capa de rutas (auditoría). */
export interface CrudPatchBase {
  readonly archived?: boolean | undefined;
  readonly status?: string | undefined;
  readonly stage?: string | undefined;
}

export interface CrudListResult<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface CrudHandlers<
  TPublic extends { readonly id: string },
  TCreate,
  TPatch extends CrudPatchBase,
  TQuery extends CrudListQueryBase,
> {
  create(tenantId: string, body: TCreate): Promise<TPublic>;
  list(tenantId: string, query: TQuery): Promise<CrudListResult<TPublic>>;
  get(tenantId: string, id: string): Promise<TPublic>;
  update(tenantId: string, id: string, patch: TPatch): Promise<TPublic>;
  archive(tenantId: string, id: string): Promise<TPublic>;
}

export interface CrudResourceSpec<
  TPublic extends { readonly id: string },
  TCreate,
  TPatch extends CrudPatchBase,
  TQuery extends CrudListQueryBase,
> {
  readonly permissions: {
    readonly read: Permission;
    readonly create: Permission;
    readonly update: Permission;
    /**
     * Permiso de la ruta DELETE (soft-delete). Opcional: recursos cuyo
     * catálogo NO tiene `:delete` (p. ej. `goods.receipt`) se archivan vía
     * `PATCH {archived}` con el permiso de actualización y NO se publica la
     * ruta DELETE (peticiones → 404).
     */
    readonly delete?: Permission | undefined;
  };
  /** Nombre canónico: `entityType` y prefijo de acciones de auditoría. */
  readonly entity: string;
  readonly createSchema: ZodType;
  readonly patchSchema: ZodType;
  readonly listQuerySchema: ZodType;
  readonly handlers: CrudHandlers<TPublic, TCreate, TPatch, TQuery>;
}

/** Usuario autenticado (garantizado por `requireAuth` previo). */
export function currentUser(req: { user?: AuthUser }): AuthUser {
  const user = req.user;
  if (user === undefined) {
    throw new Error('requireAuth should populate request.user');
  }
  return user;
}

function patchReason(patch: CrudPatchBase): string | undefined {
  if (patch.status !== undefined) {
    return `status:${patch.status}`;
  }
  if (patch.stage !== undefined) {
    return `stage:${patch.stage}`;
  }
  if (patch.archived !== undefined) {
    return `archived:${String(patch.archived)}`;
  }
  return undefined;
}

export function createCrudRouter<
  TPublic extends { readonly id: string },
  TCreate,
  TPatch extends CrudPatchBase,
  TQuery extends CrudListQueryBase,
>(deps: CrudRouterDeps, spec: CrudResourceSpec<TPublic, TCreate, TPatch, TQuery>): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);
  const entity = spec.entity;

  router.post(
    '/',
    auth,
    requirePermission(spec.permissions.create),
    validate({ body: spec.createSchema }),
    async (req, res) => {
      const created = await spec.handlers.create(currentUser(req).tenantId, req.body as TCreate);
      await auditFromRequest(req, {
        action: `${entity}.create`,
        entityType: entity,
        entityId: created.id,
        newValue: created,
      });
      res.status(201).json(successResponse(req.requestId, created));
    },
  );

  router.get(
    '/',
    auth,
    requirePermission(spec.permissions.read),
    validate({ query: spec.listQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as TQuery;
      const result = await spec.handlers.list(currentUser(req).tenantId, query);
      res.status(200).json(
        successListResponse(req.requestId, result.items, {
          page: query.page,
          limit: query.limit,
          total: result.total,
        }),
      );
    },
  );

  router.get(
    '/:id',
    auth,
    requirePermission(spec.permissions.read),
    validate({ params: crudIdParamsSchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const found = await spec.handlers.get(currentUser(req).tenantId, params.id);
      res.status(200).json(successResponse(req.requestId, found));
    },
  );

  router.patch(
    '/:id',
    auth,
    requirePermission(spec.permissions.update),
    validate({ params: crudIdParamsSchema, body: spec.patchSchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const body = req.body as TPatch;
      const updated = await spec.handlers.update(currentUser(req).tenantId, params.id, body);
      await auditFromRequest(req, {
        action: body.archived === false ? `${entity}.restore` : `${entity}.update`,
        entityType: entity,
        entityId: updated.id,
        newValue: updated,
        reason: patchReason(body),
      });
      res.status(200).json(successResponse(req.requestId, updated));
    },
  );

  if (spec.permissions.delete !== undefined) {
    router.delete(
      '/:id',
      auth,
      requirePermission(spec.permissions.delete),
      validate({ params: crudIdParamsSchema }),
      async (req, res) => {
        const params = req.params as { id: string };
        const archived = await spec.handlers.archive(currentUser(req).tenantId, params.id);
        await auditFromRequest(req, {
          action: `${entity}.archive`,
          entityType: entity,
          entityId: archived.id,
          newValue: archived,
          reason: 'archived:true',
        });
        res.status(200).json(successResponse(req.requestId, archived));
      },
    );
  }

  return router;
}

/** Params `:id` compartidos (ObjectId estricto → 400, nunca 500). */
export const crudIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
});
