import type { Types } from 'mongoose';
import type { TenantStatus } from '../../domain/entities/tenant.js';

/**
 * Tipos de documento de tenancy.
 * Se usa `Types.ObjectId` (nunca el `ObjectId` de nivel superior, que es
 * `mongodb.ObjectId` y rompe los filtros de mongoose 9 — ver FASE 3).
 */
export interface TenantDoc {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  status: TenantStatus;
  createdAt: Date;
  updatedAt: Date;
}
