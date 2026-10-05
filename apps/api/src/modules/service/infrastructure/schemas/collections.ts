import mongoose from 'mongoose';
import { Schema, model, type Model } from 'mongoose';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../../domain/entities/ticket.js';
import { DESCRIPTION_MAX, RESOLUTION_MAX, SUBJECT_MAX } from '../../domain/rules/ticket-rules.js';
import type { TicketDoc } from './types.js';

/**
 * Única colección del módulo Service: `tickets` (documento numerado + máquina
 * de estados de soporte con reapertura). Colección propia (ADR-003): se lista
 * y filtra independiente de la auditoría.
 */
export const TICKETS_COLLECTION = 'tickets';

const ticketSchema = new Schema<TicketDoc>(
  {
    tenantId: { type: String, required: true },
    number: { type: String, required: true },
    subject: { type: String, required: true, trim: true, maxlength: SUBJECT_MAX },
    description: { type: String, default: null, maxlength: DESCRIPTION_MAX },
    status: { type: String, required: true, enum: [...TICKET_STATUSES] },
    priority: { type: String, required: true, enum: [...TICKET_PRIORITIES], default: 'normal' },
    assigneeId: { type: Schema.Types.ObjectId, default: null },
    resolution: { type: String, default: null, maxlength: RESOLUTION_MAX },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: TICKETS_COLLECTION },
);

// Número de documento único POR tenant (ADR-002): duplicado → 409 en el repo.
ticketSchema.index({ tenantId: 1, number: 1 }, { unique: true });
// Listado por defecto: GET /tickets (desc por creación).
ticketSchema.index({ tenantId: 1, createdAt: -1 });
// Cola filtrada: GET /tickets?status= (p. ej. la de abiertos).
ticketSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
// Listado archivado: GET /tickets?archived=.
ticketSchema.index({ tenantId: 1, archived: 1, createdAt: -1 });
// Cola personal: GET /tickets?assigneeId= (pendientes de UN agente).
ticketSchema.index({ tenantId: 1, assigneeId: 1, createdAt: -1 });

function getModel<T>(name: string, schema: Schema<T>): Model<T> {
  const existing = mongoose.models[name] as Model<T> | undefined;
  if (existing !== undefined) {
    return existing;
  }
  return model<T>(name, schema);
}

export const TicketModel = getModel<TicketDoc>('ServiceTicket', ticketSchema);
