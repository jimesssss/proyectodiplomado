import { Types, type Model } from 'mongoose';
import { ConflictError } from '../../../../core/errors/app-error.js';
import type { Ticket, TicketPriority, TicketStatus } from '../../domain/entities/ticket.js';
import { TicketModel } from '../schemas/collections.js';
import type { TicketDoc } from '../schemas/types.js';

/**
 * Repositorio Service — único camino a MongoDB del módulo (1 colección
 * `tickets`). TODA operación filtra por `tenantId` (nunca llega del cliente,
 * ADR-002). Único punto de casteo: payload/$set de create/update y ObjectId
 * en filtros/mappers.
 */

export interface TicketListFilter {
  readonly status?: TicketStatus | undefined;
  readonly priority?: TicketPriority | undefined;
  readonly assigneeId?: string | undefined;
  readonly archived?: boolean | undefined;
}

export interface RepoPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function mapTicket(doc: TicketDoc): Ticket {
  return {
    id: String(doc._id),
    tenantId: doc.tenantId,
    number: doc.number,
    subject: doc.subject,
    description: doc.description ?? null,
    status: doc.status,
    priority: doc.priority,
    assigneeId: doc.assigneeId == null ? null : String(doc.assigneeId),
    resolution: doc.resolution ?? null,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Listado paginado desc con `createdAt` + `_id` como desempate estable. */
async function paged(
  model: Model<TicketDoc>,
  tenantId: string,
  extra: Record<string, unknown>,
  page: number,
  limit: number,
): Promise<RepoPage<Ticket>> {
  const skip = (page - 1) * limit;
  const mongoFilter = { tenantId, ...extra };
  const [docs, total] = await Promise.all([
    model.find(mongoFilter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(mongoFilter),
  ]);
  return {
    items: docs.map((doc) => mapTicket(doc as unknown as TicketDoc)),
    total,
  };
}

export interface TicketRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Ticket>;
  findById(tenantId: string, id: string): Promise<Ticket | null>;
  list(
    tenantId: string,
    filter: TicketListFilter,
    page: number,
    limit: number,
  ): Promise<RepoPage<Ticket>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<Ticket | null>;
}

export const ticketRepo: TicketRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await TicketModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as TicketDoc);
      return mapTicket(doc.toObject() as unknown as TicketDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('Number already exists');
      }
      throw error;
    }
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await TicketModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapTicket(doc as unknown as TicketDoc);
  },

  async list(tenantId, filter, page, limit) {
    return paged(
      TicketModel,
      tenantId,
      {
        ...(filter.status !== undefined ? { status: filter.status } : {}),
        ...(filter.priority !== undefined ? { priority: filter.priority } : {}),
        ...(filter.assigneeId !== undefined ? { assigneeId: filter.assigneeId } : {}),
        ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
      },
      page,
      limit,
    );
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await TicketModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), tenantId },
      { $set: set as Record<string, never> },
      { returnDocument: 'after' },
    ).lean();
    return doc === null ? null : mapTicket(doc as unknown as TicketDoc);
  },
};
