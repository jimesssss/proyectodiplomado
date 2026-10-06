import { Types, type Model } from 'mongoose';
import { ConflictError } from '../../../../core/errors/app-error.js';
import type {
  SaleDocument,
  SaleKind,
  SaleLine,
  SaleStatus,
} from '../../domain/entities/sale-document.js';
import { SaleModel } from '../schemas/collections.js';
import type { SaleDoc } from '../schemas/types.js';

/**
 * Repositorio Sales — único camino a MongoDB del módulo (colección única
 * `salesDocuments`). TODA operación filtra por `tenantId` (nunca llega del
 * cliente, ADR-002) y por `kind` (un pedido no se toca desde la ruta de
 * facturas). Único punto de casteo: payload/set de create/update.
 */

export interface SaleListFilter {
  readonly kind: SaleKind;
  readonly archived?: boolean | undefined;
  readonly status?: SaleStatus | undefined;
  readonly customerId?: string | undefined;
  readonly orderId?: string | undefined;
  readonly quoteId?: string | undefined;
  readonly invoiceId?: string | undefined;
  readonly opportunityId?: string | undefined;
}

export interface SaleListPage {
  readonly items: readonly SaleDocument[];
  readonly total: number;
}

export interface SaleRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<SaleDocument>;
  findById(tenantId: string, kind: SaleKind, id: string): Promise<SaleDocument | null>;
  list(
    tenantId: string,
    filter: SaleListFilter,
    page: number,
    limit: number,
  ): Promise<SaleListPage>;
  update(
    tenantId: string,
    kind: SaleKind,
    id: string,
    set: Record<string, unknown>,
    expectedStatus?: SaleStatus,
  ): Promise<SaleDocument | null>;
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

function buildFilter(tenantId: string, filter: SaleListFilter): Record<string, unknown> {
  return {
    tenantId,
    kind: filter.kind,
    ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
    ...(filter.status !== undefined ? { status: filter.status } : {}),
    ...(filter.customerId !== undefined ? { customerId: oid(filter.customerId) } : {}),
    ...(filter.orderId !== undefined ? { orderId: oid(filter.orderId) } : {}),
    ...(filter.quoteId !== undefined ? { quoteId: oid(filter.quoteId) } : {}),
    ...(filter.invoiceId !== undefined ? { invoiceId: oid(filter.invoiceId) } : {}),
    ...(filter.opportunityId !== undefined ? { opportunityId: oid(filter.opportunityId) } : {}),
  };
}

// --- Mapper (doc → entidad de dominio; única salida sin tenantId-oculto) ---

function optionalRef(value: Types.ObjectId | string | null | undefined): string | null {
  return value === undefined || value === null ? null : value.toString();
}

function mapSale(doc: SaleDoc): SaleDocument {
  const lines: SaleLine[] = (doc.lines ?? []).map((line) => ({
    productId: optionalRef(line.productId),
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
    discountPct: line.discountPct,
    subtotal: line.subtotal,
    tax: line.tax,
    total: line.total,
  }));
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    kind: doc.kind,
    number: doc.number,
    customerId: doc.customerId.toString(),
    warehouseId: optionalRef(doc.warehouseId),
    status: doc.status,
    currency: doc.currency,
    issueDate: doc.issueDate,
    lines,
    subtotal: doc.subtotal,
    tax: doc.tax,
    total: doc.total,
    notes: doc.notes ?? null,
    opportunityId: optionalRef(doc.opportunityId),
    quoteId: optionalRef(doc.quoteId),
    orderId: optionalRef(doc.orderId),
    invoiceId: optionalRef(doc.invoiceId),
    validUntil: doc.validUntil ?? null,
    approvedBy: doc.approvedBy ?? null,
    approvedAt: doc.approvedAt ?? null,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const model: Model<SaleDoc> = SaleModel;

export const saleRepo: SaleRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await model.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as SaleDoc);
      return mapSale(doc.toObject() as unknown as SaleDoc);
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
    const doc = await model.findOne({ _id: new Types.ObjectId(id), tenantId, kind }).lean();
    return doc === null ? null : mapSale(doc as unknown as SaleDoc);
  },

  async list(tenantId, filter, page, limit) {
    const skip = (page - 1) * limit;
    const mongoFilter = buildFilter(tenantId, filter);
    const [docs, total] = await Promise.all([
      model.find(mongoFilter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      model.countDocuments(mongoFilter),
    ]);
    return {
      items: docs.map((doc) => mapSale(doc as unknown as SaleDoc)),
      total,
    };
  },

  async update(tenantId, kind, id, set, expectedStatus) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId, kind, ...(expectedStatus ? {status:expectedStatus}: {}) },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapSale(doc as unknown as SaleDoc);
  },
};
