/**
 * Reglas de dominio Inventory: transiciones de estado de transferencias y
 * conteos, archivado y normalización del maestro de productos. Puras: sin
 * Mongoose, sin Express, sin I/O. El dinero (costo/precio de producto) usa el
 * redondeo de `core/domain/line-totals` (compartido con Sales/Purchasing).
 */
import type { CountStatus, TransferStatus } from '../entities/stock-documents.js';

export const NOTES_MAX = 500;

export interface RuleValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

export { roundMoney } from '../../../../core/domain/line-totals.js';

/** Prefijos de numeración (`PREFIX-YYYY-000001`, core/numbering). */
export const TRANSFER_PREFIX = 'TR';
export const COUNT_PREFIX = 'CT';

/**
 * Transferencia: `draft → in_transit → completed`; `cancelled` desde
 * `draft`/`in_transit`. El stock se mueve SOLO al `completed`.
 */
export const TRANSFER_TRANSITIONS: Partial<Record<TransferStatus, readonly TransferStatus[]>> = {
  draft: ['in_transit', 'cancelled'],
  in_transit: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * Conteo: `draft → cancelled`; la aprobación (`draft → approved`) SOLO vía
 * `POST /inventory/counts/:id/approve` con `stock.count:approve` — el PATCH la
 * rechaza explícitamente (409, como en Sales).
 */
export const COUNT_TRANSITIONS: Partial<Record<CountStatus, readonly CountStatus[]>> = {
  draft: ['approved', 'cancelled'],
  approved: [],
  cancelled: [],
};

export function canTransferTransition(from: TransferStatus, to: TransferStatus): boolean {
  return (TRANSFER_TRANSITIONS[from] ?? []).includes(to);
}

export function canCountTransition(from: CountStatus, to: CountStatus): boolean {
  return (COUNT_TRANSITIONS[from] ?? []).includes(to);
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

/** Normaliza el código de producto: mayúsculas, espacios → guiones. */
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
