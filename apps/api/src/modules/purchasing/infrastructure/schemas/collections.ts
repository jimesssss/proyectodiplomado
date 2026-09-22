import { Schema, model, models, type Model } from 'mongoose';
import { PURCHASE_KINDS } from '../../domain/entities/purchase-document.js';
import type { PurchaseDoc, SupplierDoc } from './types.js';

/**
 * Dos colecciones: `suppliers` (maestro) y `purchaseDocuments` (UNA para los 5
 * tipos de compra — misma forma y ciclo de vida, `kind` discrimina). La
 * unicidad del número es por `(tenantId, kind, number)` (numeración atómica
 * en core/numbering).
 */
export const PURCHASES_COLLECTION = 'purchaseDocuments';
export const SUPPLIERS_COLLECTION = 'suppliers';

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

const purchaseSchema = new Schema<PurchaseDoc>(
  {
    tenantId: { type: String, required: true },
    kind: { type: String, required: true, enum: [...PURCHASE_KINDS] },
    number: { type: String, required: true },
    supplierId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, required: true },
    currency: { type: String, required: true },
    issueDate: { type: Date, required: true },
    lines: { type: [lineSchema], required: true },
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
    notes: { type: String, default: null },
    requestId: { type: Schema.Types.ObjectId, default: null },
    orderId: { type: Schema.Types.ObjectId, default: null },
    invoiceId: { type: Schema.Types.ObjectId, default: null },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: PURCHASES_COLLECTION },
);

// Índices (todos con tenantId primero, ADR-002):
purchaseSchema.index({ tenantId: 1, kind: 1, number: 1 }, { unique: true });
purchaseSchema.index({ tenantId: 1, kind: 1, createdAt: -1 });
purchaseSchema.index({ tenantId: 1, kind: 1, status: 1, createdAt: -1 });
purchaseSchema.index({ tenantId: 1, kind: 1, supplierId: 1, createdAt: -1 });
purchaseSchema.index({ tenantId: 1, kind: 1, orderId: 1 });

const addressSchema = new Schema(
  {
    street: { type: String },
    city: { type: String },
    region: { type: String },
    postalCode: { type: String },
    country: { type: String },
  },
  { _id: false },
);

const supplierSchema = new Schema<SupplierDoc>(
  {
    tenantId: { type: String, required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    taxId: { type: String, default: null },
    address: { type: addressSchema, default: null },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: SUPPLIERS_COLLECTION },
);

supplierSchema.index({ tenantId: 1, code: 1 }, { unique: true });
supplierSchema.index({ tenantId: 1, createdAt: -1 });
supplierSchema.index({ tenantId: 1, archived: 1, createdAt: -1 });

function getModel<T>(collection: string, schema: Schema<T>): Model<T> {
  const existing = models[collection] as Model<T> | undefined;
  if (existing !== undefined) {
    return existing;
  }
  return model<T>(collection, schema);
}

export const PurchaseModel = getModel(PURCHASES_COLLECTION, purchaseSchema);
export const SupplierModel = getModel(SUPPLIERS_COLLECTION, supplierSchema);
