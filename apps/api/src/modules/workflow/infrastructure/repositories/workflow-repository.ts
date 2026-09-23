import { Types, type Model } from 'mongoose';
import { ConflictError } from '../../../../core/errors/app-error.js';
import type { Approval, ApprovalStatus } from '../../domain/entities/approval.js';
import type { InstanceState, WorkflowInstance } from '../../domain/entities/workflow-instance.js';
import type { Workflow } from '../../domain/entities/workflow.js';
import { ApprovalModel, WorkflowInstanceModel, WorkflowModel } from '../schemas/collections.js';
import type { ApprovalDoc, WorkflowDoc, WorkflowInstanceDoc } from '../schemas/types.js';

/**
 * Repositorio Workflow — único camino a MongoDB del módulo (3 colecciones).
 * TODA operación filtra por `tenantId` (nunca llega del cliente, ADR-002).
 * Único punto de casteo: payload/$set de create/update y ObjectId en filtros.
 * Las transiciones de instancia/aprobación van CONDICIONADAS al estado
 * esperado (`transition`): puerta at-most-once de la decisión.
 */

export interface WorkflowListFilter {
  readonly archived?: boolean | undefined;
}

export interface InstanceListFilter {
  readonly workflowId?: string | undefined;
  readonly state?: InstanceState | undefined;
}

export interface ApprovalListFilter {
  readonly status?: ApprovalStatus | undefined;
  readonly workflowId?: string | undefined;
  readonly entityType?: string | undefined;
  readonly entityId?: string | undefined;
}

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface WorkflowRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Workflow>;
  findById(tenantId: string, id: string): Promise<Workflow | null>;
  list(
    tenantId: string,
    filter: WorkflowListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<Workflow>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<Workflow | null>;
}

export interface InstanceRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<WorkflowInstance>;
  findById(tenantId: string, id: string): Promise<WorkflowInstance | null>;
  /** Instancia pendiente de ESTE workflow sobre ESTE documento (pre-chequeo). */
  findAwaiting(
    tenantId: string,
    workflowId: string,
    entityId: string,
  ): Promise<WorkflowInstance | null>;
  list(
    tenantId: string,
    filter: InstanceListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<WorkflowInstance>>;
  /** Transición CONDICIONADA al estado esperado (puerta at-most-once). */
  transition(
    tenantId: string,
    id: string,
    expectedState: InstanceState,
    set: Record<string, unknown>,
  ): Promise<WorkflowInstance | null>;
}

export interface ApprovalRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Approval>;
  findById(tenantId: string, id: string): Promise<Approval | null>;
  list(
    tenantId: string,
    filter: ApprovalListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<Approval>>;
  /** Transición CONDICIONADA a `pending`: dos decisiones → UNA gana. */
  transition(
    tenantId: string,
    id: string,
    expectedStatus: ApprovalStatus,
    set: Record<string, unknown>,
  ): Promise<Approval | null>;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

// --- Mappers (doc → entidad de dominio; única salida sin tenantId-oculto) ---

function mapWorkflow(doc: WorkflowDoc): Workflow {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    key: doc.key,
    name: doc.name,
    description: doc.description ?? null,
    trigger: { event: doc.trigger.event, entityType: doc.trigger.entityType },
    condition: {
      field: doc.condition.field,
      operator: doc.condition.operator,
      value: doc.condition.value,
    },
    action: { type: doc.action.type, approverRole: doc.action.approverRole },
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapInstance(doc: WorkflowInstanceDoc): WorkflowInstance {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    workflowId: doc.workflowId.toString(),
    entityType: doc.entityType,
    entityId: doc.entityId.toString(),
    context: { ...doc.context },
    state: doc.state,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapApproval(doc: ApprovalDoc): Approval {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    instanceId: doc.instanceId.toString(),
    workflowId: doc.workflowId.toString(),
    entityType: doc.entityType,
    entityId: doc.entityId.toString(),
    approverRole: doc.approverRole,
    status: doc.status,
    decidedBy: doc.decidedBy ?? null,
    decidedAt: doc.decidedAt ?? null,
    comment: doc.comment ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const workflowModel: Model<WorkflowDoc> = WorkflowModel;
const instanceModel: Model<WorkflowInstanceDoc> = WorkflowInstanceModel;
const approvalModel: Model<ApprovalDoc> = ApprovalModel;

async function listWithCount<TDoc, TEntity>(
  model: Model<TDoc>,
  filter: Record<string, unknown>,
  page: number,
  limit: number,
  map: (doc: TDoc) => TEntity,
): Promise<ListPage<TEntity>> {
  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    model.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(filter),
  ]);
  return {
    items: docs.map((doc) => map(doc as TDoc)),
    total,
  };
}

export const workflowRepo: WorkflowRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await workflowModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as WorkflowDoc);
      return mapWorkflow(doc.toObject() as unknown as WorkflowDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('Key already exists');
      }
      throw error;
    }
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await workflowModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapWorkflow(doc as unknown as WorkflowDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
    };
    return listWithCount(workflowModel, mongoFilter, page, limit, mapWorkflow);
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await workflowModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapWorkflow(doc as unknown as WorkflowDoc);
  },
};

