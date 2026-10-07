import { Types, type Model } from 'mongoose';
import { ConflictError } from '../../../../core/errors/app-error.js';
import type { Product } from '../../domain/entities/product.js';
import type { MovementType, StockBalance, StockMovement } from '../../domain/entities/stock.js';
import type {
  CountLine,
  CountStatus,
  InventoryCount,
  StockTransfer,
  TransferLine,
  TransferStatus,
} from '../../domain/entities/stock-documents.js';
import {
  CountModel,
  MovementModel,
  ProductModel,
  StockModel,
  TransferModel,
} from '../schemas/collections.js';
import type { CountDoc, MovementDoc, ProductDoc, StockDoc, TransferDoc } from '../schemas/types.js';

/**
 * Repositorio Inventory — único camino a MongoDB del módulo (5 colecciones).
 * TODA operación filtra por `tenantId` (nunca llega del cliente, ADR-002).
 * Único punto de casteo: payload/$set de create/update y ObjectId en filtros.
 *
 * El saldo (`stock`) solo se modifica vía `applyDelta` con guardia atómica
 * (`qty ≥ −delta` en el propio filtro): una salida nunca puede dejar saldo
 * negativo aunque haya escrituras concurrentes.
 */

export interface ProductListFilter {
  readonly archived?: boolean | undefined;
}

export interface BalanceListFilter {
  readonly productId?: string | undefined;
  readonly warehouseId?: string | undefined;
}

export interface MovementListFilter {
  readonly productId?: string | undefined;
  readonly warehouseId?: string | undefined;
  readonly type?: MovementType | undefined;
}

export interface TransferListFilter {
  readonly status?: TransferStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface CountListFilter {
  readonly status?: CountStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface ProductRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Product>;
  findById(tenantId: string, id: string): Promise<Product | null>;
  list(
    tenantId: string,
    filter: ProductListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<Product>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<Product | null>;
}

export interface StockRepo {
  list(
    tenantId: string,
    filter: BalanceListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<StockBalance>>;
  getBalance(tenantId: string, productId: string, warehouseId: string): Promise<number>;
  /**
   * Aplica `delta` (con signo) al saldo. Si `delta < 0` la guardia `qty ≥ −delta`
   * va en el filtro: saldo insuficiente → `null` (el servicio responde 422).
   * Si `delta ≥ 0` hace upsert (primer movimiento crea el saldo).
   * Devuelve el saldo resultante (`returnDocument: 'after'`).
   */
  applyDelta(
    tenantId: string,
    productId: string,
    warehouseId: string,
    delta: number,
  ): Promise<number | null>;
  createMovement(tenantId: string, payload: Record<string, unknown>): Promise<StockMovement>;
  getMovement(tenantId: string, id: string): Promise<StockMovement | null>;
  listMovements(
    tenantId: string,
    filter: MovementListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<StockMovement>>;
}

export interface TransferRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<StockTransfer>;
  findById(tenantId: string, id: string): Promise<StockTransfer | null>;
  list(
    tenantId: string,
    filter: TransferListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<StockTransfer>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<StockTransfer | null>;
}

export interface CountRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<InventoryCount>;
  findById(tenantId: string, id: string): Promise<InventoryCount | null>;
  list(
    tenantId: string,
    filter: CountListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<InventoryCount>>;
  update(
    tenantId: string,
    id: string,
    set: Record<string, unknown>,
  ): Promise<InventoryCount | null>;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

const oid = (value: string): Types.ObjectId => new Types.ObjectId(value);

function optionalRef(value: Types.ObjectId | string | null | undefined): string | null {
  return value === undefined || value === null ? null : value.toString();
}

function toRef(value: Types.ObjectId | string): string {
  return value.toString();
}

// --- Mappers (doc → entidad de dominio; única salida sin tenantId-oculto) ---

function mapProduct(doc: ProductDoc): Product {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    code: doc.code,
    name: doc.name,
    description: doc.description ?? null,
    imageUrl: doc.imageUrl ?? null,
    unit: doc.unit,
    cost: doc.cost ?? null,
    price: doc.price ?? null,
    minStock: doc.minStock ?? null,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapBalance(doc: StockDoc): StockBalance {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    productId: doc.productId.toString(),
    warehouseId: doc.warehouseId.toString(),
    qty: doc.qty,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapMovement(doc: MovementDoc): StockMovement {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    productId: doc.productId.toString(),
    warehouseId: doc.warehouseId.toString(),
    type: doc.type,
    qty: doc.qty,
    balanceAfter: doc.balanceAfter,
    sourceType: doc.sourceType ?? null,
    sourceId: optionalRef(doc.sourceId),
    reason: doc.reason ?? null,
    createdAt: doc.createdAt,
  };
}

function mapTransfer(doc: TransferDoc): StockTransfer {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    number: doc.number,
    fromWarehouseId: doc.fromWarehouseId.toString(),
    toWarehouseId: doc.toWarehouseId.toString(),
    lines: (doc.lines ?? []).map((line): TransferLine => ({
      productId: toRef(line.productId),
      quantity: line.quantity,
    })),
    status: doc.status,
    notes: doc.notes ?? null,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapCount(doc: CountDoc): InventoryCount {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    number: doc.number,
    warehouseId: doc.warehouseId.toString(),
    lines: (doc.lines ?? []).map((line): CountLine => ({
      productId: toRef(line.productId),
      countedQty: line.countedQty,
    })),
    status: doc.status,
    notes: doc.notes ?? null,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const productModel: Model<ProductDoc> = ProductModel;
const stockModel: Model<StockDoc> = StockModel;
const movementModel: Model<MovementDoc> = MovementModel;
const transferModel: Model<TransferDoc> = TransferModel;
const countModel: Model<CountDoc> = CountModel;

async function listWithCount<TDoc, TEntity>(
  model: Model<TDoc>,
  filter: Record<string, unknown>,
  page: number,
  limit: number,
  map: (doc: TDoc) => TEntity,
): Promise<ListPage<TEntity>> {
  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    model.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(filter),
  ]);
  return {
    items: docs.map((doc) => map(doc as TDoc)),
    total,
  };
}

export const productRepo: ProductRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await productModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as ProductDoc);
      return mapProduct(doc.toObject() as unknown as ProductDoc);
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
    const doc = await productModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapProduct(doc as unknown as ProductDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
    };
    return listWithCount(productModel, mongoFilter, page, limit, mapProduct);
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await productModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapProduct(doc as unknown as ProductDoc);
  },
};

export const stockRepo: StockRepo = {
  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.productId !== undefined ? { productId: oid(filter.productId) } : {}),
      ...(filter.warehouseId !== undefined ? { warehouseId: oid(filter.warehouseId) } : {}),
    };
    return listWithCount(stockModel, mongoFilter, page, limit, mapBalance);
  },

