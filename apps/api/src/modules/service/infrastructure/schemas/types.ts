import type { Types } from 'mongoose';
import type { TicketPriority, TicketStatus } from '../../domain/entities/ticket.js';

/**
 * Documento de la única colección del módulo (`tickets`). `null` = campo
 * opcional limpiado vía PATCH (descripción/resolución/FK); `undefined` =
 * nunca escrito. `assigneeId` es ObjectId en Mongo y string en el dominio
 * (único punto de casteo: mapper del repositorio). `number` es el
 * `TK-YYYY-000001` único por tenant; `dueAt` no existe en el documento
 * (derivado al exponer).
 */
export interface TicketDoc {
  _id: Types.ObjectId;
  tenantId: string;
  number: string;
  subject: string;
  description?: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId?: Types.ObjectId | null;
  resolution?: string | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}
