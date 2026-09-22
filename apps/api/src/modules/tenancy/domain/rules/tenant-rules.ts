/**
 * Reglas de dominio Tenancy: slug, nombre y transiciones de estado.
 * Puras: sin Mongoose, sin Express, sin I/O.
 */

import type { TenantStatus } from '../entities/tenant.js';

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 32;
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 120;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface RuleValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/**
 * Normaliza un valor a slug canónico: minúsculas, sin acentos, separadores
 * en guiones simples y sin guiones en los extremos. Idempotente.
 */
export function normalizeSlug(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Valida un slug ya normalizado (3-32, minúsculas/dígitos/guiones internos). */
export function validateSlug(slug: string): RuleValidation {
  const issues: string[] = [];
  if (slug.length < SLUG_MIN_LENGTH) {
    issues.push(`Slug must be at least ${SLUG_MIN_LENGTH} characters`);
  }
  if (slug.length > SLUG_MAX_LENGTH) {
    issues.push(`Slug must be at most ${SLUG_MAX_LENGTH} characters`);
  }
  if (!SLUG_PATTERN.test(slug)) {
    issues.push('Slug must contain only lowercase letters, digits and inner hyphens');
  }
  return { valid: issues.length === 0, issues };
}

/** Valida y recorta el nombre del tenant. Devuelve el valor recortado. */
export function validateTenantName(name: string): RuleValidation & { readonly value: string } {
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

/** Solo un tenant activo puede suspenderse (idempotencia → 409 en el servicio). */
export function canSuspend(status: TenantStatus): boolean {
  return status === 'active';
}

/** Solo un tenant suspendido puede reactivarse. */
export function canReactivate(status: TenantStatus): boolean {
  return status === 'suspended';
}
