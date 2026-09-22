/**
 * Reglas de dominio Sales: importes, líneas y transiciones de estado.
 * Puras: sin Mongoose, sin Express, sin I/O. El dinero se calcula SIEMPRE en
 * el servidor a 2 decimales (redondeo commercial: mitad hacia arriba).
 */
import type { SaleKind, SaleLine, SaleStatus } from '../entities/sale-document.js';

export const LINES_MAX = 200;
export const QUANTITY_MAX = 1_000_000;
export const MONEY_MAX = 1e12;
export const NOTES_MAX = 500;

export interface RuleValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/** Redondeo comercial a 2 decimales (para el total de línea y los totales). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface SaleLineInput {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly taxRate: number;
  readonly discountPct: number;
}

/**
 * Calcula una línea: `subtotal = qty × precio × (1 - dto%)` (2 dec.),
 * `tax = subtotal × taxRate%` (2 dec.), `total = subtotal + tax`.
 * El descuento se aplica ANTES del impuesto.
 */
export function computeLine(input: SaleLineInput): SaleLine {
  const base = roundMoney(input.quantity * input.unitPrice * (1 - input.discountPct / 100));
  const tax = roundMoney(base * (input.taxRate / 100));
  return {
    description: input.description,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    taxRate: input.taxRate,
    discountPct: input.discountPct,
    subtotal: base,
    tax,
    total: roundMoney(base + tax),
  };
}

/** Totales del documento = suma de líneas YA redondeadas (2 dec.). */
export function computeTotals(lines: readonly SaleLine[]): {
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
} {
  let subtotal = 0;
  let tax = 0;
  for (const line of lines) {
    subtotal = roundMoney(subtotal + line.subtotal);
    tax = roundMoney(tax + line.tax);
  }
  return { subtotal, tax, total: roundMoney(subtotal + tax) };
}

export function normalizeLines(inputs: readonly SaleLineInput[]): readonly SaleLine[] {
  return inputs.map(computeLine);
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
