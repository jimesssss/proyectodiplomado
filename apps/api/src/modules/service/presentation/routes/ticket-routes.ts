import type { Router } from 'express';
import {
  createCrudRouter,
  type CrudListQueryBase,
  type CrudPatchBase,
  type CrudResourceSpec,
  type CrudRouterDeps,
} from '../../../../core/http/crud-router.js';
import {
  archiveTicket,
  createTicket,
  getTicket,
  listTickets,
  updateTicket,
  type CreateTicketInput,
  type PatchTicketInput,
  type TicketListQuery,
} from '../../application/ticket-service.js';
import type { PublicTicket } from '../../domain/entities/ticket.js';
import {
  createTicketBodySchema,
  patchTicketBodySchema,
  ticketListQuerySchema,
} from '../validators/ticket-validators.js';

export type ServiceRouterDeps = CrudRouterDeps;

/**
 * Único montaje del módulo bajo `/api/v1/tickets` (convenciones §4 fila 18).
 * El catálogo v1 SÍ define `ticket:delete` (sin bump de versión, pv=2
 * vigente) → DELETE publicado como **soft-delete** (patrón CRM/product:
 * marca `archived`, doble archive → 409); las transiciones de la máquina de
 * estados (incluida la REAPERTURA y `→ resolved` con nota obligatoria) van
 * por `PATCH {status}` con `ticket:update`.
 */
export const SERVICE_ROUTE_PATHS = {
  tickets: '/api/v1/tickets',
} as const;

function ticketSpec(): CrudResourceSpec<
  PublicTicket,
  CreateTicketInput,
  PatchTicketInput & CrudPatchBase,
  TicketListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'ticket:read',
      create: 'ticket:create',
      update: 'ticket:update',
      delete: 'ticket:delete',
    },
    entity: 'ticket',
    createSchema: createTicketBodySchema,
    patchSchema: patchTicketBodySchema,
    listQuerySchema: ticketListQuerySchema,
    handlers: {
      create: (tenantId, body) => createTicket(tenantId, body),
      list: (tenantId, query) => listTickets(tenantId, query),
      get: (tenantId, id) => getTicket(tenantId, id),
      update: (tenantId, id, patch) => updateTicket(tenantId, id, patch),
      archive: (tenantId, id) => archiveTicket(tenantId, id),
    },
  };
}

/** El montaje del módulo, listo para la composition root. */
export function createServiceRouters(
  deps: ServiceRouterDeps,
): readonly { path: string; router: Router }[] {
  return [{ path: SERVICE_ROUTE_PATHS.tickets, router: createCrudRouter(deps, ticketSpec()) }];
}
