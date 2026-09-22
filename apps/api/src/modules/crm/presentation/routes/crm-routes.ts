import type { Permission } from '@erp/permissions';
import { Router, type RequestHandler } from 'express';
import type { ZodType } from 'zod';
import type { JwtService } from '../../../../core/auth/jwt.js';
import {
  requireAuth,
  type AuthUser,
  type SessionChecker,
} from '../../../../core/auth/middleware.js';
import { requirePermission } from '../../../../core/auth/require-permission.js';
import { auditFromRequest } from '../../../../core/audit/audit.js';
import { successListResponse, successResponse } from '../../../../core/http/envelope.js';
import { validate } from '../../../../core/validation/validate.js';
import {
  archiveActivity,
  createActivity,
  getActivity,
  listActivities,
  updateActivity,
} from '../../application/activity-service.js';
import {
  archiveContact,
  createContact,
  getContact,
  listContacts,
  updateContact,
} from '../../application/contact-service.js';
import {
  archiveCustomer,
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from '../../application/customer-service.js';
import {
  archiveLead,
  createLead,
  getLead,
  listLeads,
  updateLead,
} from '../../application/lead-service.js';
import {
  archiveOpportunity,
  createOpportunity,
  getOpportunity,
  listOpportunities,
  updateOpportunity,
} from '../../application/opportunity-service.js';
import type { PublicActivity } from '../../domain/entities/activity.js';
import type { PublicContact } from '../../domain/entities/contact.js';
import type { PublicCustomer } from '../../domain/entities/customer.js';
import type { PublicLead } from '../../domain/entities/lead.js';
import type { PublicOpportunity } from '../../domain/entities/opportunity.js';
import {
  activityListQuerySchema,
  contactListQuerySchema,
  createActivityBodySchema,
  createContactBodySchema,
  createCustomerBodySchema,
  createLeadBodySchema,
  createOpportunityBodySchema,
  crmIdParamsSchema,
  customerListQuerySchema,
  leadListQuerySchema,
  opportunityListQuerySchema,
  patchActivityBodySchema,
  patchContactBodySchema,
  patchCustomerBodySchema,
  patchLeadBodySchema,
  patchOpportunityBodySchema,
} from '../validators/crm-validators.js';
import { createSearchRouter } from './search-routes.js';

export interface CrmRouterDeps {
  readonly jwt: JwtService;
  readonly isSessionActive: SessionChecker;
}

/** Rutas de API por recurso (kebab-case, plural — convenciones §1). */
export const CRM_ROUTE_PATHS = {
  customer: 'customers',
  contact: 'contacts',
  lead: 'leads',
  opportunity: 'opportunities',
  activity: 'activities',
} as const;

export type CrmEntity = keyof typeof CRM_ROUTE_PATHS;

interface CrmListQueryBase {
  readonly page: number;
  readonly limit: number;
}

/** Subconjunto de todo patch de CRM usado por la capa de rutas (auditoría). */
interface CrmPatchBase {
  readonly archived?: boolean | undefined;
  readonly status?: string | undefined;
  readonly stage?: string | undefined;
}

export interface CrmListResult<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface CrmHandlers<
  TPublic extends { readonly id: string },
  TCreate,
  TPatch extends CrmPatchBase,
  TQuery extends CrmListQueryBase,
> {
  create(tenantId: string, body: TCreate): Promise<TPublic>;
  list(tenantId: string, query: TQuery): Promise<CrmListResult<TPublic>>;
  get(tenantId: string, id: string): Promise<TPublic>;
  update(tenantId: string, id: string, patch: TPatch): Promise<TPublic>;
  archive(tenantId: string, id: string): Promise<TPublic>;
}

export interface CrmResourceSpec<
  TPublic extends { readonly id: string },
  TCreate,
  TPatch extends CrmPatchBase,
  TQuery extends CrmListQueryBase,
> {
  readonly permissions: {
    readonly read: Permission;
    readonly create: Permission;
    readonly update: Permission;
    readonly delete: Permission;
  };
  /** Nombre canónico del recurso: `entityType` y prefijo de acciones de auditoría. */
  readonly entity: CrmEntity;
  readonly createSchema: ZodType;
  readonly patchSchema: ZodType;
  readonly listQuerySchema: ZodType;
  readonly handlers: CrmHandlers<TPublic, TCreate, TPatch, TQuery>;
}

function currentUser(req: { user?: AuthUser }): AuthUser {
  const user = req.user;
  if (user === undefined) {
    throw new Error('requireAuth should populate request.user');
  }
  return user;
}

function patchReason(patch: CrmPatchBase): string | undefined {
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

/**
 * CRUD genérico para los 5 recursos de CRM (una sola fábrica, UN set de
 * middlewares). Autorización RBAC (ADR-005): `<recurso>:read|create|update|delete`
 * con denegación por defecto. `tenantId` SIEMPRE del JWT; `:id` ajeno o
 * inexistente → 404 uniforme. DELETE = soft-delete (`archived: true`).
 * Toda mutación deja traza de auditoría (FASE 7 / ADR-006).
 */
export function createCrmRouter<
  TPublic extends { readonly id: string },
  TCreate,
  TPatch extends CrmPatchBase,
  TQuery extends CrmListQueryBase,
>(deps: CrmRouterDeps, spec: CrmResourceSpec<TPublic, TCreate, TPatch, TQuery>): Router {
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
    validate({ params: crmIdParamsSchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const entityFound = await spec.handlers.get(currentUser(req).tenantId, params.id);
      res.status(200).json(successResponse(req.requestId, entityFound));
    },
  );

  router.patch(
    '/:id',
    auth,
    requirePermission(spec.permissions.update),
    validate({ params: crmIdParamsSchema, body: spec.patchSchema }),
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

  router.delete(
    '/:id',
    auth,
    requirePermission(spec.permissions.delete),
    validate({ params: crmIdParamsSchema }),
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

  return router;
}

const customerSpec: CrmResourceSpec<
  PublicCustomer,
  Parameters<typeof createCustomer>[1],
  Parameters<typeof updateCustomer>[2],
  Parameters<typeof listCustomers>[1]
> = {
  permissions: {
    read: 'customer:read',
    create: 'customer:create',
    update: 'customer:update',
    delete: 'customer:delete',
  },
  entity: 'customer',
  createSchema: createCustomerBodySchema,
  patchSchema: patchCustomerBodySchema,
  listQuerySchema: customerListQuerySchema,
  handlers: {
    create: createCustomer,
    list: listCustomers,
    get: getCustomer,
    update: updateCustomer,
    archive: archiveCustomer,
  },
};

const contactSpec: CrmResourceSpec<
  PublicContact,
  Parameters<typeof createContact>[1],
  Parameters<typeof updateContact>[2],
  Parameters<typeof listContacts>[1]
> = {
  permissions: {
    read: 'contact:read',
    create: 'contact:create',
    update: 'contact:update',
    delete: 'contact:delete',
  },
  entity: 'contact',
  createSchema: createContactBodySchema,
  patchSchema: patchContactBodySchema,
  listQuerySchema: contactListQuerySchema,
  handlers: {
    create: createContact,
    list: listContacts,
    get: getContact,
    update: updateContact,
    archive: archiveContact,
  },
};

const leadSpec: CrmResourceSpec<
  PublicLead,
  Parameters<typeof createLead>[1],
  Parameters<typeof updateLead>[2],
  Parameters<typeof listLeads>[1]
> = {
  permissions: {
    read: 'lead:read',
    create: 'lead:create',
    update: 'lead:update',
    delete: 'lead:delete',
  },
  entity: 'lead',
  createSchema: createLeadBodySchema,
  patchSchema: patchLeadBodySchema,
  listQuerySchema: leadListQuerySchema,
  handlers: {
    create: createLead,
    list: listLeads,
    get: getLead,
    update: updateLead,
    archive: archiveLead,
  },
};

const opportunitySpec: CrmResourceSpec<
  PublicOpportunity,
  Parameters<typeof createOpportunity>[1],
  Parameters<typeof updateOpportunity>[2],
  Parameters<typeof listOpportunities>[1]
> = {
  permissions: {
    read: 'opportunity:read',
    create: 'opportunity:create',
    update: 'opportunity:update',
    delete: 'opportunity:delete',
  },
  entity: 'opportunity',
  createSchema: createOpportunityBodySchema,
  patchSchema: patchOpportunityBodySchema,
  listQuerySchema: opportunityListQuerySchema,
  handlers: {
    create: createOpportunity,
    list: listOpportunities,
    get: getOpportunity,
    update: updateOpportunity,
    archive: archiveOpportunity,
  },
};

const activitySpec: CrmResourceSpec<
  PublicActivity,
  Parameters<typeof createActivity>[1],
  Parameters<typeof updateActivity>[2],
  Parameters<typeof listActivities>[1]
> = {
  permissions: {
    read: 'activity:read',
    create: 'activity:create',
    update: 'activity:update',
    delete: 'activity:delete',
  },
  entity: 'activity',
  createSchema: createActivityBodySchema,
  patchSchema: patchActivityBodySchema,
  listQuerySchema: activityListQuerySchema,
  handlers: {
    create: createActivity,
    list: listActivities,
    get: getActivity,
    update: updateActivity,
    archive: archiveActivity,
  },
};

/**
 * Montajes del módulo CRM (los 5 recursos + búsqueda global), listos para la
 * composition root: `...createCrmRouters({ jwt, isSessionActive })`.
 */
export function createCrmRouters(deps: CrmRouterDeps): readonly { path: string; router: Router }[] {
  return [
    { path: `/api/v1/${CRM_ROUTE_PATHS.customer}`, router: createCrmRouter(deps, customerSpec) },
    { path: `/api/v1/${CRM_ROUTE_PATHS.contact}`, router: createCrmRouter(deps, contactSpec) },
    { path: `/api/v1/${CRM_ROUTE_PATHS.lead}`, router: createCrmRouter(deps, leadSpec) },
    {
      path: `/api/v1/${CRM_ROUTE_PATHS.opportunity}`,
      router: createCrmRouter(deps, opportunitySpec),
    },
    { path: `/api/v1/${CRM_ROUTE_PATHS.activity}`, router: createCrmRouter(deps, activitySpec) },
    { path: '/api/v1/search', router: createSearchRouter(deps) },
  ];
}
