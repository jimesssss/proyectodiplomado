/**
 * Dominio Organization — entidad base de la estructura org.
 * Jerarquía: Tenant → Organization → Company → Branch → Department/Warehouse
 *                                        └→ CostCenter
 */

export const ORG_KINDS = [
  'organization',
  'company',
  'branch',
  'department',
  'warehouse',
  'costCenter',
] as const;

export type OrgKind = (typeof ORG_KINDS)[number];

export type OrgStatus = 'active' | 'archived';

export type ParentField = 'organizationId' | 'companyId' | 'branchId';

/** Campo que guarda el padre en el documento de cada tipo. */
export const PARENT_FIELD: Record<OrgKind, ParentField | null> = {
  organization: null,
  company: 'organizationId',
  branch: 'companyId',
  department: 'branchId',
  warehouse: 'branchId',
  costCenter: 'companyId',
};

/** Tipo de padre requerido (null = raíz, no lleva padre). */
export const PARENT_KIND: Record<OrgKind, OrgKind | null> = {
  organization: null,
  company: 'organization',
  branch: 'company',
  department: 'branch',
  warehouse: 'branch',
  costCenter: 'company',
};

export interface OrgUnit {
  readonly id: string;
  readonly kind: OrgKind;
  readonly tenantId: string;
  readonly parentId: string | null;
  readonly code: string;
  readonly name: string;
  readonly status: OrgStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas de la API. */
export interface PublicOrgUnit {
  readonly id: string;
  readonly kind: OrgKind;
  readonly parentId: string | null;
  readonly code: string;
  readonly name: string;
  readonly status: OrgStatus;
}

export function toPublicOrgUnit(unit: OrgUnit): PublicOrgUnit {
  return {
    id: unit.id,
    kind: unit.kind,
    parentId: unit.parentId,
    code: unit.code,
    name: unit.name,
    status: unit.status,
  };
}
