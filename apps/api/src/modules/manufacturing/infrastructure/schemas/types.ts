import type { Types } from 'mongoose';
import type { BomLine } from '../../domain/entities/bom.js';
import type { ProductionStatus } from '../../domain/entities/production-order.js';

/**
 * Documentos de las 2 colecciones del módulo. `null` = campo limpiado vía
 * PATCH (notas/bomId); `undefined` = nunca escrito. Los `productId`/
 * `warehouseId`/`bomId` son ObjectId en Mongo y string en el dominio
 * (único punto de casteo: mapper del repositorio).
 */
export interface BomDoc {
  _id: Types.ObjectId;
  tenantId: string;
  /** Clave natural única por tenant (normalizada e inmutable). */
  code: string;
  name: string;
  productId: Types.ObjectId;
  lines: BomLine[];
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductionOrderDoc {
  _id: Types.ObjectId;
  tenantId: string;
  /** Secuencial `MO-YYYY-000001` por tenant+año, inmutable. */
  number: string;
  productId: Types.ObjectId;
  quantity: number;
  warehouseId: Types.ObjectId;
  bomId: Types.ObjectId | null;
  /** Plan POR UNIDAD (snapshot de la BOM o líneas explícitas). */
  lines: BomLine[];
  status: ProductionStatus;
  notes?: string | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}
