import { Schema, model, models, type Model, type SchemaDefinition } from 'mongoose';
import { PARENT_FIELD } from '../../domain/entities/org-unit.js';
import type {
  BranchDoc,
  CompanyDoc,
  CostCenterDoc,
  DepartmentDoc,
  OrganizationDoc,
  WarehouseDoc,
} from './types.js';

/**
 * Colecciones Organization (FASE 5). Todas son documentos de negocio:
 * llevan `tenantId` SIEMPRE como primer campo de índice (ADR-002).
 * Clave natural: `code` único por (tenantId, code).
 */

function getModel<T>(name: string, schema: Schema<T>): Model<T> {
  const existing = models[name] as Model<T> | undefined;
  return existing ?? model<T>(name, schema);
}

function buildSchema(collection: string, parentField: string | null): Schema {
  const definition: Record<string, unknown> = {
    tenantId: { type: String, required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  };
  if (parentField !== null) {
    definition[parentField] = { type: Schema.Types.ObjectId, required: true };
  }
  const schema = new Schema(definition as unknown as SchemaDefinition, {
    timestamps: true,
    collection,
  });
  // Clave natural por tenant: uniqueness sin bloquear otros tenants (ADR-002).
  schema.index({ tenantId: 1, code: 1 }, { unique: true });
  // Listado por tenant con paginación (patrón de consulta de database.md §3).
  schema.index({ tenantId: 1, status: 1, createdAt: -1 });
  if (parentField !== null) {
    // Hijos por padre (borrar/consultar estructura) — tenantId primero.
    schema.index({ tenantId: 1, [parentField]: 1 });
  }
  return schema;
}

export const OrganizationModel = getModel<OrganizationDoc>(
  'Organization',
  buildSchema('organizations', PARENT_FIELD.organization) as Schema<OrganizationDoc>,
);
export const CompanyModel = getModel<CompanyDoc>(
  'Company',
  buildSchema('companies', PARENT_FIELD.company) as Schema<CompanyDoc>,
);
export const BranchModel = getModel<BranchDoc>(
  'Branch',
  buildSchema('branches', PARENT_FIELD.branch) as Schema<BranchDoc>,
);
export const DepartmentModel = getModel<DepartmentDoc>(
  'Department',
  buildSchema('departments', PARENT_FIELD.department) as Schema<DepartmentDoc>,
);
export const WarehouseModel = getModel<WarehouseDoc>(
  'Warehouse',
  buildSchema('warehouses', PARENT_FIELD.warehouse) as Schema<WarehouseDoc>,
);
export const CostCenterModel = getModel<CostCenterDoc>(
  'CostCenter',
  buildSchema('costCenters', PARENT_FIELD.costCenter) as Schema<CostCenterDoc>,
);
