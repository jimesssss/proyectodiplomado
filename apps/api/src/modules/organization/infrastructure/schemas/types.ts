import type { Types } from 'mongoose';
import type { OrgStatus } from '../../domain/entities/org-unit.js';

/**
 * Tipos de documento Organization.
 * Se usa `Types.ObjectId` (nunca el `ObjectId` de nivel superior: rompe los
 * filtros de mongoose 9 — ver FASE 3).
 * Cada tipo comparte la base y añade SU campo de padre.
 */
export interface OrgDocBase {
  _id: Types.ObjectId;
  tenantId: string;
  code: string;
  name: string;
  status: OrgStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type OrganizationDoc = OrgDocBase;

export interface CompanyDoc extends OrgDocBase {
  organizationId: Types.ObjectId;
}

export interface BranchDoc extends OrgDocBase {
  companyId: Types.ObjectId;
}

export interface DepartmentDoc extends OrgDocBase {
  branchId: Types.ObjectId;
}

export interface WarehouseDoc extends OrgDocBase {
  branchId: Types.ObjectId;
}

export interface CostCenterDoc extends OrgDocBase {
  companyId: Types.ObjectId;
}
