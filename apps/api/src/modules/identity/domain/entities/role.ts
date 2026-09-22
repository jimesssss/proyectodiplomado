/**
 * Dominio Identity — rol tenant-scoped (ADR-005).
 */
import type { Permission } from '@erp/permissions';

export interface Role {
  readonly id: string;
  readonly tenantId: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly permissions: readonly Permission[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura del rol (no expone el tenantId ajeno al dueño). */
export interface PublicRole {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly permissions: readonly Permission[];
}

export function toPublicRole(role: Role): PublicRole {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    permissions: role.permissions,
  };
}
