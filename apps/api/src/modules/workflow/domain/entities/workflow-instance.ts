import type { ConditionValue } from './workflow.js';

/**
 * Instancia de workflow (FASE 14): ejecución de UNA definición sobre UN
 * documento (`entityType`+`entityId`, opacos). Máquina canónica:
 *
 * - `awaiting_approval → approved|rejected` (decisión del aprobador, terminal).
 * - `awaiting_approval → skipped` NO existe: `skipped` nace en `run` cuando la
 *   condición no matchea (evaluado, no aplica) y es terminal.
 * - `approved`/`rejected`/`skipped` son terminales; re-ejecutar el workflow
 *   crea una instancia NUEVA (el duplicado solo se bloquea con una pendiente).
 */

export const INSTANCE_STATES = ['awaiting_approval', 'approved', 'rejected', 'skipped'] as const;
export type InstanceState = (typeof INSTANCE_STATES)[number];

/** Snapshot de los datos con los que se evaluó la condición (copiado en `run`). */
export type WorkflowContext = Readonly<Record<string, ConditionValue>>;

export interface WorkflowInstance {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowId: string;
  readonly entityType: string;
  /** ObjectId del documento gobernado; OPACO (sin validación FK, genérico). */
  readonly entityId: string;
  readonly context: WorkflowContext;
  readonly state: InstanceState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`). */
export interface PublicWorkflowInstance {
  readonly id: string;
  readonly workflowId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly context: WorkflowContext;
  readonly state: InstanceState;
}

export function toPublicWorkflowInstance(instance: WorkflowInstance): PublicWorkflowInstance {
  return {
    id: instance.id,
    workflowId: instance.workflowId,
    entityType: instance.entityType,
    entityId: instance.entityId,
    context: instance.context,
    state: instance.state,
  };
}
