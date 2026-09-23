import { ConflictError, DomainError, NotFoundError } from '../../../core/errors/app-error.js';
import {
  toPublicWorkflowInstance,
  type InstanceState,
  type PublicWorkflowInstance,
} from '../domain/entities/workflow-instance.js';
import type { ConditionValue } from '../domain/entities/workflow.js';
import { evaluateCondition } from '../domain/rules/workflow-rules.js';
import {
  approvalRepo,
  instanceRepo,
  workflowRepo,
} from '../infrastructure/repositories/workflow-repository.js';

/**
 * Motor de workflows (FASE 14): `POST /workflows/:id/run` ejecuta UNA
 * evaluación de la definición sobre un documento. Orden (sin transacciones
 * Mongo — ventanas documentadas en `docs/api/workflows.md`):
 *
 * 1. Pre-chequeos SOLO-lectura: 404 (definición), 409 archivada, 409
 *    `trigger.entityType` ≠ payload, 422 condición no evaluable (campo
 *    ausente o tipo incompatible: el motor NO asume `false`), 409 duplicado
 *    pendiente — todo ANTES de escribir.
 * 2. SI matchea: crea instancia `awaiting_approval` (único parcial de la BD
 *    respalda la carrera) y DESPUÉS su solicitud `pending` (dos escrituras,
 *    ventana documentada: un fallo entre ellas deja la instancia sin
 *    solicitud — curable solo en BD).
 * 3. SI NO matchea: crea instancia `skipped` SIN solicitud (evaluado, no
 *    aplica) — auditable y sin efectos secundarios.
 *
 * `entityId` es OPACO (ObjectId de cualquier módulo): el motor es genérico y
 * no valida FKs cruzadas (documentado).
 */

export interface RunWorkflowInput {
  readonly entityType: string;
  readonly entityId: string;
  readonly context?: Readonly<Record<string, ConditionValue>> | undefined;
}

export interface InstanceListQuery {
  readonly page: number;
  readonly limit: number;
  readonly state?: InstanceState | undefined;
}

export interface InstancePage {
  readonly items: readonly PublicWorkflowInstance[];
  readonly total: number;
}

export async function runWorkflow(
  tenantId: string,
  workflowId: string,
  input: RunWorkflowInput,
): Promise<PublicWorkflowInstance> {
  const workflow = await workflowRepo.findById(tenantId, workflowId);
  if (workflow === null) {
    throw new NotFoundError();
  }
  if (workflow.archived) {
    throw new ConflictError('Workflow is archived');
  }
  if (input.entityType !== workflow.trigger.entityType) {
    throw new ConflictError('Trigger does not match the document type', {
      expected: workflow.trigger.entityType,
      received: input.entityType,
    });
  }

  // Evaluación de la condición ANTES de mirar estado de entidades: payload
  // no evaluable → 422 limpio (patrón de dos fases de las conciliaciones).
  const context = input.context ?? {};
  const outcome = evaluateCondition(workflow.condition, context);
  if (!outcome.ok) {
    if (outcome.reason === 'missing') {
      throw new DomainError('Condition field missing in context', { field: outcome.field });
    }
    throw new DomainError('Condition field type does not match the operator', {
      field: outcome.field,
      operator: workflow.condition.operator,
    });
  }

  // Duplicado: UNA instancia pendiente por workflow+documento (409).
  const pending = await instanceRepo.findAwaiting(tenantId, workflowId, input.entityId);
  if (pending !== null) {
    throw new ConflictError('Approval is already pending for this document');
  }

  if (!outcome.matched) {
    const skipped = await instanceRepo.create(tenantId, {
      workflowId,
      entityType: input.entityType,
      entityId: input.entityId,
      context,
      state: 'skipped',
    });
    return toPublicWorkflowInstance(skipped);
  }

  const instance = await instanceRepo.create(tenantId, {
    workflowId,
    entityType: input.entityType,
    entityId: input.entityId,
    context,
    state: 'awaiting_approval',
  });
  await approvalRepo.create(tenantId, {
    instanceId: instance.id,
    workflowId,
    entityType: input.entityType,
    entityId: input.entityId,
    // Snapshot del rol objetivo al ejecutar (ediciones posteriores no reescriben).
    approverRole: workflow.action.approverRole,
  });
  return toPublicWorkflowInstance(instance);
}

export async function listWorkflowInstances(
  tenantId: string,
  workflowId: string,
  query: InstanceListQuery,
): Promise<InstancePage> {
  const workflow = await workflowRepo.findById(tenantId, workflowId);
  if (workflow === null) {
    throw new NotFoundError();
  }
  const filter = {
    workflowId,
    ...(query.state !== undefined ? { state: query.state } : {}),
  };
  const page = await instanceRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicWorkflowInstance), total: page.total };
}
