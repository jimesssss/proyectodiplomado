import { z } from 'zod';
import { MONEY_STATUSES } from '../../domain/entities/money-documents.js';
import { TREASURY_ACCOUNT_TYPES } from '../../domain/entities/treasury-account.js';
import {
  ACCOUNT_NUMBER_MAX,
  EXTERNAL_ID_MAX,
  MONEY_MAX,
  NOTES_MAX,
  RECONCILIATION_LINES_MAX,
  REFERENCE_MAX,
  TX_DESCRIPTION_MAX,
} from '../../domain/rules/treasury-rules.js';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdPattern, 'Invalid id');

/**
 * Esquemas estrictos: cualquier campo desconocido (incluido `tenantId`,
 * `number`/`status`/`archived` en create de pagos/cobros, `type`/`code`/
 * `currency`/`openingBalance`/`balance` en el PATCH de cuentas,
 * `reconciliationId` en transacciones bancarias o `number` en
 * conciliaciones — todos SOLO-los-escribe-el-servidor) se RECHAZA con 400
 * (ADR-002).
 */

const pageField = z.coerce.number().int().min(1).max(10_000).default(1);
const limitField = z.coerce.number().int().min(1).max(100).default(20);
const archivedField = z.enum(['true', 'false']).transform((value) => value === 'true');
const reconciledField = z.enum(['true', 'false']).transform((value) => value === 'true');
const currencyField = z
  .string()
  .regex(/^[A-Za-z]{3}$/, 'Invalid currency (ISO-4217)')
  .optional();
const amountField = z.number().min(0.01).max(MONEY_MAX);

// --- Cuentas de tesorería (banco o caja) ---

export const createTreasuryAccountBodySchema = z.strictObject({
  type: z.enum(TREASURY_ACCOUNT_TYPES),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  description: z.string().max(2_000).optional(),
  accountNumber: z.string().min(1).max(ACCOUNT_NUMBER_MAX).optional(),
  currency: currencyField,
  openingBalance: z.number().min(0).max(MONEY_MAX).optional(),
});

/** `type`/`code`/`currency`/`openingBalance`/`balance` inmutables (→ 400). */
export const patchTreasuryAccountBodySchema = z.strictObject({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2_000).nullable().optional(),
  archived: z.boolean().optional(),
});

export const treasuryAccountListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  type: z.enum(TREASURY_ACCOUNT_TYPES).optional(),
  archived: archivedField.optional(),
});

// --- Movimientos (ledger, solo lectura) ---

export const movementsListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
});

// --- Pagos (dinero OUT) ---

export const createPaymentBodySchema = z.strictObject({
  accountId: objectId,
  amount: amountField,
  date: z.coerce.date().optional(),
  invoiceId: objectId.optional(),
  reference: z.string().max(REFERENCE_MAX).optional(),
  notes: z.string().max(NOTES_MAX).optional(),
});

/** `number`/`tenantId` inmutables (→ 400); `status` solo con máquina (409). */
export const patchPaymentBodySchema = z.strictObject({
  accountId: objectId.optional(),
  amount: amountField.optional(),
  date: z.coerce.date().optional(),
  invoiceId: objectId.nullable().optional(),
  reference: z.string().max(REFERENCE_MAX).nullable().optional(),
  notes: z.string().max(NOTES_MAX).nullable().optional(),
  status: z.enum(MONEY_STATUSES).optional(),
  archived: z.boolean().optional(),
});

export const paymentListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  status: z.enum(MONEY_STATUSES).optional(),
  accountId: objectId.optional(),
});

// --- Cobros (dinero IN) ---

export const createReceiptBodySchema = z.strictObject({
  accountId: objectId,
  amount: amountField,
  date: z.coerce.date().optional(),
  invoiceId: objectId.optional(),
  reference: z.string().max(REFERENCE_MAX).optional(),
  notes: z.string().max(NOTES_MAX).optional(),
});

export const patchReceiptBodySchema = z.strictObject({
  accountId: objectId.optional(),
  amount: amountField.optional(),
  date: z.coerce.date().optional(),
  invoiceId: objectId.nullable().optional(),
  reference: z.string().max(REFERENCE_MAX).nullable().optional(),
  notes: z.string().max(NOTES_MAX).nullable().optional(),
  status: z.enum(MONEY_STATUSES).optional(),
  archived: z.boolean().optional(),
});

export const receiptListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  status: z.enum(MONEY_STATUSES).optional(),
  accountId: objectId.optional(),
});

// --- Líneas de estado de cuenta (registros externos del banco) ---

/**
 * Importe CON signo (depósito + / retiro −) y ≠ 0: la línea es el hecho
 * bancario; NO mueve el saldo interno.
 */
export const createBankTransactionBodySchema = z.strictObject({
  accountId: objectId,
  amount: z
    .number()
    .min(-MONEY_MAX)
    .max(MONEY_MAX)
    .refine((value) => value !== 0, { message: 'amount must not be zero' }),
  date: z.coerce.date().optional(),
  externalId: z.string().max(EXTERNAL_ID_MAX).optional(),
  description: z.string().max(TX_DESCRIPTION_MAX).optional(),
});

/** Solo `description`: importe/fecha/cuenta/externalId/reconciliationId → 400. */
export const patchBankTransactionBodySchema = z.strictObject({
  description: z.string().max(TX_DESCRIPTION_MAX).nullable().optional(),
});

export const bankTransactionListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  accountId: objectId.optional(),
  reconciled: reconciledField.optional(),
});

// --- Conciliaciones ---

const reconciliationLineSchema = z.strictObject({
  bankTransactionId: objectId,
  movementId: objectId.nullable().optional(),
});

export const createReconciliationBodySchema = z.strictObject({
  accountId: objectId,
  reconciledAt: z.coerce.date().optional(),
  lines: z.array(reconciliationLineSchema).min(1).max(RECONCILIATION_LINES_MAX),
  notes: z.string().max(NOTES_MAX).optional(),
});

/** `number` inmutable (→ 400); `lines` se REEMPLAZA con re-validación. */
export const patchReconciliationBodySchema = z.strictObject({
  lines: z.array(reconciliationLineSchema).min(1).max(RECONCILIATION_LINES_MAX).optional(),
  notes: z.string().max(NOTES_MAX).nullable().optional(),
});

export const reconciliationListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  accountId: objectId.optional(),
});