  async getBalance(tenantId, productId, warehouseId) {
    const doc = await stockModel
      .findOne({ tenantId, productId: oid(productId), warehouseId: oid(warehouseId) })
      .lean();
    return doc === null ? 0 : (doc as unknown as StockDoc).qty;
  },

  async applyDelta(tenantId, productId, warehouseId, delta) {
    const base = { tenantId, productId: oid(productId), warehouseId: oid(warehouseId) };
    if (delta < 0) {
      // Guardia atómica: el filtro exige saldo suficiente para la salida.
      const doc = await stockModel
        .findOneAndUpdate(
          { ...base, qty: { $gte: -delta } },
          { $inc: { qty: delta } },
          { returnDocument: 'after' },
        )
        .lean();
      return doc === null ? null : (doc as unknown as StockDoc).qty;
    }
    try {
      // `$inc` solo: en upsert inicializa `qty` con el propio incremento.
      const doc = await stockModel
        .findOneAndUpdate(base, { $inc: { qty: delta } }, { returnDocument: 'after', upsert: true })
        .lean();
      return (doc as unknown as StockDoc).qty;
    } catch (error) {
      // Carrera de upserts concurrentes sobre el mismo (producto, almacén):
      // el índice único gana uno; se reintenta como actualización normal.
      if (isDuplicateKey(error)) {
        const doc = await stockModel
          .findOneAndUpdate({ ...base }, { $inc: { qty: delta } }, { returnDocument: 'after' })
          .lean();
        return doc === null ? null : (doc as unknown as StockDoc).qty;
      }
      throw error;
    }
  },

  async createMovement(tenantId, payload) {
    const doc = await movementModel.create({
      tenantId,
      ...payload,
    } as unknown as MovementDoc);
    return mapMovement(doc.toObject() as unknown as MovementDoc);
  },

  async getMovement(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await movementModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapMovement(doc as unknown as MovementDoc);
  },

  listMovements(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.productId !== undefined ? { productId: oid(filter.productId) } : {}),
      ...(filter.warehouseId !== undefined ? { warehouseId: oid(filter.warehouseId) } : {}),
      ...(filter.type !== undefined ? { type: filter.type } : {}),
    };
    return listWithCount(movementModel, mongoFilter, page, limit, mapMovement);
  },
};

export const transferRepo: TransferRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await transferModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as TransferDoc);
      return mapTransfer(doc.toObject() as unknown as TransferDoc);
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
    const doc = await transferModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapTransfer(doc as unknown as TransferDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.status !== undefined ? { status: filter.status } : {}),
      ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
    };
    return listWithCount(transferModel, mongoFilter, page, limit, mapTransfer);
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await transferModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapTransfer(doc as unknown as TransferDoc);
  },
};

export const countRepo: CountRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await countModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as CountDoc);
      return mapCount(doc.toObject() as unknown as CountDoc);
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
    const doc = await countModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapCount(doc as unknown as CountDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.status !== undefined ? { status: filter.status } : {}),
      ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
    };
    return listWithCount(countModel, mongoFilter, page, limit, mapCount);
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await countModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapCount(doc as unknown as CountDoc);
  },
};
