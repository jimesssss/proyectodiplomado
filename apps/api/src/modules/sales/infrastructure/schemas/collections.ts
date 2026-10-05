import mongoose from 'mongoose';
import { Schema, model, type Model } from 'mongoose';
import { SALE_KINDS } from '../../domain/entities/sale-document.js';
import type { SaleDoc } from './types.js';

/**
 * UNA colección para los 5 documentos de venta: misma forma, mismo ciclo de
 * vida y mismos filtros — `kind` discrimina. La unicidad del número es por
 * `(tenantId, kind, number)` (numeración atómica en core/numbering).
 */
export const SALES_COLLECTION = 'salesDocuments';

const lineSchema = new Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    taxRate: { type: Number, required: true },
    discountPct: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false },
);

const saleSchema = new Schema<SaleDoc>(
  {
    tenantId: { type: String, required: true },
    kind: { type: String, required: true, enum: [...SALE_KINDS] },
    number: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, required: true },
    currency: { type: String, required: true },
    issueDate: { type: Date, required: true },
    lines: { type: [lineSchema], required: true },
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
    notes: { type: String, default: null },
    opportunityId: { type: Schema.Types.ObjectId, default: null },
    quoteId: { type: Schema.Types.ObjectId, default: null },
    orderId: { type: Schema.Types.ObjectId, default: null },
    invoiceId: { type: Schema.Types.ObjectId, default: null },
    validUntil: { type: Date, default: null },
    approvedBy: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: SALES_COLLECTION },
);

// Índices (todos con tenantId primero, ADR-002):
saleSchema.index({ tenantId: 1, kind: 1, number: 1 }, { unique: true });
saleSchema.index({ tenantId: 1, kind: 1, createdAt: -1 });
saleSchema.index({ tenantId: 1, kind: 1, status: 1, createdAt: -1 });
saleSchema.index({ tenantId: 1, kind: 1, customerId: 1, createdAt: -1 });
saleSchema.index({ tenantId: 1, kind: 1, orderId: 1 });

function getModel(): Model<SaleDoc> {
  const existing = mongoose.models[SALES_COLLECTION] as Model<SaleDoc> | undefined;
  if (existing !== undefined) {
    return existing;
  }
  return model<SaleDoc>(SALES_COLLECTION, saleSchema);
}

export const SaleModel = getModel();
