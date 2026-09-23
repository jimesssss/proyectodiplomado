/**
 * Superficie pública del módulo Service (FASE 18).
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 */
export {
  createServiceRouters,
  SERVICE_ROUTE_PATHS,
  type ServiceRouterDeps,
} from './presentation/routes/ticket-routes.js';
export {
  archiveTicket,
  createTicket,
  getTicket,
  listTickets,
  updateTicket,
} from './application/ticket-service.js';
export {
  TICKET_PREFIX,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  toPublicTicket,
  type Ticket,
  type TicketPriority,
  type TicketStatus,
  type PublicTicket,
} from './domain/entities/ticket.js';
export {
  TICKET_SLA_HOURS,
  TICKET_TRANSITIONS,
  canTicketTransition,
  computeDueAt,
  isTicketTerminal,
} from './domain/rules/ticket-rules.js';
