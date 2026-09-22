import { Schema, model, models, type Model } from 'mongoose';
import { ACCOUNT_NATURES } from '../../domain/entities/account.js';
import type { AccountDoc, FiscalPeriodDoc, JournalEntryDoc, TaxDoc } from './types.js';

/**
 * Cuatro colecciones (las rutas de convenciones §4 para FASE 12): `accounts`
 * (plan contable), `journalEntries` (asientos con líneas embebidas —
 * desviación documentada: `journalLines` NO es una colección separada,
 * igual que las líneas de ventas/compras), `fiscalPeriods` y `taxes`. La
 * numeración de asientos usa `counters` (core/numbering). Todas con
 * `tenantId` primero en sus índices (ADR-002) y queries justificadas en
 * `docs/database/accounting.md`.
 *
 * NOT IMPLEMENTED en esta fase (documentado): `budgets`, `accountingDocuments`,
 * `currencies`, `exchangeRates` (ver reporte de fase).
 */
export const ACCOUNTS_COLLECTION = 'accounts';
export const JOURNAL_ENTRIES_COLLECTION = 'journalEntries';
export const FISCAL_PERIODS_COLLECTION = 'fiscalPeriods';
export const TAXES_COLLECTION = 'taxes';

const accountSchema = new Schema<AccountDoc>(
  {
    tenantId: { type: String, required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    nature: { type: String, required: true, enum: [...ACCOUNT_NATURES] },
    description: { type: String, default: null },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: ACCOUNTS_COLLECTION },
);

accountSchema.index({ tenantId: 1, code: 1 }, { unique: true });
accountSchema.index({ tenantId: 1, createdAt: -1 });
accountSchema.index({ tenantId: 1, archived: 1, createdAt: -1 });

const journalLineSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, required: true },
    description: { type: String, default: null },
    debit: { type: Number, required: true },
    credit: { type: Number, required: true },
  },
  { _id: false },
);

const journalSchema = new Schema<JournalEntryDoc>(
  {
    tenantId: { type: String, required: true },
    number: { type: String, required: true },
    date: { type: Date, required: true },
    currency: { type: String, required: true },
    lines: { type: [journalLineSchema], required: true },
    debitTotal: { type: Number, required: true },
    creditTotal: { type: Number, required: true },
    status: { type: String, required: true },
    periodId: { type: Schema.Types.ObjectId, default: null },
    reference: { type: String, default: null },
    notes: { type: String, default: null },
  },
  { timestamps: true, collection: JOURNAL_ENTRIES_COLLECTION },
);

journalSchema.index({ tenantId: 1, number: 1 }, { unique: true });
journalSchema.index({ tenantId: 1, createdAt: -1 });
journalSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
// Extracto por cuenta: GET /accounting/journal-entries?accountId= (multikey
// sobre el array de líneas: una sola ruta de consulta para todas las cuentas).
journalSchema.index({ tenantId: 1, 'lines.accountId': 1, createdAt: -1 });
// Asientos posteados de un período: GET …?periodId= (cierre/reporte).
journalSchema.index({ tenantId: 1, periodId: 1, createdAt: -1 });

const periodSchema = new Schema<FiscalPeriodDoc>(
  {
    tenantId: { type: String, required: true },
    code: { type: String, required: true },
    name: { type: String, default: null },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    status: { type: String, required: true },
  },
  { timestamps: true, collection: FISCAL_PERIODS_COLLECTION },
);

periodSchema.index({ tenantId: 1, code: 1 }, { unique: true });
periodSchema.index({ tenantId: 1, createdAt: -1 });
// Resolución "período que cubre la fecha" al postear: startsAt ≤ d ≤ endsAt
// (rango sobre startsAt + endsAt cubierto por el índice).
periodSchema.index({ tenantId: 1, startsAt: -1, endsAt: -1 });

const taxSchema = new Schema<TaxDoc>(
  {
    tenantId: { type: String, required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    rate: { type: Number, required: true },
    description: { type: String, default: null },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: TAXES_COLLECTION },
);

taxSchema.index({ tenantId: 1, code: 1 }, { unique: true });
taxSchema.index({ tenantId: 1, createdAt: -1 });
taxSchema.index({ tenantId: 1, archived: 1, createdAt: -1 });

function getModel<T>(collection: string, schema: Schema<T>): Model<T> {
  const existing = models[collection] as Model<T> | undefined;
  if (existing !== undefined) {
    return existing;
  }
  return model<T>(collection, schema);
}

export const AccountModel = getModel(ACCOUNTS_COLLECTION, accountSchema);
export const JournalEntryModel = getModel(JOURNAL_ENTRIES_COLLECTION, journalSchema);
export const FiscalPeriodModel = getModel(FISCAL_PERIODS_COLLECTION, periodSchema);
export const TaxModel = getModel(TAXES_COLLECTION, taxSchema);
