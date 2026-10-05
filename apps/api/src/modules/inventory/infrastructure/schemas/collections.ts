import mongoose from 'mongoose';
import { Schema, model, type Model } from 'mongoose';
import { MOVEMENT_TYPES } from '../../domain/entities/stock.js';
import type { CountDoc, MovementDoc, ProductDoc, StockDoc, TransferDoc } from './types.js';

/**
 * Cinco colecciones (las rutas de convenciones §4): `products` (maestro),
 * `stock` (saldo proyectado), `stockMovements` (ledger append-only),
 * `stockTransfers` e `inventoryCounts`. La numeración de documentos usa
 * `counters` (core/numbering). Todas con `tenantId` primero en sus índices
 * (ADR-002) y queries justificadas en `docs/database/inventory.md`.
 */
export const PRODUCTS_COLLECTION = 'products';
export const STOCK_COLLECTION = 'stock';
export const MOVEMENTS_COLLECTION = 'stockMovements';
export const TRANSFERS_COLLECTION = 'stockTransfers';
export const COUNTS_COLLECTION = 'inventoryCounts';

const productSchema = new Schema<ProductDoc>(
  {
    tenantId: { type: String, required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: null },
    unit: { type: String, required: true, default: 'unit' },
    cost: { type: Number, default: null },
    price: { type: Number, default: null },
    minStock: { type: Number, default: null },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: PRODUCTS_COLLECTION },
);

productSchema.index({ tenantId: 1, code: 1 }, { unique: true });
productSchema.index({ tenantId: 1, createdAt: -1 });
productSchema.index({ tenantId: 1, archived: 1, createdAt: -1 });

const stockSchema = new Schema<StockDoc>(
  {
    tenantId: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    warehouseId: { type: Schema.Types.ObjectId, required: true },
    qty: { type: Number, required: true },
  },
  { timestamps: true, collection: STOCK_COLLECTION },
);

// Saldo único por (tenant, producto, almacén) — el upsert lo gana este índice.
stockSchema.index({ tenantId: 1, productId: 1, warehouseId: 1 }, { unique: true });
// Listado de existencias por almacén: GET /inventory/stock?warehouseId=.
stockSchema.index({ tenantId: 1, warehouseId: 1 });

const movementSchema = new Schema<MovementDoc>(
  {
    tenantId: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    warehouseId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, required: true, enum: [...MOVEMENT_TYPES] },
    qty: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    sourceType: { type: String, default: null },
    sourceId: { type: Schema.Types.ObjectId, default: null },
    reason: { type: String, default: null },
  },
  // Append-only: solo `createdAt` (sin `updatedAt` — nada se reescribe).
  { timestamps: { createdAt: true, updatedAt: false }, collection: MOVEMENTS_COLLECTION },
);

movementSchema.index({ tenantId: 1, createdAt: -1 });
movementSchema.index({ tenantId: 1, productId: 1, createdAt: -1 });
movementSchema.index({ tenantId: 1, warehouseId: 1, createdAt: -1 });

const transferLineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false },
);

const transferSchema = new Schema<TransferDoc>(
  {
    tenantId: { type: String, required: true },
    number: { type: String, required: true },
    fromWarehouseId: { type: Schema.Types.ObjectId, required: true },
    toWarehouseId: { type: Schema.Types.ObjectId, required: true },
    lines: { type: [transferLineSchema], required: true },
    status: { type: String, required: true },
    notes: { type: String, default: null },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: TRANSFERS_COLLECTION },
);

transferSchema.index({ tenantId: 1, number: 1 }, { unique: true });
transferSchema.index({ tenantId: 1, createdAt: -1 });
transferSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

const countLineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, required: true },
    countedQty: { type: Number, required: true },
  },
  { _id: false },
);

const countSchema = new Schema<CountDoc>(
  {
    tenantId: { type: String, required: true },
    number: { type: String, required: true },
    warehouseId: { type: Schema.Types.ObjectId, required: true },
    lines: { type: [countLineSchema], required: true },
    status: { type: String, required: true },
    notes: { type: String, default: null },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: COUNTS_COLLECTION },
);

countSchema.index({ tenantId: 1, number: 1 }, { unique: true });
countSchema.index({ tenantId: 1, createdAt: -1 });
countSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

function getModel<T>(collection: string, schema: Schema<T>): Model<T> {
  const existing = mongoose.models[collection] as Model<T> | undefined;
  if (existing !== undefined) {
    return existing;
  }
  return model<T>(collection, schema);
}

export const ProductModel = getModel(PRODUCTS_COLLECTION, productSchema);
export const StockModel = getModel(STOCK_COLLECTION, stockSchema);
export const MovementModel = getModel(MOVEMENTS_COLLECTION, movementSchema);
export const TransferModel = getModel(TRANSFERS_COLLECTION, transferSchema);
export const CountModel = getModel(COUNTS_COLLECTION, countSchema);
