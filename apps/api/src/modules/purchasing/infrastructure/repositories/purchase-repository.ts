import { Types, type Model } from 'mongoose';
import { ConflictError } from '../../../../core/errors/app-error.js';
import type {
  PurchaseDocument,
  PurchaseKind,
  PurchaseLine,
  PurchaseStatus,
} from '../../domain/entities/purchase-document.js';
import type { Supplier } from '../../domain/entities/supplier.js';
import { PurchaseModel, SupplierModel } from '../schemas/collections.js';
import type { PurchaseDoc, SupplierDoc } from '../schemas/types.js';

/**
 * Repositorio Purchasing — único camino a MongoDB del módulo (colección
 * única `purchaseDocuments` + maestro `suppliers`). TODA operación filtra por
 * `tenantId` (nunca llega del cliente, ADR-002) y, en documentos, por `kind`
 * (una factura no se toca desde la ruta de órdenes). Único punto de casteo:
 * payload/$set de create/update.
 */

export interface PurchaseListFilter {
  readonly kind: PurchaseKind;
  readonly archived?: boolean | undefined;
  readonly status?: PurchaseStatus | undefined;
  readonly supplierId?: string | undefined;
  readonly orderId?: string | undefined;
  readonly requestId?: string | undefined;
  readonly invoiceId?: string | undefined;
}

export interface PurchaseListPage {
  readonly items: readonly PurchaseDocument[];
  readonly total: number;
}

export interface SupplierListFilter {
  readonly archived?: boolean | undefined;
}

export interface PurchaseRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<PurchaseDocument>;
  findById(tenantId: string, kind: PurchaseKind, id: string): Promise<PurchaseDocument | null>;
  list(
    tenantId: string,
    filter: PurchaseListFilter,
    page: number,
    limit: number,
  ): Promise<PurchaseListPage>;
  update(
    tenantId: string,
    kind: PurchaseKind,
    id: string,
    set: Record<string, unknown>,
  ): Promise<PurchaseDocument | null>;
}

export interface SupplierRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Supplier>;
  findById(tenantId: string, id: string): Promise<Supplier | null>;
  list(
    tenantId: string,
    filter: SupplierListFilter,
    page: number,
    limit: number,
  ): Promise<{ readonly items: readonly Supplier[]; readonly total: number }>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<Supplier | null>;
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

// --- Mappers (doc → entidad de dominio; única salida sin tenantId-oculto) ---

function mapLine(line: PurchaseLine): PurchaseLine {
  return {
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
    discountPct: line.discountPct,
    subtotal: line.subtotal,
    tax: line.tax,
    total: line.total,
    productId: line.productId ?? null,
  };
}

function mapPurchase(doc: PurchaseDoc): PurchaseDocument {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    kind: doc.kind,
    number: doc.number,
    supplierId: doc.supplierId.toString(),
    status: doc.status,
    currency: doc.currency,
    issueDate: doc.issueDate,
    lines: (doc.lines ?? []).map(mapLine),
    subtotal: doc.subtotal,
    tax: doc.tax,
    total: doc.total,
    notes: doc.notes ?? null,
    requestId: optionalRef(doc.requestId),
    orderId: optionalRef(doc.orderId),
    invoiceId: optionalRef(doc.invoiceId),
    warehouseId: optionalRef(doc.warehouseId),
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapSupplier(doc: SupplierDoc): Supplier {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    code: doc.code,
    name: doc.name,
    email: doc.email ?? null,
    phone: doc.phone ?? null,
    taxId: doc.taxId ?? null,
    address: doc.address ?? null,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const purchaseModel: Model<PurchaseDoc> = PurchaseModel;
const supplierModel: Model<SupplierDoc> = SupplierModel;

export const purchaseRepo: PurchaseRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await purchaseModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as PurchaseDoc);
      return mapPurchase(doc.toObject() as unknown as PurchaseDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('Number already in use');
      }
      throw error;
    }
  },

  async findById(tenantId, kind, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await purchaseModel.findOne({ _id: new Types.ObjectId(id), tenantId, kind }).lean();
    return doc === null ? null : mapPurchase(doc as unknown as PurchaseDoc);
  },

  async list(tenantId, filter, page, limit) {
    const skip = (page - 1) * limit;
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      kind: filter.kind,
      ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
      ...(filter.status !== undefined ? { status: filter.status } : {}),
      ...(filter.supplierId !== undefined ? { supplierId: oid(filter.supplierId) } : {}),
      ...(filter.orderId !== undefined ? { orderId: oid(filter.orderId) } : {}),
      ...(filter.requestId !== undefined ? { requestId: oid(filter.requestId) } : {}),
      ...(filter.invoiceId !== undefined ? { invoiceId: oid(filter.invoiceId) } : {}),
    };
    const [docs, total] = await Promise.all([
      purchaseModel
        .find(mongoFilter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      purchaseModel.countDocuments(mongoFilter),
    ]);
    return {
      items: docs.map((doc) => mapPurchase(doc as unknown as PurchaseDoc)),
      total,
    };
  },

  async update(tenantId, kind, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await purchaseModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId, kind },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapPurchase(doc as unknown as PurchaseDoc);
  },
};

export const supplierRepo: SupplierRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await supplierModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as SupplierDoc);
      return mapSupplier(doc.toObject() as unknown as SupplierDoc);
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
    const doc = await supplierModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapSupplier(doc as unknown as SupplierDoc);
  },

  async list(tenantId, filter, page, limit) {
    const skip = (page - 1) * limit;
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
    };
    const [docs, total] = await Promise.all([
      supplierModel
        .find(mongoFilter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      supplierModel.countDocuments(mongoFilter),
    ]);
    return {
      items: docs.map((doc) => mapSupplier(doc as unknown as SupplierDoc)),
      total,
    };
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await supplierModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapSupplier(doc as unknown as SupplierDoc);
  },
};
