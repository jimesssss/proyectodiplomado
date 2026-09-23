/**
 * Documentos de dinero (FASE 13): pago (salida) y cobro (entrada). Comparten
 * máquina de estados con sus reglas en `treasury-rules`. A diferencia de
 * `sales.quote:approve`/`accounting.journal:post`, el catálogo NO define
 * `payment:post`/`receipt:post` → **la publicación se hace con `:update`**
 * (`PATCH {status:'posted'}`, patrón de `goods.receipt` en FASE 10) y el
 * dinero se mueve SOLO al llegar a `posted`. `posted` mueve saldo y ledger;
 * `cancelled` solo cambia estado. Sin `:delete` en el catálogo → soft-delete
 * vía `archived`.
 */

export const MONEY_STATUSES = ['draft', 'posted', 'cancelled'] as const;
export type MoneyStatus = (typeof MONEY_STATUSES)[number];

/** Pago (dinero OUT): asienta un egreso de una cuenta de tesorería. */
export interface Payment {
  readonly id: string;
  readonly tenantId: string;
  /** Secuencial `PAY-YYYY-000001` por tenant+año, inmutable. */
  readonly number: string;
  readonly accountId: string;
  /** Importe > 0 en la moneda de la cuenta (el signo lo aplica el servidor). */
  readonly amount: number;
  readonly date: Date;
  /** FK opcional a la factura de proveedor (`supplier.invoice`). */
  readonly invoiceId: string | null;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly status: MoneyStatus;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Cobro (dinero IN): asienta un ingreso a una cuenta de tesorería. */
export interface Receipt {
  readonly id: string;
  readonly tenantId: string;
  /** Secuencial `RCP-YYYY-000001` por tenant+año, inmutable. */
  readonly number: string;
  readonly accountId: string;
  readonly amount: number;
  readonly date: Date;
  /** FK opcional a la factura de venta (`sales.invoice`). */
  readonly invoiceId: string | null;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly status: MoneyStatus;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PublicPayment {
  readonly id: string;
  readonly number: string;
  readonly accountId: string;
  readonly amount: number;
  readonly date: Date;
  readonly invoiceId: string | null;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly status: MoneyStatus;
  readonly archived: boolean;
}

export interface PublicReceipt {
  readonly id: string;
  readonly number: string;
  readonly accountId: string;
  readonly amount: number;
  readonly date: Date;
  readonly invoiceId: string | null;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly status: MoneyStatus;
  readonly archived: boolean;
}

export function toPublicPayment(payment: Payment): PublicPayment {
  return {
    id: payment.id,
    number: payment.number,
    accountId: payment.accountId,
    amount: payment.amount,
    date: payment.date,
    invoiceId: payment.invoiceId,
    reference: payment.reference,
    notes: payment.notes,
    status: payment.status,
    archived: payment.archived,
  };
}

export function toPublicReceipt(receipt: Receipt): PublicReceipt {
  return {
    id: receipt.id,
    number: receipt.number,
    accountId: receipt.accountId,
    amount: receipt.amount,
    date: receipt.date,
    invoiceId: receipt.invoiceId,
    reference: receipt.reference,
    notes: receipt.notes,
    status: receipt.status,
    archived: receipt.archived,
  };
}
