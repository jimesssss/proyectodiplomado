/**
 * Dominio Purchasing (FASE 10) — maestro de proveedores y documento de
 * compra con líneas. 5 tipos de documento: solicitud, orden, recepción,
 * factura de proveedor y devolución. Cada tipo tiene su máquina de estados
 * (`PURCHASE_TRANSITIONS`), su prefijo de numeración y sus referencias; TODOS
 * comparten la misma forma de documento.
 */

export const PURCHASE_KINDS = [
  'purchase.request',
  'purchase.order',
  'goods.receipt',
  'supplier.invoice',
  'purchase.return',
] as const;
export type PurchaseKind = (typeof PURCHASE_KINDS)[number];

/** Unión de todos los estados posibles (cada tipo usa su sublista). */
export type PurchaseStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'confirmed'
  | 'completed'
  | 'received'
  | 'posted'
  | 'issued'
  | 'paid'
  | 'refunded'
  | 'cancelled';

export type PurchaseRefField = 'requestId' | 'orderId' | 'invoiceId';

/** Referencias que admite CADA tipo (validadas contra el módulo/tenant). */
export const PURCHASE_REFS: Record<PurchaseKind, readonly PurchaseRefField[]> = {
  'purchase.request': [],
  'purchase.order': ['requestId'],
  'goods.receipt': ['orderId'],
  'supplier.invoice': ['orderId'],
  'purchase.return': ['orderId', 'invoiceId'],
};

/**
 * La recepción NO pide proveedor: se deriva de la orden (`orderId`), igual
 * que los envíos de venta derivan el cliente de su pedido (FASE 9).
 */
export const PURCHASE_REQUIRES_SUPPLIER: Record<PurchaseKind, boolean> = {
  'purchase.request': true,
  'purchase.order': true,
  'goods.receipt': false,
  'supplier.invoice': true,
  'purchase.return': true,
};

/** Prefijo de numeración por tipo (`PREFIX-YYYY-000001`). */
export const PURCHASE_PREFIX: Record<PurchaseKind, string> = {
  'purchase.request': 'RQ',
  'purchase.order': 'PO',
  'goods.receipt': 'GR',
  'supplier.invoice': 'PI',
  'purchase.return': 'RET',
};

/** Todos los estados de cada tipo. */
export const PURCHASE_STATUSES: Record<PurchaseKind, readonly PurchaseStatus[]> = {
  'purchase.request': ['draft', 'submitted', 'approved', 'rejected', 'cancelled'],
  'purchase.order': ['draft', 'confirmed', 'completed', 'cancelled'],
  'goods.receipt': ['draft', 'received', 'posted', 'cancelled'],
  'supplier.invoice': ['draft', 'issued', 'paid', 'cancelled'],
  'purchase.return': ['draft', 'received', 'refunded', 'cancelled'],
};

/**
 * Estados que el PATCH puede pedir. Igual que `PURCHASE_STATUSES`: no hay
 * endpoint de aprobación separado (el catálogo no define `:approve` para
 * compras; aprobar una solicitud es un cambio de estado con `:update`).
 */
export const PURCHASE_PATCH_STATUSES = PURCHASE_STATUSES;

export interface PurchaseLine {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  /** Impuesto en % (0-100). */
  readonly taxRate: number;
  /** Descuento en % (0-100) aplicado antes del impuesto. */
  readonly discountPct: number;
  /** Importes calculados por el servidor (2 decimales). */
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
}

export interface PurchaseDocument {
  readonly id: string;
  readonly tenantId: string;
  readonly kind: PurchaseKind;
  /** Secuencial por tenant+tipo+año (`PO-2026-000001`), inmutable. */
  readonly number: string;
  readonly supplierId: string;
  readonly status: PurchaseStatus;
  /** ISO-4217 en mayúsculas (default `USD`). */
  readonly currency: string;
  readonly issueDate: Date;
  readonly lines: readonly PurchaseLine[];
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
  readonly notes: string | null;
  readonly requestId: string | null;
  readonly orderId: string | null;
  readonly invoiceId: string | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicPurchaseDocument {
  readonly id: string;
  readonly kind: PurchaseKind;
  readonly number: string;
  readonly supplierId: string;
  readonly status: PurchaseStatus;
  readonly currency: string;
  readonly issueDate: Date;
  readonly lines: readonly PurchaseLine[];
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
  readonly notes: string | null;
  readonly requestId: string | null;
  readonly orderId: string | null;
  readonly invoiceId: string | null;
  readonly archived: boolean;
}

export function toPublicPurchaseDocument(doc: PurchaseDocument): PublicPurchaseDocument {
  return {
    id: doc.id,
    kind: doc.kind,
    number: doc.number,
    supplierId: doc.supplierId,
    status: doc.status,
    currency: doc.currency,
    issueDate: doc.issueDate,
    lines: doc.lines,
    subtotal: doc.subtotal,
    tax: doc.tax,
    total: doc.total,
    notes: doc.notes,
    requestId: doc.requestId,
    orderId: doc.orderId,
    invoiceId: doc.invoiceId,
    archived: doc.archived,
  };
}
