import type { Router } from 'express';
import {
  createCrudRouter,
  type CrudListQueryBase,
  type CrudPatchBase,
  type CrudResourceSpec,
  type CrudRouterDeps,
} from '../../../../core/http/crud-router.js';
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

/** Deps y spec reutilizan la fábrica genérica de core (FASE 8). */
export type CrmRouterDeps = CrudRouterDeps;

export type CrmResourceSpec<
  TPublic extends { readonly id: string },
  TCreate,
  TPatch extends CrudPatchBase,
  TQuery extends CrudListQueryBase,
> = CrudResourceSpec<TPublic, TCreate, TPatch, TQuery>;

/** Rutas de API por recurso (kebab-case, plural — convenciones §1). */
export const CRM_ROUTE_PATHS = {
  customer: 'customers',
  contact: 'contacts',
  lead: 'leads',
  opportunity: 'opportunities',
  activity: 'activities',
} as const;

export type CrmEntity = keyof typeof CRM_ROUTE_PATHS;

/**
 * CRUD de los 5 recursos de CRM sobre la fábrica de core (autorización
 * `<recurso>:read|create|update|delete`, denegación por defecto; auditoría de
 * cada mutación). DELETE = soft-delete (`archived: true`).
 */
export function createCrmRouter<
  TPublic extends { readonly id: string },
  TCreate,
  TPatch extends CrudPatchBase,
  TQuery extends CrudListQueryBase,
>(deps: CrmRouterDeps, spec: CrmResourceSpec<TPublic, TCreate, TPatch, TQuery>): Router {
  return createCrudRouter(deps, spec);
}

const customerSpec: CrudResourceSpec<
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

const contactSpec: CrudResourceSpec<
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

const leadSpec: CrudResourceSpec<
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

const opportunitySpec: CrudResourceSpec<
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

const activitySpec: CrudResourceSpec<
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
