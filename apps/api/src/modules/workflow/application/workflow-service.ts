import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import {
  toPublicWorkflow,
  type PublicWorkflow,
  type WorkflowAction,
  type WorkflowCondition,
  type WorkflowTrigger,
} from '../domain/entities/workflow.js';
import {
  canArchive,
  canRestore,
  normalizeKey,
  validateKey,
} from '../domain/rules/workflow-rules.js';
import { workflowRepo } from '../infrastructure/repositories/workflow-repository.js';

/**
 * Casos de uso de DEFINICIONES de workflow (FASE 14). `tenantId` SIEMPRE del
 * JWT (ADR-002). Sin máquina de estados: `archived` con los guardias de
 * archivar/restore (409) y edición libre de nombre/descripción. `key` es
 * única POR tenant (normalizada mayúsculas/guiones) e inmutable; `trigger`,
 * `condition` y `action` también son inmutables en PATCH (el esquema estricto
 * los rechaza con 400) para no romper instancias en vuelo.
 */

export interface CreateWorkflowInput {
  readonly key: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly trigger: WorkflowTrigger;
  readonly condition: WorkflowCondition;
  readonly action: WorkflowAction;
}

export interface PatchWorkflowInput {
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly archived?: boolean | undefined;
}

export interface WorkflowListQuery {
  readonly page: number;
  readonly limit: number;
  readonly archived?: boolean | undefined;
}

export interface WorkflowPage {
  readonly items: readonly PublicWorkflow[];
  readonly total: number;
}

export async function createWorkflow(
  tenantId: string,
  input: CreateWorkflowInput,
): Promise<PublicWorkflow> {
  const key = normalizeKey(input.key);
  const validation = validateKey(key);
  if (!validation.valid) {
    throw new ValidationError(validation.issues.join(', '));
  }
  const workflow = await workflowRepo.create(tenantId, {
    key,
    name: input.name.trim(),
    description: input.description?.trim() ?? null,
    trigger: input.trigger,
    condition: input.condition,
    action: input.action,
  });
  return toPublicWorkflow(workflow);
}

export async function listWorkflows(
  tenantId: string,
  query: WorkflowListQuery,
): Promise<WorkflowPage> {
  const filter = {
    ...(query.archived !== undefined ? { archived: query.archived } : {}),
  };
  const page = await workflowRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicWorkflow), total: page.total };
}

export async function getWorkflow(tenantId: string, id: string): Promise<PublicWorkflow> {
  const workflow = await workflowRepo.findById(tenantId, id);
  if (workflow === null) {
    throw new NotFoundError();
  }
  return toPublicWorkflow(workflow);
}

export async function updateWorkflow(
  tenantId: string,
  id: string,
  input: PatchWorkflowInput,
): Promise<PublicWorkflow> {
  const current = await workflowRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }

  const set: Record<string, unknown> = {};
  if (input.name !== undefined) {
    set.name = input.name.trim();
  }
  if (input.description !== undefined) {
    set.description = input.description === null ? null : input.description.trim();
  }
  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Workflow is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Workflow is not archived');
    }
    set.archived = input.archived;
  }

  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await workflowRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicWorkflow(updated);
}

/**
 * DELETE NO publicado (el catálogo no define `workflow:delete`): soft-delete
 * vía `PATCH {archived}`. Contrato de la fábrica CRUD (ruta no emitida → 404).
 */
export async function archiveWorkflow(tenantId: string, id: string): Promise<PublicWorkflow> {
  const current = await workflowRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Workflow is already archived');
  }
  const archived = await workflowRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicWorkflow(archived);
}
