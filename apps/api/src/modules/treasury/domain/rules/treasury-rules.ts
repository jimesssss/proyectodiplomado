/**
 * Reglas de dominio Treasury (FASE 13): máquina de pagos/cobros, archivado,
 * normalización de código/divisa. Puras: sin Mongoose, sin Express, sin I/O.
 * El dinero reutiliza el redondeo de `core/domain/line-totals` (únicos
 * dueños del cálculo).
 */
import type { MoneyStatus } from '../entities/money-documents.js';

export const NOTES_MAX = 500;
export const REFERENCE_MAX = 128;
export const ACCOUNT_NUMBER_MAX = 64;
export const EXTERNAL_ID_MAX = 64;
export const TX_DESCRIPTION_MAX = 200;
export const RECONCILIATION_LINES_MAX = 200;

export interface RuleValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

// Dinero: se re-exporta desde core (únicos dueños del cálculo).
export { MONEY_MAX, roundMoney } from '../../../../core/domain/line-totals.js';

/** Prefijos de numeración (`PAY/RCP/REC-YYYY-000001`, core/numbering). */
export const PAYMENT_PREFIX = 'PAY';
export const RECEIPT_PREFIX = 'RCP';
export const RECONCILIATION_PREFIX = 'REC';

/**
 * Pago/Cobro: `draft → posted|cancelled`. El catálogo NO tiene `:post` → la
 * publicación va con `:update` (`PATCH {status:'posted'}`, patrón
 * `goods.receipt`); `posted` mueve saldo + ledger (at-most-once) y es
 * terminal.
 */
export const MONEY_TRANSITIONS: Partial<Record<MoneyStatus, readonly MoneyStatus[]>> = {
  draft: ['posted', 'cancelled'],
  posted: [],
  cancelled: [],
};

export function canMoneyTransition(from: MoneyStatus, to: MoneyStatus): boolean {
  return (MONEY_TRANSITIONS[from] ?? []).includes(to);
}

/** Solo los borradores son editables más allá de su estado. */
export function isEditable(status: string): boolean {
  return status === 'draft';
}

export function canArchive(archived: boolean): boolean {
  return !archived;
}

export function canRestore(archived: boolean): boolean {
  return archived;
}

/** Normaliza códigos de cuenta: mayúsculas, espacios → guiones. */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '-');
}

export function validateCode(code: string): RuleValidation {
  const issues: string[] = [];
  if (!/^[A-Z0-9][A-Z0-9._-]{1,31}$/.test(code)) {
    issues.push('Code must be 2-32 chars: letters, digits, dot, dash or underscore');
  }
  return { valid: issues.length === 0, issues };
}

/** Normaliza la divisa a ISO-4217 (3 letras en mayúsculas). */
export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

export function validateCurrency(currency: string): RuleValidation {
  const issues: string[] = [];
  if (!/^[A-Z]{3}$/.test(normalizeCurrency(currency))) {
    issues.push('Currency must be an ISO-4217 code (3 letters)');
  }
  return { valid: issues.length === 0, issues };
}
