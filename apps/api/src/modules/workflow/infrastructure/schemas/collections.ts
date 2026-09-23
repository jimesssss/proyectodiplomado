import { Schema, model, models, type Model } from 'mongoose';
import { APPROVAL_STATUSES } from '../../domain/entities/approval.js';
import { INSTANCE_STATES } from '../../domain/entities/workflow-instance.js';
import {
  CONDITION_OPERATORS,
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_TRIGGERS,
} from '../../domain/entities/workflow.js';
import type { ApprovalDoc, WorkflowDoc, WorkflowInstanceDoc } from './types.js';

/**
 * Tres colecciones de la fila de plataforma `workflows · workflowInstances ·
 * approvals` (`docs/architecture/database.md` §2). `eventsOutbox`, `jobs` y
 * las de notificaciones NO forman parte de esta fase (diferidas, ver
 * `docs/database/workflows.md`). Todas con `tenantId` primero en sus índices
 * (ADR-002) y queries justificadas en ese documento.
 */
export const WORKFLOWS_COLLECTION = 'workflows';
export const WORKFLOW_INSTANCES_COLLECTION = 'workflowInstances';
export const APPROVALS_COLLECTION = 'approvals';

const workflowTriggerSchema = new Schema(
  {
    event: { type: String, required: true, enum: [...WORKFLOW_TRIGGERS] },
    entityType: { type: String, required: true },
  },
  { _id: false },
);

const workflowConditionSchema = new Schema(
  {
    field: { type: String, required: true },
    operator: { type: String, required: true, enum: [...CONDITION_OPERATORS] },
    // Mixed SIN `required`: `false`/`0`/`''` son valores legítimos; la
    // presencia y el tipo-vs-operador los garantiza Zod en la capa de rutas.
    value: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const workflowActionSchema = new Schema(
  {
    type: { type: String, required: true, enum: [...WORKFLOW_ACTION_TYPES] },
    approverRole: { type: String, required: true },
  },
  { _id: false },
);

const workflowSchema = new Schema<WorkflowDoc>(
  {
    tenantId: { type: String, required: true },
    key: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: null },
    trigger: { type: workflowTriggerSchema, required: true },
    condition: { type: workflowConditionSchema, required: true },
    action: { type: workflowActionSchema, required: true },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: WORKFLOWS_COLLECTION },
);

workflowSchema.index({ tenantId: 1, key: 1 }, { unique: true });
workflowSchema.index({ tenantId: 1, createdAt: -1 });
workflowSchema.index({ tenantId: 1, archived: 1, createdAt: -1 });

const workflowInstanceSchema = new Schema<WorkflowInstanceDoc>(
  {
    tenantId: { type: String, required: true },
    workflowId: { type: Schema.Types.ObjectId, required: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    // Mixed SIN `required`: el contexto puede ser `{}` (condición → 422).
    context: { type: Schema.Types.Mixed },
    state: { type: String, required: true, enum: [...INSTANCE_STATES] },
  },
  { timestamps: true, collection: WORKFLOW_INSTANCES_COLLECTION },
);

workflowInstanceSchema.index({ tenantId: 1, createdAt: -1 });
workflowInstanceSchema.index({ tenantId: 1, state: 1, createdAt: -1 });
workflowInstanceSchema.index({ tenantId: 1, workflowId: 1, createdAt: -1 });
// At-most-once: UNA instancia pendiente por workflow+documento (pre-chequeo
// en `run` + esta restricción como respaldo ante carreras).
workflowInstanceSchema.index(
  { tenantId: 1, workflowId: 1, entityId: 1 },
  { unique: true, partialFilterExpression: { state: 'awaiting_approval' } },
);

const approvalSchema = new Schema<ApprovalDoc>(
  {
    tenantId: { type: String, required: true },
    instanceId: { type: Schema.Types.ObjectId, required: true },
    workflowId: { type: Schema.Types.ObjectId, required: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    approverRole: { type: String, required: true },
    status: { type: String, required: true, enum: [...APPROVAL_STATUSES] },
    decidedBy: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    comment: { type: String, default: null },
  },
  { timestamps: true, collection: APPROVALS_COLLECTION },
);

approvalSchema.index({ tenantId: 1, createdAt: -1 });
approvalSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
approvalSchema.index({ tenantId: 1, entityId: 1, entityType: 1 });
// Máximo UNA solicitud pendiente por instancia (la máquina es de 1 paso).
approvalSchema.index(
  { tenantId: 1, instanceId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);

function getModel<T>(collection: string, schema: Schema<T>): Model<T> {
  const existing = models[collection] as Model<T> | undefined;
  if (existing !== undefined) {
    return existing;
  }
  return model<T>(collection, schema);
}

export const WorkflowModel = getModel(WORKFLOWS_COLLECTION, workflowSchema);
export const WorkflowInstanceModel = getModel(
  WORKFLOW_INSTANCES_COLLECTION,
  workflowInstanceSchema,
);
export const ApprovalModel = getModel(APPROVALS_COLLECTION, approvalSchema);
