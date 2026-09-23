import { nextDocumentNumber } from '../../../core/numbering/numbering.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
// FK de usuario (composición FASE 8): Service → Identity, nunca al revés.
import { findUserInTenant } from '../../identity/index.js';
import {
  TICKET_PREFIX,
  toPublicTicket,
  type PublicTicket,
  type TicketPriority,
  type TicketStatus,
} from '../domain/entities/ticket.js';
import {
  canArchive,
  canRestore,
  canTicketTransition,
  defaultTicketPriority,
  isTicketTerminal,
} from '../domain/rules/ticket-rules.js';
import {
  ticketRepo,
  type TicketListFilter,
} from '../infrastructure/repositories/ticket-repository.js';

/**
 * Casos de uso de tickets de soporte (FASE 18). `tenantId` SIEMPRE del JWT
 * (ADR-002); usuario desconocido → 400 (patrón CRM). El número `TK-*` lo
 * asigna el servidor (core/numbering `$inc` atómico, único por tenant).
 * Máquina de estados CON reapertura (`resolved → in_progress` limpia la nota
 * de resolución); `→ resolved` exige `resolution` NO vacía en el MISMO patch
 * (400); los terminales (`closed`/`cancelled`) congelan los campos de
 * negocio (409); `archived` es ortogonal (soft-delete con `ticket:delete`).
 */

export interface CreateTicketInput {
  readonly subject: string;
  readonly description?: string | undefined;
  readonly priority?: TicketPriority | undefined;
  readonly assigneeId?: string | undefined;
}

export interface PatchTicketInput {
  readonly subject?: string | undefined;
  readonly description?: string | null | undefined;
  readonly priority?: TicketPriority | undefined;
  readonly assigneeId?: string | null | undefined;
  readonly resolution?: string | null | undefined;
  readonly status?: TicketStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface TicketListQuery {
  readonly page: number;
  readonly limit: number;
  readonly status?: TicketStatus | undefined;
  readonly priority?: TicketPriority | undefined;
  readonly assigneeId?: string | undefined;
  readonly archived?: boolean | undefined;
}

export interface TicketPage {
  readonly items: readonly PublicTicket[];
  readonly total: number;
}

/** Campos de negocio: congelados en estados terminales (`closed`/`cancelled`). */
const BUSINESS_FIELDS = ['subject', 'description', 'priority', 'assigneeId', 'resolution'] as const;

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** `assigneeId` debe existir en el tenant (desconocido → 400, como CRM). */
async function assertAssignee(tenantId: string, userId: string): Promise<void> {
  const user = await findUserInTenant(tenantId, userId);
  if (user === null) {
    throw new ValidationError('Unknown user', { user: userId });
  }
}

export async function createTicket(
  tenantId: string,
  input: CreateTicketInput,
): Promise<PublicTicket> {
  // `number` lo asigna SIEMPRE el servidor (core/numbering `$inc` atómico),
  // serie `ticket` con reset anual: TK-YYYY-000001.
  const payload: Record<string, unknown> = {
    number: await nextDocumentNumber(tenantId, 'ticket', TICKET_PREFIX),
    subject: input.subject, // zod ya aplicó `.trim()` (min sobre el recortado)
    description: trimOrNull(input.description),
    status: 'open',
    priority: input.priority ?? defaultTicketPriority(),
    assigneeId: null,
    resolution: null,
  };
  if (input.assigneeId !== undefined) {
    await assertAssignee(tenantId, input.assigneeId);
    payload.assigneeId = input.assigneeId;
  }
  const ticket = await ticketRepo.create(tenantId, payload);
  return toPublicTicket(ticket);
}

export async function listTickets(tenantId: string, query: TicketListQuery): Promise<TicketPage> {
  const filter: TicketListFilter = {
    status: query.status,
    priority: query.priority,
    assigneeId: query.assigneeId,
    archived: query.archived,
  };
  const page = await ticketRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map((ticket) => toPublicTicket(ticket)), total: page.total };
}

export async function getTicket(tenantId: string, id: string): Promise<PublicTicket> {
  const ticket = await ticketRepo.findById(tenantId, id);
  if (ticket === null) {
    throw new NotFoundError();
  }
  return toPublicTicket(ticket);
}

export async function updateTicket(
  tenantId: string,
  id: string,
  input: PatchTicketInput,
): Promise<PublicTicket> {
  const current = await ticketRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }

  const requested = BUSINESS_FIELDS.filter((field) => input[field] !== undefined);
  if (requested.length > 0 && isTicketTerminal(current.status)) {
    throw new ConflictError('Only non-terminal tickets can be edited');
  }

  const set: Record<string, unknown> = {};
  if (input.subject !== undefined) {
    set.subject = input.subject; // zod `.trim()`: en blanco → 400 antes de aquí
  }
  if (input.description !== undefined) {
    set.description = trimOrNull(input.description);
  }
  if (input.priority !== undefined) {
    set.priority = input.priority;
  }
  if (input.assigneeId !== undefined) {
    if (input.assigneeId === null) {
      set.assigneeId = null;
    } else {
      await assertAssignee(tenantId, input.assigneeId);
      set.assigneeId = input.assigneeId;
    }
  }
  if (input.resolution !== undefined) {
    set.resolution = trimOrNull(input.resolution);
  }

  if (input.status !== undefined) {
    if (input.status === current.status) {
      throw new ConflictError('Status is already the requested one');
    }
    if (!canTicketTransition(current.status, input.status)) {
      throw new ConflictError('Invalid status transition');
    }
    if (input.status === 'resolved') {
      // La NOTA de resolución debe venir en ESTE mismo patch (no sirve un
      // borrador guardado antes): resolver es una acción explícita.
      const provided = input.resolution !== undefined ? trimOrNull(input.resolution) : null;
      if (provided === null) {
        throw new ValidationError('Resolution is required to resolve a ticket');
      }
    }
    if (input.status === 'in_progress' && current.status === 'resolved') {
      // Reabrir ⇒ la resolución anterior caduca (la próxima debe ser nueva).
      if (set.resolution === undefined) {
        set.resolution = null;
      }
    }
    set.status = input.status;
  }

  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Ticket is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Ticket is not archived');
    }
    set.archived = input.archived;
  }

  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await ticketRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicTicket(updated);
}

/** DELETE = soft-delete: marca `archived` (doble archive → 409). */
export async function archiveTicket(tenantId: string, id: string): Promise<PublicTicket> {
  const current = await ticketRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Ticket is already archived');
  }
  const archived = await ticketRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicTicket(archived);
}
