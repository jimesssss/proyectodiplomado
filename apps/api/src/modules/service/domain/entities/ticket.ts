/**
 * Entidad Ticket (FASE 18 — módulo Service). Soporte/mesa de ayuda con
 * máquina de estados (incluye REAPERTURA: `resolved → in_progress`),
 * prioridad con SLA y nota de resolución obligatoria al resolver. El número
 * `TK-YYYY-000001` lo asigna SIEMPRE el servidor (core/numbering, única por
 * tenant); `dueAt` NO se almacena: es derivado (createdAt + SLA de la
 * prioridad actual) y viaja solo en la proyección pública.
 */
import { computeDueAt } from '../rules/ticket-rules.js';

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'cancelled'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/** Prefijo de numeración (serie `ticket`, reset anual). */
export const TICKET_PREFIX = 'TK';

export interface Ticket {
  readonly id: string;
  readonly tenantId: string;
  readonly number: string;
  readonly subject: string;
  readonly description: string | null;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly assigneeId: string | null;
  readonly resolution: string | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PublicTicket extends Omit<Ticket, 'tenantId'> {
  /** SLA derivado (no persistido): `createdAt` + horas de la prioridad actual. */
  readonly dueAt: Date;
}

export function toPublicTicket(ticket: Ticket): PublicTicket {
  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    assigneeId: ticket.assigneeId,
    resolution: ticket.resolution,
    archived: ticket.archived,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    dueAt: computeDueAt(ticket.createdAt, ticket.priority),
  };
}
