/**
 * Definición de workflow (FASE 14): configuración POR DATOS del motor
 * (`trigger`/`condition`/`action`) — sin tocar código para reglas nuevas.
 * Sin `workflow:delete` en el catálogo → soft-delete vía `archived`.
 * La edición es libre (nombre/descripción/archivar); `key`, `trigger`,
 * `condition` y `action` son inmutables en PATCH (→ 400) para no romper
 * instancias en vuelo.
 */

/** Eventos disparadores válidos (catálogo inicial de events-jobs.md §1). */
export const WORKFLOW_TRIGGERS = [
  'CustomerCreated',
  'SalesOrderCreated',
  'PaymentReceived',
  'StockLow',
  'InvoiceApproved',
  'PurchaseReceived',
  'WorkflowCompleted',
] as const;
export type WorkflowTriggerEvent = (typeof WORKFLOW_TRIGGERS)[number];

export const CONDITION_OPERATORS = ['gt', 'gte', 'lt', 'lte', 'eq', 'ne', 'contains'] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export type ConditionValue = number | string | boolean;

export interface WorkflowTrigger {
  /** Evento que, en el futuro, disparará la evaluación automática. */
  readonly event: WorkflowTriggerEvent;
  /** Tipo de documento que gobierna (p. ej. `sales.invoice`); OPACO (sin FK). */
  readonly entityType: string;
}

export interface WorkflowCondition {
  /** Campo del `context` a evaluar (patrón de identificador). */
  readonly field: string;
  readonly operator: ConditionOperator;
  /** Valor de comparación; su tipo debe casar con el operador (validado al crear). */
  readonly value: ConditionValue;
}

export const WORKFLOW_ACTION_TYPES = ['request_approval'] as const;
export type WorkflowActionType = (typeof WORKFLOW_ACTION_TYPES)[number];

export interface WorkflowAction {
  readonly type: WorkflowActionType;
  /** Rol objetivo INFORMATIVO (sin FK: la cola de aprobación no filtra por rol). */
  readonly approverRole: string;
}

export interface Workflow {
  readonly id: string;
  readonly tenantId: string;
  /** Clave natural normalizada (`BIG-APPROVAL`), única POR tenant, inmutable. */
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly trigger: WorkflowTrigger;
  readonly condition: WorkflowCondition;
  readonly action: WorkflowAction;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`). */
export interface PublicWorkflow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly trigger: WorkflowTrigger;
  readonly condition: WorkflowCondition;
  readonly action: WorkflowAction;
  readonly archived: boolean;
}

export function toPublicWorkflow(workflow: Workflow): PublicWorkflow {
  return {
    id: workflow.id,
    key: workflow.key,
    name: workflow.name,
    description: workflow.description,
    trigger: workflow.trigger,
    condition: workflow.condition,
    action: workflow.action,
    archived: workflow.archived,
  };
}
