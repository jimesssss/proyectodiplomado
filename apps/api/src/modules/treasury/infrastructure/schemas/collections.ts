import mongoose from 'mongoose';
import { Schema, model, type Model } from 'mongoose';
import { CASH_MOVEMENT_SOURCE_TYPES } from '../../domain/entities/cash-movement.js';
import { TREASURY_ACCOUNT_TYPES } from '../../domain/entities/treasury-account.js';
import type {
  BankTransactionDoc,
  CashMovementDoc,
  PaymentDoc,
  ReceiptDoc,
  ReconciliationDoc,
  TreasuryAccountDoc,
} from './types.js';

/**
 * Seis colecciones de tesorería (las 7 de `database.md` menos una: ver
 * `docs/database/treasury.md`) — `treasuryAccounts` (banco O caja con
 * `type`; el catálogo solo define `bank.account:*`), `payments`, `receipts`,
 * `bankTransactions`, `reconciliations` y `cashMovements` (ledger
 * append-only, la fuente de verdad del dinero). Numeración `PAY/RCP/REC-*`
 * vía `counters` (core/numbering). Todas con `tenantId` primero en sus
 * índices (ADR-002) y queries justificadas en `docs/database/treasury.md`.
 */
export const TREASURY_ACCOUNTS_COLLECTION = 'treasuryAccounts';
export const PAYMENTS_COLLECTION = 'payments';
export const RECEIPTS_COLLECTION = 'receipts';
export const BANK_TRANSACTIONS_COLLECTION = 'bankTransactions';
export const RECONCILIATIONS_COLLECTION = 'reconciliations';
export const CASH_MOVEMENTS_COLLECTION = 'cashMovements';

const treasuryAccountSchema = new Schema<TreasuryAccountDoc>(
  {
    tenantId: { type: String, required: true },
    type: { type: String, required: true, enum: [...TREASURY_ACCOUNT_TYPES] },
    code: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: null },
    accountNumber: { type: String, default: null },
    currency: { type: String, required: true },
    openingBalance: { type: Number, required: true },
    // Proyección server-only: openingBalance + Σ cashMovements ($inc + guardia).
    balance: { type: Number, required: true },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: TREASURY_ACCOUNTS_COLLECTION },
);

treasuryAccountSchema.index({ tenantId: 1, code: 1 }, { unique: true });
treasuryAccountSchema.index({ tenantId: 1, createdAt: -1 });
treasuryAccountSchema.index({ tenantId: 1, archived: 1, createdAt: -1 });
treasuryAccountSchema.index({ tenantId: 1, type: 1, createdAt: -1 });

const paymentSchema = new Schema<PaymentDoc>(
  {
    tenantId: { type: String, required: true },
    number: { type: String, required: true },
    accountId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    invoiceId: { type: Schema.Types.ObjectId, default: null },
    reference: { type: String, default: null },
    notes: { type: String, default: null },
    status: { type: String, required: true },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: PAYMENTS_COLLECTION },
);

paymentSchema.index({ tenantId: 1, number: 1 }, { unique: true });
paymentSchema.index({ tenantId: 1, createdAt: -1 });
paymentSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
paymentSchema.index({ tenantId: 1, accountId: 1, createdAt: -1 });

const receiptSchema = new Schema<ReceiptDoc>(
  {
    tenantId: { type: String, required: true },
    number: { type: String, required: true },
    accountId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    invoiceId: { type: Schema.Types.ObjectId, default: null },
    reference: { type: String, default: null },
    notes: { type: String, default: null },
    status: { type: String, required: true },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: RECEIPTS_COLLECTION },
);

receiptSchema.index({ tenantId: 1, number: 1 }, { unique: true });
receiptSchema.index({ tenantId: 1, createdAt: -1 });
receiptSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
receiptSchema.index({ tenantId: 1, accountId: 1, createdAt: -1 });

const bankTransactionSchema = new Schema<BankTransactionDoc>(
  {
    tenantId: { type: String, required: true },
    accountId: { type: Schema.Types.ObjectId, required: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true },
    externalId: { type: String, default: null },
    description: { type: String, default: null },
    reconciliationId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true, collection: BANK_TRANSACTIONS_COLLECTION },
);

bankTransactionSchema.index({ tenantId: 1, createdAt: -1 });
bankTransactionSchema.index({ tenantId: 1, accountId: 1, createdAt: -1 });
// Filtro de conciliación: GET …?accountId=…&reconciled=true|false.
bankTransactionSchema.index({ tenantId: 1, accountId: 1, reconciliationId: 1 });

const reconciliationLineSchema = new Schema(
  {
    bankTransactionId: { type: Schema.Types.ObjectId, required: true },
    movementId: { type: Schema.Types.ObjectId, default: null },
  },
  { _id: false },
);

const reconciliationSchema = new Schema<ReconciliationDoc>(
  {
    tenantId: { type: String, required: true },
    number: { type: String, required: true },
    accountId: { type: Schema.Types.ObjectId, required: true },
    reconciledAt: { type: Date, required: true },
    lines: { type: [reconciliationLineSchema], required: true },
    notes: { type: String, default: null },
  },
  { timestamps: true, collection: RECONCILIATIONS_COLLECTION },
);

reconciliationSchema.index({ tenantId: 1, number: 1 }, { unique: true });
reconciliationSchema.index({ tenantId: 1, createdAt: -1 });
reconciliationSchema.index({ tenantId: 1, accountId: 1, createdAt: -1 });

const cashMovementSchema = new Schema<CashMovementDoc>(
  {
    tenantId: { type: String, required: true },
    accountId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    sourceType: { type: String, required: true, enum: [...CASH_MOVEMENT_SOURCE_TYPES] },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true },
  },
  // Append-only: solo `createdAt` (sin `updatedAt` — nada se reescribe).
  { timestamps: { createdAt: true, updatedAt: false }, collection: CASH_MOVEMENTS_COLLECTION },
);

cashMovementSchema.index({ tenantId: 1, createdAt: -1 });
cashMovementSchema.index({ tenantId: 1, accountId: 1, createdAt: -1 });
// 1 ledger row por documento de origen: la BD garantiza at-most-once del apunte.
cashMovementSchema.index({ tenantId: 1, sourceType: 1, sourceId: 1 }, { unique: true });

function getModel<T>(collection: string, schema: Schema<T>): Model<T> {
  const existing = mongoose.models[collection] as Model<T> | undefined;
  if (existing !== undefined) {
    return existing;
  }
  return model<T>(collection, schema);
}

export const TreasuryAccountModel = getModel(TREASURY_ACCOUNTS_COLLECTION, treasuryAccountSchema);
export const PaymentModel = getModel(PAYMENTS_COLLECTION, paymentSchema);
export const ReceiptModel = getModel(RECEIPTS_COLLECTION, receiptSchema);
export const BankTransactionModel = getModel(BANK_TRANSACTIONS_COLLECTION, bankTransactionSchema);
export const ReconciliationModel = getModel(RECONCILIATIONS_COLLECTION, reconciliationSchema);
export const CashMovementModel = getModel(CASH_MOVEMENTS_COLLECTION, cashMovementSchema);
