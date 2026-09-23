/**
 * Reglas de dominio Manufacturing: máquina de estados de la orden, archivado,
 * normalización del código BOM y validación/escala de líneas de componente.
 * Puras: sin Mongoose, sin Express, sin I/O. Las cantidades usan el máximo de
 * `core/domain/line-totals` (compartido con Sales/Purchasing) y un redondeo
 * propio de unidades (6 decimales) para que `unidad × unidades` no arrastre
 * polvo de coma flotante al ledger de stock.
 */
import type { ProductionStatus } from '../entities/production-order.js';

export { LINES_MAX, QUANTITY_MAX } from '../../../../core/domain/line-totals.js';
import type { BomLine } from '../entities/bom.js';

export const NOTES_MAX = 500;

export interface RuleValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/**
 * Transiciones válidas de la orden. Los estados terminales no declaran
 * transiciones: `completed` es la guarda de at-most-once de los movimientos
 * de stock sin transacciones Mongo (patrón recepción/transferencia).
 */
export const PRODUCTION_TRANSITIONS: Partial<
  Record<ProductionStatus, readonly ProductionStatus[]>
> = {
  draft: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canProductionTransition(from: ProductionStatus, to: ProductionStatus): boolean {
  return (PRODUCTION_TRANSITIONS[from] ?? []).includes(to);
}

/** Los campos de negocio solo son editables en `draft`. */
export function isEditable(status: ProductionStatus): boolean {
  return status === 'draft';
}

export function canArchive(archived: boolean): boolean {
  return !archived;
}

export function canRestore(archived: boolean): boolean {
  return archived;
}

/** Normaliza el código BOM: mayúsculas, espacios → guiones (clave natural). */
export function normalizeBomCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '-');
}

export function validateBomCode(code: string): RuleValidation {
  const issues: string[] = [];
  if (!/^[A-Z0-9][A-Z0-9._-]{1,31}$/.test(code)) {
    issues.push('Code must be 2-32 chars: letters, digits, dot, dash or underscore');
  }
  return { valid: issues.length === 0, issues };
}

/** Redondea cantidades de unidades a 6 decimales (polvo de coma flotante). */
export function roundQuantity(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Reglas de líneas de componente: ≥1 línea, cantidades > 0, sin productos
 * duplicados y el producto terminado NUNCA entre sus propios componentes
 * (auto-referencia: el `completed` se quedaría sin efecto neto).
 */
export function validateComponentLines(
  outputProductId: string,
  lines: readonly BomLine[],
): RuleValidation {
  const issues: string[] = [];
  if (lines.length === 0) {
    issues.push('At least one component line is required');
  }
  const seen = new Set<string>();
  for (const line of lines) {
    if (!(line.quantity > 0)) {
      issues.push('Line quantity must be greater than 0');
    }
    if (seen.has(line.productId)) {
      issues.push('Duplicate component product');
    }
    seen.add(line.productId);
    if (line.productId === outputProductId) {
      issues.push('Output product cannot be a component');
    }
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Requerimientos al completar: `línea × unidades` redondeado a 6 decimales.
 * Las líneas son POR UNIDAD: cambiar `quantity` en `draft` reescala aquí sin
 * tocar el snapshot de `lines`.
 */
export function computeComponentRequirements(
  lines: readonly BomLine[],
  units: number,
): readonly BomLine[] {
  return lines.map((line) => ({
    productId: line.productId,
    quantity: roundQuantity(line.quantity * units),
  }));
}
