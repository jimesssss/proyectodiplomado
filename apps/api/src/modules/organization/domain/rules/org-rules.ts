/**
 * Reglas de dominio Organization: código, nombre y jerarquía.
 * Puras: sin Mongoose, sin Express, sin I/O.
 */

import { PARENT_KIND, type OrgKind, type OrgStatus } from '../entities/org-unit.js';

export const CODE_MIN_LENGTH = 2;
export const CODE_MAX_LENGTH = 24;
export const NAME_MIN_LENGTH = 1;
export const NAME_MAX_LENGTH = 120;

const CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export interface RuleValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/** Normaliza un código: trim, mayúsculas y espacios → guión. Idempotente. */
export function normalizeCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Valida un código ya normalizado (2-24, mayúsculas/dígitos/guiones internos). */
export function validateCode(code: string): RuleValidation {
  const issues: string[] = [];
  if (code.length < CODE_MIN_LENGTH) {
    issues.push(`Code must be at least ${CODE_MIN_LENGTH} characters`);
  }
  if (code.length > CODE_MAX_LENGTH) {
    issues.push(`Code must be at most ${CODE_MAX_LENGTH} characters`);
  }
  if (!CODE_PATTERN.test(code)) {
    issues.push('Code must contain only uppercase letters, digits and inner hyphens');
  }
  return { valid: issues.length === 0, issues };
}

/** Valida y recorta el nombre. Devuelve el valor recortado. */
export function validateOrgName(name: string): RuleValidation & { readonly value: string } {
  const trimmed = name.trim();
  const issues: string[] = [];
  if (trimmed.length < NAME_MIN_LENGTH) {
    issues.push(`Name must be at least ${NAME_MIN_LENGTH} characters`);
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    issues.push(`Name must be at most ${NAME_MAX_LENGTH} characters`);
  }
  return { valid: issues.length === 0, issues, value: trimmed };
}

/** Un código debe llevar padre si el tipo lo exige; la raíz no. */
export function requiresParent(kind: OrgKind): boolean {
  return PARENT_KIND[kind] !== null;
}

/** Solo lo activo se archiva; solo lo archivado se restaura. */
export function canArchive(status: OrgStatus): boolean {
  return status === 'active';
}

export function canRestore(status: OrgStatus): boolean {
  return status === 'archived';
}
