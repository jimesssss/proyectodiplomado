import type { Types } from 'mongoose';
import type {
  PurchaseKind,
  PurchaseLine,
  PurchaseStatus,
} from '../../domain/entities/purchase-document.js';
import type { SupplierAddress } from '../../domain/entities/supplier.js';

/**
 * Documento de la colección única `purchaseDocuments`. `kind` discrimina el
 * tipo (solicitud/orden/recepción/factura/devolución) — todos comparten
 * forma, por eso NO hay 5 colecciones (misma decisión de FASE 9 en sales).
 * `null` = campo limpiado vía PATCH (solo borradores); `undefined` = nunca
 * escrito.
 */
export interface PurchaseDoc {
  _id: Types.ObjectId;
  tenantId: string;
  kind: PurchaseKind;
  /** Secuencial `PREFIX-YYYY-000001` por tenant+tipo+año, inmutable. */
  number: string;
  supplierId: Types.ObjectId;
  status: PurchaseStatus;
  currency: string;
  issueDate: Date;
  lines: PurchaseLine[];
  subtotal: number;
  tax: number;
  total: number;
  notes?: string | null;
  // --- Referencias (solo las permitidas por kind; ver PURCHASE_REFS) ---
  requestId?: Types.ObjectId | null;
  orderId?: Types.ObjectId | null;
  invoiceId?: Types.ObjectId | null;
  /** Almacén destino — solo `goods.receipt` (FK a Organization). */
  warehouseId?: Types.ObjectId | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Maestro de proveedor (`suppliers`) — escrito solo por este módulo. */
export interface SupplierDoc {
  _id: Types.ObjectId;
  tenantId: string;
  /** Clave natural por tenant (única, inmutable). */
  code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  taxId?: string | null;
  address?: SupplierAddress | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}