export const instanceRepo: InstanceRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await instanceModel.create({
        tenantId,
        ...payload,
      } as unknown as WorkflowInstanceDoc);
      return mapInstance(doc.toObject() as unknown as WorkflowInstanceDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        // Respaldo de la carrera: el pre-chequeo de `run` ya cubre el caso normal.
        throw new ConflictError('Approval is already pending for this document');
      }
      throw error;
    }
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await instanceModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapInstance(doc as unknown as WorkflowInstanceDoc);
  },

  async findAwaiting(tenantId, workflowId, entityId) {
    if (!Types.ObjectId.isValid(workflowId) || !Types.ObjectId.isValid(entityId)) {
      return null;
    }
    const doc = await instanceModel
      .findOne({
        tenantId,
        workflowId: new Types.ObjectId(workflowId),
        entityId: new Types.ObjectId(entityId),
        state: 'awaiting_approval',
      })
      .lean();
    return doc === null ? null : mapInstance(doc as unknown as WorkflowInstanceDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.workflowId !== undefined && Types.ObjectId.isValid(filter.workflowId)
        ? { workflowId: new Types.ObjectId(filter.workflowId) }
        : {}),
      ...(filter.state !== undefined ? { state: filter.state } : {}),
    };
    return listWithCount(instanceModel, mongoFilter, page, limit, mapInstance);
  },

  async transition(tenantId, id, expectedState, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await instanceModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId, state: expectedState },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapInstance(doc as unknown as WorkflowInstanceDoc);
  },
};

export const approvalRepo: ApprovalRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await approvalModel.create({
        tenantId,
        status: 'pending',
        ...payload,
      } as unknown as ApprovalDoc);
      return mapApproval(doc.toObject() as unknown as ApprovalDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('Approval is already pending for this document');
      }
      throw error;
    }
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await approvalModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapApproval(doc as unknown as ApprovalDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.status !== undefined ? { status: filter.status } : {}),
      ...(filter.workflowId !== undefined && Types.ObjectId.isValid(filter.workflowId)
        ? { workflowId: new Types.ObjectId(filter.workflowId) }
        : {}),
      ...(filter.entityType !== undefined ? { entityType: filter.entityType } : {}),
      ...(filter.entityId !== undefined && Types.ObjectId.isValid(filter.entityId)
        ? { entityId: new Types.ObjectId(filter.entityId) }
        : {}),
    };
    return listWithCount(approvalModel, mongoFilter, page, limit, mapApproval);
  },

  async transition(tenantId, id, expectedStatus, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await approvalModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId, status: expectedStatus },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapApproval(doc as unknown as ApprovalDoc);
  },
};
