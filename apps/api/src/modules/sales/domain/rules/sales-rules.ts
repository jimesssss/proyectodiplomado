/**
 * Reglas de dominio Sales: importes, líneas y transiciones de estado.
 * Puras: sin Mongoose, sin Express, sin I/O. El cálculo de líneas/totales se
 * comparte con Purchasing desde `core/domain/line-totals` (FASE 10).
 */
import type { SaleKind, SaleStatus } from '../entities/sale-document.js';

// Líneas y dinero: se re-exportan desde core (únicos dueños del cálculo).
export {
  LINES_MAX,
  MONEY_MAX,
  QUANTITY_MAX,
  computeLine,
  computeTotals,
  normalizeLines,
  roundMoney,
} from '../../../../core/domain/line-totals.js';
export type { DocumentLineInput as SaleLineInput } from '../../../../core/domain/line-totals.js';

export const NOTES_MAX = 500;

export interface RuleValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/**
 * Transiciones válidas por tipo. Cada tipo solo declara SUS estados (el resto
 * queda ausente → sin transiciones). `approved` SOLO por el endpoint de
 * approve (nunca vía PATCH genérico).
 */
export const SALE_TRANSITIONS: Record<
  SaleKind,
  Partial<Record<SaleStatus, readonly SaleStatus[]>>
> = {
  'sales.quote': {
    draft: ['sent', 'cancelled'],
    sent: ['approved', 'rejected', 'cancelled'],
    approved: [],
    rejected: [],
    cancelled: [],
  },
  'sales.order': {
    draft: ['confirmed', 'cancelled'],
    confirmed: ['fulfilled'],
    fulfilled: [],
    cancelled: [],
  },
  'sales.delivery': {
    draft: ['shipped', 'cancelled'],
    shipped: ['received'],
    received: [],
    cancelled: [],
  },
  'sales.invoice': {
    draft: ['issued', 'cancelled'],
    issued: ['paid'],
    paid: [],
    cancelled: [],
  },
  'sales.return': {
    draft: ['received', 'cancelled'],
    received: ['refunded'],
    refunded: [],
    cancelled: [],
  },
};

export function canTransition(kind: SaleKind, from: SaleStatus, to: SaleStatus): boolean {
  const allowed = SALE_TRANSITIONS[kind][from] ?? [];
  return allowed.includes(to);
}

/** Solo los borradores son editables más allá de su estado. */
export function isEditable(status: SaleStatus): boolean {
  return status === 'draft';
}

export function canArchive(archived: boolean): boolean {
  return !archived;
}

export function canRestore(archived: boolean): boolean {
  return archived;
}

/** Normaliza una moneda ISO-4217 a mayúsculas. */
export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

export function validateCurrency(currency: string): RuleValidation {
  const issues: string[] = [];
  const normalized = normalizeCurrency(currency);
  if (!/^[A-Z]{3}$/.test(normalized)) {
    issues.push('Currency must be a 3-letter ISO-4217 code');
  }
  return { valid: issues.length === 0, issues };
}
