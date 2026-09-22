import { Types, type Model } from 'mongoose';
import { ConflictError } from '../../../../core/errors/app-error.js';
import {
  PARENT_FIELD,
  type OrgKind,
  type OrgStatus,
  type OrgUnit,
  type ParentField,
} from '../../domain/entities/org-unit.js';
import {
  BranchModel,
  CompanyModel,
  CostCenterModel,
  DepartmentModel,
  OrganizationModel,
  WarehouseModel,
} from '../schemas/collections.js';
import type { OrgDocBase } from '../schemas/types.js';

/**
 * Repositorio Organization — único camino a MongoDB del módulo.
 * UNA implementación genérica parametrizada por tipo (evita duplicar la
 * lógica de 6 colecciones) + registro explícito de cada modelo.
 * TODA operación filtra por `tenantId` (nunca llega del cliente).
 */

type AnyOrgDoc = OrgDocBase & Partial<Record<ParentField, Types.ObjectId>>;

export interface OrgListPage {
  readonly items: readonly OrgUnit[];
  readonly total: number;
}

export interface OrgKindRepo {
  readonly kind: OrgKind;
  create(input: {
    tenantId: string;
    code: string;
    name: string;
    parentId: string | null;
  }): Promise<OrgUnit>;
  findById(tenantId: string, id: string): Promise<OrgUnit | null>;
  findByCode(tenantId: string, code: string): Promise<OrgUnit | null>;
  list(tenantId: string, page: number, limit: number): Promise<OrgListPage>;
  update(
    tenantId: string,
    id: string,
    set: { name?: string; status?: OrgStatus },
  ): Promise<OrgUnit | null>;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function createKindRepo(kind: OrgKind, model: Model<AnyOrgDoc>): OrgKindRepo {
  const parentField = PARENT_FIELD[kind];

  function toOrgUnit(doc: AnyOrgDoc): OrgUnit {
    const rawParent = parentField === null ? undefined : doc[parentField];
    return {
      id: doc._id.toString(),
      kind,
      tenantId: doc.tenantId,
      parentId: rawParent === undefined || rawParent === null ? null : rawParent.toString(),
      code: doc.code,
      name: doc.name,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  return {
    kind,

    async create(input) {
      const payload: Record<string, unknown> = {
        tenantId: input.tenantId,
        code: input.code,
        name: input.name,
        status: 'active',
      };
      if (parentField !== null && input.parentId !== null) {
        payload[parentField] = new Types.ObjectId(input.parentId);
      }
      try {
        // Único punto de casteo: el payload es polimórfico por tipo.
        const doc = await model.create(payload as unknown as AnyOrgDoc);
        return toOrgUnit(doc.toObject() as unknown as AnyOrgDoc);
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new ConflictError('Code already in use');
        }
        throw error;
      }
    },

    async findById(tenantId, id) {
      if (!Types.ObjectId.isValid(id)) {
        return null;
      }
      const doc = await model.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
      return doc === null ? null : toOrgUnit(doc as unknown as AnyOrgDoc);
    },

    async findByCode(tenantId, code) {
      const doc = await model.findOne({ tenantId, code }).lean();
      return doc === null ? null : toOrgUnit(doc as unknown as AnyOrgDoc);
    },

    async list(tenantId, page, limit) {
      const skip = (page - 1) * limit;
      const [docs, total] = await Promise.all([
        model.find({ tenantId }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
        model.countDocuments({ tenantId }),
      ]);
      return {
        items: docs.map((doc) => toOrgUnit(doc as unknown as AnyOrgDoc)),
        total,
      };
    },

    async update(tenantId, id, set) {
      if (!Types.ObjectId.isValid(id)) {
        return null;
      }
      const $set: { name?: string; status?: OrgStatus } = {};
      if (set.name !== undefined) {
        $set.name = set.name;
      }
      if (set.status !== undefined) {
        $set.status = set.status;
      }
      const doc = await model
        .findOneAndUpdate(
          { _id: new Types.ObjectId(id), tenantId },
          { $set },
          { returnDocument: 'after' },
        )
        .lean();
      return doc === null ? null : toOrgUnit(doc as unknown as AnyOrgDoc);
    },
  };
}

/** Registro explícito: modelo mongoose ↔ tipo de entidad. */
const REPOS: Record<OrgKind, OrgKindRepo> = {
  organization: createKindRepo('organization', OrganizationModel as unknown as Model<AnyOrgDoc>),
  company: createKindRepo('company', CompanyModel as unknown as Model<AnyOrgDoc>),
  branch: createKindRepo('branch', BranchModel as unknown as Model<AnyOrgDoc>),
  department: createKindRepo('department', DepartmentModel as unknown as Model<AnyOrgDoc>),
  warehouse: createKindRepo('warehouse', WarehouseModel as unknown as Model<AnyOrgDoc>),
  costCenter: createKindRepo('costCenter', CostCenterModel as unknown as Model<AnyOrgDoc>),
};

export function repoFor(kind: OrgKind): OrgKindRepo {
  return REPOS[kind];
}
