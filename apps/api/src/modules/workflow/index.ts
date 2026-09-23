/**
 * Superficie pública del módulo Workflow (FASE 14).
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 */
export {
  createWorkflowRouters,
  WORKFLOW_ROUTE_PATHS,
  type WorkflowPermission,
  type WorkflowRouterDeps,
} from './presentation/routes/workflow-routes.js';
export {
  archiveWorkflow,
  createWorkflow,
  getWorkflow,
  listWorkflows,
  updateWorkflow,
} from './application/workflow-service.js';
export { listWorkflowInstances, runWorkflow } from './application/engine-service.js';
export { decideApproval, getApproval, listApprovals } from './application/approval-service.js';
export {
  CONDITION_OPERATORS,
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_TRIGGERS,
  toPublicWorkflow,
  type ConditionOperator,
  type ConditionValue,
  type PublicWorkflow,
  type Workflow,
  type WorkflowAction,
  type WorkflowActionType,
  type WorkflowCondition,
  type WorkflowTrigger,
  type WorkflowTriggerEvent,
} from './domain/entities/workflow.js';
export {
  INSTANCE_STATES,
  toPublicWorkflowInstance,
  type InstanceState,
  type PublicWorkflowInstance,
  type WorkflowContext,
  type WorkflowInstance,
} from './domain/entities/workflow-instance.js';
export {
  APPROVAL_STATUSES,
  toPublicApproval,
  type Approval,
  type ApprovalStatus,
  type PublicApproval,
} from './domain/entities/approval.js';
export {
  APPROVAL_DECISIONS,
  APPROVAL_TRANSITIONS,
  INSTANCE_TRANSITIONS,
  canApprovalTransition,
  canArchive,
  canInstanceTransition,
  canRestore,
  evaluateCondition,
  normalizeKey,
  validateKey,
  type ApprovalDecision,
  type ConditionOutcome,
  type RuleValidation,
} from './domain/rules/workflow-rules.js';
