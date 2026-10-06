import type { Types } from 'mongoose';
import type { SaleKind, SaleLine, SaleStatus } from '../../domain/entities/sale-document.js';

/**
 * Documento de la colección única `salesDocuments`. `kind` discrimina el tipo
 * de documento (cotización/pedido/envío/factura/devolución) — todos comparten
 * forma, por eso NO hay 5 colecciones. `null` = campo limpiado vía PATCH
 * (solo borradores); `undefined` = nunca escrito.
 */
export interface SaleDoc {
  _id: Types.ObjectId;
  tenantId: string;
  kind: SaleKind;
  /** Secuencial `PREFIX-YYYY-000001` por tenant+tipo+año, inmutable. */
  number: string;
  customerId: Types.ObjectId;
  warehouseId?: Types.ObjectId | null;
  status: SaleStatus;
  currency: string;
  issueDate: Date;
  lines: SaleLine[];
  subtotal: number;
  tax: number;
  total: number;
  notes?: string | null;
  // --- Referencias (solo las permitidas por kind; ver SALE_REFS) ---
  opportunityId?: Types.ObjectId | null;
  quoteId?: Types.ObjectId | null;
  orderId?: Types.ObjectId | null;
  invoiceId?: Types.ObjectId | null;
  // --- Exclusivas de cotización ---
  validUntil?: Date | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}
