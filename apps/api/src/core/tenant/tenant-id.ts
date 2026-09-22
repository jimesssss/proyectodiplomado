import { ValidationError } from '../errors/app-error.js';

/**
 * Identificador de tenant con marca de tipo (branded type).
 * Un `string` normal NO es un `TenantId`: esto obliga en compilación a que
 * los repositorios reciban el tenant desde el contexto autenticado.
 */
declare const tenantIdBrand: unique symbol;

export type TenantId = string & { readonly [tenantIdBrand]: 'TenantId' };

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/** Convierte un valor a TenantId validando formato. */
export function asTenantId(value: string): TenantId {
  if (!OBJECT_ID_PATTERN.test(value)) {
    throw new ValidationError('Invalid tenant id');
  }
  return value as TenantId;
}

/** Contexto de tenant que viaja por cada caso de uso. */
export interface TenantContext {
  readonly tenantId: TenantId;
}
