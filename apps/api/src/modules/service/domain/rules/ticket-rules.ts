/**
 * Reglas puras del dominio Service (FASE 18): máquina de estados de soporte
 * (con reapertura `resolved → in_progress` y cierre/cancelación terminales),
 * archivado, prioridad por defecto y SLA derivado (horas de reloj — PARTIAL:
 * sin calendario laboral).
 */
import type { TicketPriority, TicketStatus } from '../entities/ticket.js';

/**
 * Transiciones SOLO vía `PATCH {status}` con `ticket:update` (409 en
 * repetido/salto inválido, patrón proyectos/manufacturing). `resolved` NO es
 * terminal: se puede reabrir (`→ in_progress`, limpiando la nota) o cerrar
 * (`→ closed`); `closed` y `cancelled` no salen.
 */
export const TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  open: ['in_progress', 'resolved', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  resolved: ['in_progress', 'closed'],
  closed: [],
  cancelled: [],
};

export function canTicketTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from].includes(to);
}

/** Terminal = sin transiciones de salida (los campos de negocio congelan). */
export function isTicketTerminal(status: TicketStatus): boolean {
  return TICKET_TRANSITIONS[status].length === 0;
}

/** Soft-delete con `ticket:delete`: archivar/restore solo en un sentido. */
export function canArchive(archived: boolean): boolean {
  return !archived;
}

export function canRestore(archived: boolean): boolean {
  return archived;
}

/** SLA en horas de reloj por prioridad (vence = creación + SLA). */
export const TICKET_SLA_HOURS: Record<TicketPriority, number> = {
  urgent: 4,
  high: 8,
  normal: 24,
  low: 72,
};

export function defaultTicketPriority(): TicketPriority {
  return 'normal';
}

/** Vencimiento del SLA derivado (puro; se recalcula al cambiar prioridad). */
export function computeDueAt(createdAt: Date, priority: TicketPriority): Date {
  return new Date(createdAt.getTime() + TICKET_SLA_HOURS[priority] * 3_600_000);
}

export const SUBJECT_MAX = 120;
export const DESCRIPTION_MAX = 500;
export const RESOLUTION_MAX = 500;
