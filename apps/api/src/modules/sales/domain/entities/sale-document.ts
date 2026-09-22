/**
 * Dominio Sales (FASE 9) — documento comercial con líneas.
 * 5 tipos: cotización, pedido, envío, factura y devolución. Cada tipo tiene
 * su máquina de estados (`SALE_TRANSITIONS`), su prefijo de numeración y sus
 * referencias opcionales; TODOS comparten la misma forma de documento.
 */

export const SALE_KINDS = [
  'sales.quote',
  'sales.order',
  'sales.delivery',
  'sales.invoice',
  'sales.return',
] as const;
export type SaleKind = (typeof SALE_KINDS)[number];

/** Unión de todos los estados posibles (cada tipo usa su sublista). */
export type SaleStatus =
  | 'draft'
  | 'sent'
  | 'approved'
  | 'rejected'
  | 'confirmed'
  | 'fulfilled'
  | 'shipped'
  | 'received'
  | 'issued'
  | 'paid'
  | 'refunded'
  | 'cancelled';

export type SaleRefField = 'opportunityId' | 'quoteId' | 'orderId' | 'invoiceId';

/** Referencias que admite CADA tipo (validadas contra su módulo/tenant). */
export const SALE_REFS: Record<SaleKind, readonly SaleRefField[]> = {
  'sales.quote': ['opportunityId'],
  'sales.order': ['quoteId'],
  'sales.delivery': ['orderId'],
  'sales.invoice': ['orderId'],
  'sales.return': ['orderId', 'invoiceId'],
};

/** El envío NO pide cliente: se deriva del pedido (`orderId`). */
export const SALE_REQUIRES_CUSTOMER: Record<SaleKind, boolean> = {
  'sales.quote': true,
  'sales.order': true,
  'sales.delivery': false,
  'sales.invoice': true,
  'sales.return': true,
};

/** Prefijo de numeración por tipo (`PREFIX-YYYY-000001`). */
export const SALE_PREFIX: Record<SaleKind, string> = {
  'sales.quote': 'QT',
  'sales.order': 'SO',
  'sales.delivery': 'DL',
  'sales.invoice': 'IV',
  'sales.return': 'RT',
};

/** Todos los estados de cada tipo. */
export const SALE_STATUSES: Record<SaleKind, readonly SaleStatus[]> = {
  'sales.quote': ['draft', 'sent', 'approved', 'rejected', 'cancelled'],
  'sales.order': ['draft', 'confirmed', 'fulfilled', 'cancelled'],
  'sales.delivery': ['draft', 'shipped', 'received', 'cancelled'],
  'sales.invoice': ['draft', 'issued', 'paid', 'cancelled'],
  'sales.return': ['draft', 'received', 'refunded', 'cancelled'],
};

/**
 * Estados que el PATCH puede pedir (la aprobación de cotización NO: exige el
 * endpoint `POST /sales/quotes/:id/approve` con `sales.quote:approve`).
 */
export const SALE_PATCH_STATUSES: Record<SaleKind, readonly SaleStatus[]> = {
  'sales.quote': ['draft', 'sent', 'rejected', 'cancelled'],
  'sales.order': ['draft', 'confirmed', 'fulfilled', 'cancelled'],
  'sales.delivery': ['draft', 'shipped', 'received', 'cancelled'],
  'sales.invoice': ['draft', 'issued', 'paid', 'cancelled'],
  'sales.return': ['draft', 'received', 'refunded', 'cancelled'],
};

export interface SaleLine {
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

export interface SaleDocument {
  readonly id: string;
  readonly tenantId: string;
  readonly kind: SaleKind;
  /** Secuencial por tenant+tipo+año (`QT-2026-000001`), inmutable. */
  readonly number: string;
  readonly customerId: string;
  readonly status: SaleStatus;
  /** ISO-4217 en mayúsculas (default `USD`). */
  readonly currency: string;
  readonly issueDate: Date;
  readonly lines: readonly SaleLine[];
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
  readonly notes: string | null;
  readonly opportunityId: string | null;
  readonly quoteId: string | null;
  readonly orderId: string | null;
  readonly invoiceId: string | null;
  readonly validUntil: Date | null;
  readonly approvedBy: string | null;
  readonly approvedAt: Date | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicSaleDocument {
  readonly id: string;
  readonly kind: SaleKind;
  readonly number: string;
  readonly customerId: string;
  readonly status: SaleStatus;
  readonly currency: string;
  readonly issueDate: Date;
  readonly lines: readonly SaleLine[];
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
  readonly notes: string | null;
  readonly opportunityId: string | null;
  readonly quoteId: string | null;
  readonly orderId: string | null;
  readonly invoiceId: string | null;
  readonly validUntil: Date | null;
  readonly approvedBy: string | null;
  readonly approvedAt: Date | null;
  readonly archived: boolean;
}

export function toPublicSaleDocument(doc: SaleDocument): PublicSaleDocument {
  return {
    id: doc.id,
    kind: doc.kind,
    number: doc.number,
    customerId: doc.customerId,
    status: doc.status,
    currency: doc.currency,
    issueDate: doc.issueDate,
    lines: doc.lines,
    subtotal: doc.subtotal,
    tax: doc.tax,
    total: doc.total,
    notes: doc.notes,
    opportunityId: doc.opportunityId,
    quoteId: doc.quoteId,
    orderId: doc.orderId,
    invoiceId: doc.invoiceId,
    validUntil: doc.validUntil,
    approvedBy: doc.approvedBy,
    approvedAt: doc.approvedAt,
    archived: doc.archived,
  };
}
