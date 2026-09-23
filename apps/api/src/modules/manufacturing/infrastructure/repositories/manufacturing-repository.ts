import { Types, type Model } from 'mongoose';
import { ConflictError } from '../../../../core/errors/app-error.js';
import type { Bom } from '../../domain/entities/bom.js';
import type { ProductionOrder, ProductionStatus } from '../../domain/entities/production-order.js';
import { BomModel, ProductionOrderModel } from '../schemas/collections.js';
import type { BomDoc, ProductionOrderDoc } from '../schemas/types.js';

/**
 * Repositorio Manufacturing — único camino a MongoDB del módulo (2
 * colecciones). TODA operación filtra por `tenantId` (nunca llega del
 * cliente, ADR-002). Único punto de casteo: payload/$set de create/update y
 * ObjectId en filtros/mappers.
 */

export interface BomListFilter {
  readonly archived?: boolean | undefined;
}

export interface OrderListFilter {
  readonly status?: ProductionStatus | undefined;
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

function mapBom(doc: BomDoc): Bom {
  return {
    id: String(doc._id),
    tenantId: doc.tenantId,
    code: doc.code,
    name: doc.name,
    productId: String(doc.productId),
    lines: doc.lines.map((line) => ({
      productId: String(line.productId),
      quantity: line.quantity,
    })),
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapOrder(doc: ProductionOrderDoc): ProductionOrder {
  return {
    id: String(doc._id),
    tenantId: doc.tenantId,
    number: doc.number,
    productId: String(doc.productId),
    quantity: doc.quantity,
    warehouseId: String(doc.warehouseId),
    bomId: doc.bomId === null ? null : String(doc.bomId),
    lines: doc.lines.map((line) => ({
      productId: String(line.productId),
      quantity: line.quantity,
    })),
    status: doc.status,
    notes: doc.notes ?? null,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Listado paginado desc con `createdAt` + `_id` como desempate estable. */
async function paged<TDoc, TEntity>(
  model: Model<TDoc>,
  tenantId: string,
  extra: Record<string, unknown>,
  page: number,
  limit: number,
  map: (doc: TDoc) => TEntity,
): Promise<RepoPage<TEntity>> {
  const skip = (page - 1) * limit;
  const mongoFilter = { tenantId, ...extra };
  const [docs, total] = await Promise.all([
    model.find(mongoFilter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(mongoFilter),
  ]);
  return {
    items: docs.map((doc) => map(doc as unknown as TDoc)),
    total,
  };
}

export interface BomRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Bom>;
  findById(tenantId: string, id: string): Promise<Bom | null>;
  list(
    tenantId: string,
    filter: BomListFilter,
    page: number,
    limit: number,
  ): Promise<RepoPage<Bom>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<Bom | null>;
}

export interface OrderRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<ProductionOrder>;
  findById(tenantId: string, id: string): Promise<ProductionOrder | null>;
  list(
    tenantId: string,
    filter: OrderListFilter,
    page: number,
    limit: number,
  ): Promise<RepoPage<ProductionOrder>>;
  update(
    tenantId: string,
    id: string,
    set: Record<string, unknown>,
  ): Promise<ProductionOrder | null>;
}

export const bomRepo: BomRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await BomModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as BomDoc);
      return mapBom(doc.toObject() as unknown as BomDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('Code already exists');
      }
      throw error;
    }
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await BomModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapBom(doc as unknown as BomDoc);
  },

  async list(tenantId, filter, page, limit) {
    return paged(
      BomModel,
      tenantId,
      filter.archived !== undefined ? { archived: filter.archived } : {},
      page,
      limit,
      (doc) => mapBom(doc as unknown as BomDoc),
    );
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await BomModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), tenantId },
      { $set: set as Record<string, never> },
      { returnDocument: 'after' },
    ).lean();
    return doc === null ? null : mapBom(doc as unknown as BomDoc);
  },
};

export const orderRepo: OrderRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await ProductionOrderModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as ProductionOrderDoc);
      return mapOrder(doc.toObject() as unknown as ProductionOrderDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('Number already in use');
      }
      throw error;
    }
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await ProductionOrderModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId,
    }).lean();
    return doc === null ? null : mapOrder(doc as unknown as ProductionOrderDoc);
  },

  async list(tenantId, filter, page, limit) {
    return paged(
      ProductionOrderModel,
      tenantId,
      {
        ...(filter.status !== undefined ? { status: filter.status } : {}),
        ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
      },
      page,
      limit,
      (doc) => mapOrder(doc as unknown as ProductionOrderDoc),
    );
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await ProductionOrderModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), tenantId },
      { $set: set as Record<string, never> },
      { returnDocument: 'after' },
    ).lean();
    return doc === null ? null : mapOrder(doc as unknown as ProductionOrderDoc);
  },
};
