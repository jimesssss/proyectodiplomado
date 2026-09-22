/**
 * Reglas de dominio Accounting (FASE 12): transiciones de asientos y
 * períodos, archivado de maestros, normalización de código/divisa y el
 * cálculo de totales del asiento (partida doble). Puras: sin Mongoose, sin
 * Express, sin I/O. El dinero usa el redondeo de `core/domain/line-totals`
 * (únicos dueños del cálculo, compartido con Sales/Purchasing/Inventory).
 */
import type { PeriodStatus } from '../entities/fiscal-period.js';
import type { JournalLine, JournalStatus } from '../entities/journal-entry.js';
import { roundMoney } from '../../../../core/domain/line-totals.js';

export const NOTES_MAX = 500;
export const REFERENCE_MAX = 128;
export const LINE_DESCRIPTION_MAX = 200;

export interface RuleValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

// Dinero: se re-exporta desde core (únicos dueños del cálculo).
export { MONEY_MAX, roundMoney } from '../../../../core/domain/line-totals.js';

/** Prefijo de numeración de asientos (`JE-YYYY-000001`, core/numbering). */
export const JOURNAL_PREFIX = 'JE';

/**
 * Asiento: `draft → posted|cancelled`. `posted` SOLO vía
 * `POST /accounting/journal-entries/:id/post` con `accounting.journal:post`
 * — el PATCH de estado lo rechaza con un 409 accionable (patrón de
 * `sales.quote:approve` y `stock.count:approve`).
 */
export const JOURNAL_TRANSITIONS: Partial<Record<JournalStatus, readonly JournalStatus[]>> = {
  draft: ['posted', 'cancelled'],
  posted: [],
  cancelled: [],
};

/** Período fiscal: `open → closed` (terminal: sin re-apertura en FASE 12). */
export const PERIOD_TRANSITIONS: Partial<Record<PeriodStatus, readonly PeriodStatus[]>> = {
  open: ['closed'],
  closed: [],
};

export function canJournalTransition(from: JournalStatus, to: JournalStatus): boolean {
  return (JOURNAL_TRANSITIONS[from] ?? []).includes(to);
}

export function canPeriodTransition(from: PeriodStatus, to: PeriodStatus): boolean {
  return (PERIOD_TRANSITIONS[from] ?? []).includes(to);
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

/** Normaliza códigos (cuentas/impuestos/períodos): mayúsculas, espacios → guiones. */
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

/** Input de línea del asiento (el cliente envía importes crudos). */
export interface JournalLineInput {
  readonly accountId: string;
  readonly description?: string | undefined;
  readonly debit: number;
  readonly credit: number;
}

/**
 * Normaliza las líneas del asiento: importes a 2 decimales (redondeo
 * comercial) y descripción con default `null`. El XOR débito/haber lo
 * valida el esqueStricto en presentación; el SERVIDOR vuelve a comprobar el
 * balance antes de persistir y al postear.
 */
export function normalizeJournalLines(inputs: readonly JournalLineInput[]): readonly JournalLine[] {
  return inputs.map((input) => ({
    accountId: input.accountId,
    description: input.description ?? null,
    debit: roundMoney(input.debit),
    credit: roundMoney(input.credit),
  }));
}

/**
 * Totales del asiento: sumas redondeadas (los floats de 2 decimales son
 * canónicos → la comparación de igualdad es exacta).
 */
export function journalTotals(lines: readonly JournalLine[]): {
  readonly debits: number;
  readonly credits: number;
} {
  let debits = 0;
  let credits = 0;
  for (const line of lines) {
    debits += line.debit;
    credits += line.credit;
  }
  return { debits: roundMoney(debits), credits: roundMoney(credits) };
}
