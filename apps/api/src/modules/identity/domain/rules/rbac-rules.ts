/**
 * Reglas de dominio RBAC: claves de rol y listas de permisos.
 * Puras: sin Mongoose, sin Express, sin I/O.
 */
import { isBuiltinRole, isPermission, type Permission } from '@erp/permissions';

export const ROLE_KEY_MIN_LENGTH = 2;
export const ROLE_KEY_MAX_LENGTH = 32;
export const ROLE_PERMISSIONS_MAX = 200;

const ROLE_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;

export interface RuleValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/** Clave de rol: minúsculas/dígitos/guiones internos, empieza por letra. */
export function validateRoleKey(key: string): RuleValidation {
  const issues: string[] = [];
  if (key.length < ROLE_KEY_MIN_LENGTH) {
    issues.push(`Role key must be at least ${ROLE_KEY_MIN_LENGTH} characters`);
  }
  if (key.length > ROLE_KEY_MAX_LENGTH) {
    issues.push(`Role key must be at most ${ROLE_KEY_MAX_LENGTH} characters`);
  }
  if (!ROLE_KEY_PATTERN.test(key)) {
    issues.push('Role key must be lowercase with inner hyphens and start with a letter');
  }
  if (isBuiltinRole(key)) {
    issues.push('Role key is reserved (built-in)');
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Valida una lista de permisos contra el catálogo canónico:
 * claves desconocidas → inválido; duplicados → se eliminan.
 */
export function validatePermissionList(
  keys: readonly string[],
): RuleValidation & { readonly value: readonly Permission[] } {
  const issues: string[] = [];
  if (keys.length > ROLE_PERMISSIONS_MAX) {
    issues.push(`At most ${ROLE_PERMISSIONS_MAX} permissions per role`);
  }
  const unique = new Set<Permission>();
  for (const key of keys) {
    if (!isPermission(key)) {
      issues.push(`Unknown permission: ${key}`);
      continue;
    }
    unique.add(key);
  }
  return { valid: issues.length === 0, issues, value: [...unique] };
}
