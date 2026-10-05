import mongoose from 'mongoose';
import { Schema, model, type Model } from 'mongoose';
import type { TenantDoc } from './types.js';

/**
 * Colección `tenants` (FASE 4). Es la raíz del multi-tenancy (ADR-002):
 * su `_id` ES el `tenantId` que llevan todos los documentos de negocio.
 * Por eso esta es la única colección global sin campo `tenantId`.
 */

function getModel<T>(name: string, schema: Schema<T>): Model<T> {
  const existing = mongoose.models[name] as Model<T> | undefined;
  return existing ?? model<T>(name, schema);
}

const tenantSchema = new Schema<TenantDoc>(
  {
    slug: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  },
  { timestamps: true, collection: 'tenants' },
);
// Clave natural global: el slug identifica al tenant en URLs y subdominios.
tenantSchema.index({ slug: 1 }, { unique: true });
// Listado admin: filtrar por estado y paginar por creación.
tenantSchema.index({ status: 1, createdAt: -1 });

export const TenantModel = getModel<TenantDoc>('Tenant', tenantSchema);
