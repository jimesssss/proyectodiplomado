import { Types } from 'mongoose';
import type { ApprovalStatus } from '../../domain/entities/approval.js';
import type { InstanceState, WorkflowContext } from '../../domain/entities/workflow-instance.js';
import type { ConditionValue, Workflow } from '../../domain/entities/workflow.js';

/** Definición (`workflows`) — configuración por datos del motor. */
export interface WorkflowDoc extends Omit<Workflow, 'id'> {
  _id: Types.ObjectId;
}

/** Instancia (`workflowInstances`) — ejecución sobre un documento. */
export interface WorkflowInstanceDoc {
  _id: Types.ObjectId;
  tenantId: string;
  workflowId: Types.ObjectId;
  entityType: string;
  entityId: Types.ObjectId;
  /** Snapshot Mixed de valores escalares (zod garantiza la forma al entrar). */
  context: Record<string, ConditionValue>;
  state: InstanceState;
  createdAt: Date;
  updatedAt: Date;
}

/** Solicitud de aprobación (`approvals`) — cola; solo el motor la crea. */
export interface ApprovalDoc {
  _id: Types.ObjectId;
  tenantId: string;
  instanceId: Types.ObjectId;
  workflowId: Types.ObjectId;
  entityType: string;
  entityId: Types.ObjectId;
  approverRole: string;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type { WorkflowContext };
