import { Types } from 'mongoose';
import type { AiInteraction, AiInteractionStatus } from '../../domain/entities/ai-interaction.js';
import { AiInteractionModel } from '../schemas/collections.js';
import type { AiInteractionDoc } from '../schemas/types.js';

/**
 * Repositorio AI — único camino a MongoDB del módulo (colección
 * `aiInteractions`). SOLO `create` + lecturas paginadas: el registro de
 * gobernanza es INMUTABLE (no hay `update` ni `delete` a propósito).
 * Toda operación filtra por `tenantId` (SIEMPRE del JWT, ADR-002).
 */

export interface InteractionListFilter {
  readonly tool?: string | undefined;
  readonly status?: AiInteractionStatus | undefined;
}

export interface RepoPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

function mapInteraction(doc: AiInteractionDoc): AiInteraction {
  return {
    id: String(doc._id),
    tenantId: doc.tenantId,
    requestId: doc.requestId,
    userId: doc.userId,
    prompt: doc.prompt ?? null,
    tool: doc.tool,
    args: (doc.args ?? {}) as Record<string, unknown>,
    result: (doc.result ?? null) as object | null,
    error: doc.error ?? null,
    status: doc.status,
    latencyMs: doc.latencyMs,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export interface AiRepo {
  /** Registra UNA interacción (completed o failed). */
  create(tenantId: string, payload: Record<string, unknown>): Promise<AiInteraction>;
  findById(tenantId: string, id: string): Promise<AiInteraction | null>;
  list(
    tenantId: string,
    filter: InteractionListFilter,
    page: number,
    limit: number,
  ): Promise<RepoPage<AiInteraction>>;
}

export const aiRepo: AiRepo = {
  async create(tenantId, payload) {
    const doc = await AiInteractionModel.create({
      tenantId,
      ...payload,
    } as unknown as AiInteractionDoc);
    return mapInteraction(doc.toObject() as unknown as AiInteractionDoc);
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await AiInteractionModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId,
    }).lean();
    return doc === null ? null : mapInteraction(doc as unknown as AiInteractionDoc);
  },

  async list(tenantId, filter, page, limit) {
    const skip = (page - 1) * limit;
    const mongoFilter = {
      tenantId,
      ...(filter.tool !== undefined ? { tool: filter.tool } : {}),
      ...(filter.status !== undefined ? { status: filter.status } : {}),
    };
    const [docs, total] = await Promise.all([
      AiInteractionModel.find(mongoFilter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AiInteractionModel.countDocuments(mongoFilter),
    ]);
    return {
      items: docs.map((doc) => mapInteraction(doc as unknown as AiInteractionDoc)),
      total,
    };
  },
};
