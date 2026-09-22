/**
 * Reglas de dominio Purchasing: transiciones de estado, archivado y
 * normalización del maestro de proveedores. Puras: sin Mongoose, sin Express,
 * sin I/O. El cálculo de líneas/totales se comparte con Sales desde
 * `core/domain/line-totals` (FASE 10).
 */
import type { PurchaseKind, PurchaseStatus } from '../entities/purchase-document.js';

export const NOTES_MAX = 500;

export interface RuleValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

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
export type { DocumentLineInput as PurchaseLineInput } from '../../../../core/domain/line-totals.js';

/**
 * Transiciones válidas por tipo. Cada tipo solo declara SUS estados (el resto
 * queda ausente → sin transiciones). `approved` de solicitud se concede vía
 * PATCH con `purchase.request:update` (no existe permiso `:approve` en el
 * catálogo de compras).
 */
export const PURCHASE_TRANSITIONS: Record<
  PurchaseKind,
  Partial<Record<PurchaseStatus, readonly PurchaseStatus[]>>
> = {
  'purchase.request': {
    draft: ['submitted', 'cancelled'],
    submitted: ['approved', 'rejected', 'cancelled'],
    approved: [],
    rejected: [],
    cancelled: [],
  },
  'purchase.order': {
    draft: ['confirmed', 'cancelled'],
    confirmed: ['completed'],
    completed: [],
    cancelled: [],
  },
  'goods.receipt': {
    draft: ['received', 'cancelled'],
    received: ['posted'],
    posted: [],
    cancelled: [],
  },
  'supplier.invoice': {
    draft: ['issued', 'cancelled'],
    issued: ['paid'],
    paid: [],
    cancelled: [],
  },
  'purchase.return': {
    draft: ['received', 'cancelled'],
    received: ['refunded'],
    refunded: [],
    cancelled: [],
  },
};

export function canTransition(
  kind: PurchaseKind,
  from: PurchaseStatus,
  to: PurchaseStatus,
): boolean {
  const allowed = PURCHASE_TRANSITIONS[kind][from] ?? [];
  return allowed.includes(to);
}

/** Solo los borradores son editables más allá de su estado. */
export function isEditable(status: PurchaseStatus): boolean {
  return status === 'draft';
}

export function canArchive(archived: boolean): boolean {
  return !archived;
}

export function canRestore(archived: boolean): boolean {
  return archived;
}

/** Normaliza el código de proveedor: mayúsculas, espacios → guiones. */
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
