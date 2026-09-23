/**
 * Reglas puras del dominio HR (FASE 19): máquina de estados del empleado
 * (`terminated` terminal), normalización/validación del código y del email,
 * horas `HH:MM` y día de asistencia, período de nómina `YYYY-MM` y neto
 * derivado. Puras: sin Mongoose, sin Express, sin I/O.
 */
import { roundMoney } from '../../../../core/domain/line-totals.js';

export { MONEY_MAX, roundMoney } from '../../../../core/domain/line-totals.js';
import type { EmployeeStatus } from '../entities/employee.js';

export const FIRST_NAME_MAX = 60;
export const LAST_NAME_MAX = 60;
export const POSITION_MAX = 80;
export const DEPARTMENT_MAX = 80;
export const NOTES_MAX = 200;

export interface RuleValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/**
 * Transiciones del empleado. `terminated` es terminal (baja definitiva: la
 * ficha queda congelada salvo archivado); `active ↔ inactive` permite baja
 * y reincorporación temporales.
 */
export const EMPLOYEE_TRANSITIONS: Record<EmployeeStatus, readonly EmployeeStatus[]> = {
  active: ['inactive', 'terminated'],
  inactive: ['active', 'terminated'],
  terminated: [],
};

export function canEmployeeTransition(from: EmployeeStatus, to: EmployeeStatus): boolean {
  return EMPLOYEE_TRANSITIONS[from].includes(to);
}

/** `terminated`: los campos de negocio de la ficha quedan inmutables. */
export function isEmployeeTerminal(status: EmployeeStatus): boolean {
  return EMPLOYEE_TRANSITIONS[status].length === 0;
}

export function canArchive(archived: boolean): boolean {
  return !archived;
}

export function canRestore(archived: boolean): boolean {
  return archived;
}

/** Normaliza el código de empleado: mayúsculas, espacios → guiones. */
export function normalizeEmployeeCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '-');
}

export function validateEmployeeCode(code: string): RuleValidation {
  const issues: string[] = [];
  if (!/^[A-Z0-9][A-Z0-9._-]{1,31}$/.test(code)) {
    issues.push('Code must be 2-32 chars: letters, digits, dot, dash or underscore');
  }
  return { valid: issues.length === 0, issues };
}

/** Normaliza el email (trim + minúsculas). El formato lo valida Zod. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** Hora `HH:MM` en 24h (validador de `checkIn`/`checkOut`). */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/**
 * Día del registro a MEDIANOCHE UTC (la fecha que manda para la unicidad
 * empleado+día; cualquier hora de la petición se trunca al día).
 */
export function normalizeAttendanceDate(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * `checkOut ≥ checkIn` MISMO día: para `HH:MM` con dos dígitos la comparación
 * lexicográfica ES la cronológica (`'09:00' < '10:00'`, `'08:00' < '08:30'`).
 */
export function isCheckOutOnOrAfter(checkIn: string, checkOut: string): boolean {
  return checkOut >= checkIn;
}

/** Período de nómina `YYYY-MM` (mes 01-12). */
export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidPeriod(value: string): boolean {
  return PERIOD_PATTERN.test(value);
}

/** Neto derivado (no persistido): redondeado a 2 decimales. */
export function computeNetPay(base: number, bonus: number, deduction: number): number {
  return roundMoney(base + bonus - deduction);
}
