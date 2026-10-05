import mongoose from 'mongoose';
import { Schema, model, type Model } from 'mongoose';
import { PRODUCTION_STATUSES } from '../../domain/entities/production-order.js';
import type { BomDoc, ProductionOrderDoc } from './types.js';

/**
 * 2 colecciones: `boms` (maestro con clave natural) y `productionOrders`
 * (documento numerado + máquina de estados). Líneas embebidas por ADR-003
 * (el plan de producción es parte del documento, no una colección aparte).
 */
export const BOMS_COLLECTION = 'boms';
export const PRODUCTION_ORDERS_COLLECTION = 'productionOrders';

const componentLineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false },
);

const bomSchema = new Schema<BomDoc>(
  {
    tenantId: { type: String, required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    lines: { type: [componentLineSchema], required: true },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: BOMS_COLLECTION },
);

// Clave natural única POR tenant (ADR-002): duplicado → 409 en el repo.
bomSchema.index({ tenantId: 1, code: 1 }, { unique: true });
// Listado por defecto: GET /manufacturing/boms (desc por creación).
bomSchema.index({ tenantId: 1, createdAt: -1 });
// Listado filtrado: GET /manufacturing/boms?archived=.
bomSchema.index({ tenantId: 1, archived: 1, createdAt: -1 });

const productionOrderSchema = new Schema<ProductionOrderDoc>(
  {
    tenantId: { type: String, required: true },
    number: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true },
    warehouseId: { type: Schema.Types.ObjectId, required: true },
    bomId: { type: Schema.Types.ObjectId, default: null },
    lines: { type: [componentLineSchema], required: true },
    status: { type: String, required: true, enum: [...PRODUCTION_STATUSES] },
    notes: { type: String, default: null },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: PRODUCTION_ORDERS_COLLECTION },
);

// Número secuencial único por tenant (`core/numbering` `$inc` atómico).
productionOrderSchema.index({ tenantId: 1, number: 1 }, { unique: true });
// Cola de producción: GET /manufacturing/orders (desc) y ?status=.
productionOrderSchema.index({ tenantId: 1, createdAt: -1 });
productionOrderSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
productionOrderSchema.index({ tenantId: 1, archived: 1, createdAt: -1 });

function getModel<T>(name: string, schema: Schema<T>): Model<T> {
  const existing = mongoose.models[name] as Model<T> | undefined;
  if (existing !== undefined) {
    return existing;
  }
  return model<T>(name, schema);
}

export const BomModel = getModel<BomDoc>('ManufacturingBom', bomSchema);
export const ProductionOrderModel = getModel<ProductionOrderDoc>(
  'ManufacturingProductionOrder',
  productionOrderSchema,
);
