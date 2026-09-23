import { Types } from 'mongoose';
import type { CashMovementSourceType } from '../../domain/entities/cash-movement.js';
import type { MoneyStatus } from '../../domain/entities/money-documents.js';
import type { ReconciliationLine } from '../../domain/entities/reconciliation.js';
import type { TreasuryAccount } from '../../domain/entities/treasury-account.js';

/** Cuenta de tesorería (`treasuryAccounts`) — banco O caja según `type`. */
export interface TreasuryAccountDoc extends Omit<TreasuryAccount, 'id'> {
  _id: Types.ObjectId;
}

/** Pago (`payments`) — dinero OUT. */
export interface PaymentDoc {
  _id: Types.ObjectId;
  tenantId: string;
  number: string;
  accountId: Types.ObjectId;
  /** Importe > 0 en la moneda de la cuenta; el signo lo aplica el servidor. */
  amount: number;
  date: Date;
  invoiceId?: Types.ObjectId | null;
  reference?: string | null;
  notes?: string | null;
  status: MoneyStatus;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Cobro (`receipts`) — dinero IN. */
export interface ReceiptDoc {
  _id: Types.ObjectId;
  tenantId: string;
  number: string;
  accountId: Types.ObjectId;
  amount: number;
  date: Date;
  invoiceId?: Types.ObjectId | null;
  reference?: string | null;
  notes?: string | null;
  status: MoneyStatus;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Línea de estado de cuenta (`bankTransactions`) — registro EXTERNO. */
export interface BankTransactionDoc {
  _id: Types.ObjectId;
  tenantId: string;
  accountId: Types.ObjectId;
  date: Date;
  /** Con signo: + depósito, − retiro (≠ 0). NO mueve el saldo interno. */
  amount: number;
  externalId?: string | null;
  description?: string | null;
  /** Conciliación que la incluye; server-only. */
  reconciliationId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Conciliación (`reconciliations`) — empareja líneas del banco con el ledger. */
export interface ReconciliationDoc {
  _id: Types.ObjectId;
  tenantId: string;
  number: string;
  accountId: Types.ObjectId;
  reconciledAt: Date;
  lines: ReconciliationLine[];
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Ledger append-only (`cashMovements`) — timestamps solo de creación. */
export interface CashMovementDoc {
  _id: Types.ObjectId;
  tenantId: string;
  accountId: Types.ObjectId;
  /** Con signo: + entrada (receipt/opening), − salida (payment). */
  amount: number;
  balanceAfter: number;
  sourceType: CashMovementSourceType;
  sourceId: Types.ObjectId;
  reason: string;
  createdAt: Date;
}
