import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
// FK de usuario (composición FASE 8): Projects → Identity, nunca al revés.
import { findUserInTenant } from '../../identity/index.js';
import {
  toPublicTask,
  type TaskPriority,
  type TaskStatus,
  type PublicTask,
} from '../domain/entities/task.js';
import {
  canArchive,
  canRestore,
  canTaskTransition,
  defaultTaskPriority,
  dependsOnReaches,
  isDependencyBlocking,
  isTaskTerminal,
  validateDependencies,
} from '../domain/rules/project-rules.js';
import {
  projectRepo,
  taskRepo,
  type TaskListFilter,
} from '../infrastructure/repositories/project-repository.js';

/**
 * Casos de uso de tareas de proyecto (FASE 17). `tenantId` SIEMPRE del JWT
 * (ADR-002); FKs inexistentes/ajenas → 404 uniforme, usuario desconocido →
 * 400 (patrón CRM). La tarea vive en SU proyecto: `dependsOn` solo apunta a
 * tareas del MISMO proyecto (ajeno/otro proyecto → 404/400) y el grafo es
 * ACÍCLICO: cada escritura de `dependsOn` corre BFS sobre las aristas
 * guardadas del proyecto y rechaza cualquier arista que vuelva a la tarea
 * (400 `Circular dependency detected`). `→ done` exige dependencias
 * desbloqueadas (`done`/`cancelled` o archivadas); los estados terminales
 * congelan los campos de negocio (patrón Sales/Purchasing/Manufacturing).
 */

export interface CreateTaskInput {
  readonly projectId: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly priority?: TaskPriority | undefined;
  readonly assigneeId?: string | undefined;
  readonly dueDate?: Date | undefined;
  readonly dependsOn?: readonly string[] | undefined;
}

export interface PatchTaskInput {
  readonly title?: string | undefined;
  readonly description?: string | null | undefined;
  readonly priority?: TaskPriority | undefined;
  readonly assigneeId?: string | null | undefined;
  readonly dueDate?: Date | null | undefined;
  readonly dependsOn?: readonly string[] | undefined;
  readonly status?: TaskStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface TaskListQuery {
  readonly page: number;
  readonly limit: number;
  readonly status?: TaskStatus | undefined;
  readonly projectId?: string | undefined;
  readonly archived?: boolean | undefined;
}

export interface TaskPage {
  readonly items: readonly PublicTask[];
  readonly total: number;
}

/** Campos de negocio: congelados en estados terminales (`done`/`cancelled`). */
const BUSINESS_FIELDS = [
  'title',
  'description',
  'priority',
  'assigneeId',
  'dueDate',
  'dependsOn',
] as const;

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** `assigneeId` debe existir en el tenant (desconocido → 400, como CRM). */
async function assertAssignable(tenantId: string, userId: string): Promise<void> {
  const user = await findUserInTenant(tenantId, userId);
  if (user === null) {
    throw new ValidationError('Unknown user', { user: userId });
  }
}

/**
 * Cada dependencia debe EXISTIR en el tenant (ajena/inexistente → 404) y
 * pertenecer al MISMO proyecto de la tarea (otro proyecto → 400).
 */
async function assertDependenciesInProject(
  tenantId: string,
  projectId: string,
  dependencies: readonly string[],
): Promise<void> {
  for (const dependencyId of dependencies) {
    const dependency = await taskRepo.findById(tenantId, dependencyId);
    if (dependency === null) {
      throw new NotFoundError();
    }
    if (dependency.projectId !== projectId) {
      throw new ValidationError('Dependencies must belong to the same project');
    }
  }
}

export async function createTask(tenantId: string, input: CreateTaskInput): Promise<PublicTask> {
  const project = await projectRepo.findById(tenantId, input.projectId);
  if (project === null) {
    throw new NotFoundError();
  }
  if (project.archived) {
    throw new ConflictError('Project is archived');
  }
  if (input.assigneeId !== undefined) {
    await assertAssignable(tenantId, input.assigneeId);
  }

  const dependencies = input.dependsOn ?? [];
  // El ALTA no puede crear ciclos: el id de la tarea es nuevo y ningún
  // documento guardado puede apuntar a él (solo estructura: duplicados).
  const check = validateDependencies(dependencies);
  if (!check.valid) {
    throw new ValidationError('Invalid dependencies', { issues: [...check.issues] });
  }
  await assertDependenciesInProject(tenantId, project.id, dependencies);

  const payload: Record<string, unknown> = {
    projectId: project.id,
    title: input.title.trim(),
    description: trimOrNull(input.description),
    status: 'open',
    priority: input.priority ?? defaultTaskPriority(),
    assigneeId: null,
    dueDate: input.dueDate ?? null,
    dependsOn: [...dependencies],
  };
  if (input.assigneeId !== undefined) {
    payload.assigneeId = input.assigneeId;
  }
  const task = await taskRepo.create(tenantId, payload);
  return toPublicTask(task);
}

export async function listTasks(tenantId: string, query: TaskListQuery): Promise<TaskPage> {
  const filter: TaskListFilter = {
    status: query.status,
    projectId: query.projectId,
    archived: query.archived,
  };
  const page = await taskRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map((task) => toPublicTask(task)), total: page.total };
}

export async function getTask(tenantId: string, id: string): Promise<PublicTask> {
  const task = await taskRepo.findById(tenantId, id);
  if (task === null) {
    throw new NotFoundError();
  }
  return toPublicTask(task);
}

export async function updateTask(
  tenantId: string,
  id: string,
  input: PatchTaskInput,
): Promise<PublicTask> {
  const current = await taskRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }

  const requested = BUSINESS_FIELDS.filter((field) => input[field] !== undefined);
  if (requested.length > 0 && isTaskTerminal(current.status)) {
    throw new ConflictError('Only non-terminal tasks can be edited');
  }

  const set: Record<string, unknown> = {};
  if (input.title !== undefined) {
    set.title = input.title.trim();
  }
  if (input.description !== undefined) {
    set.description = trimOrNull(input.description);
  }
  if (input.priority !== undefined) {
    set.priority = input.priority;
  }
  if (input.assigneeId !== undefined) {
    if (input.assigneeId === null) {
      set.assigneeId = null;
    } else {
      await assertAssignable(tenantId, input.assigneeId);
      set.assigneeId = input.assigneeId;
    }
  }
  if (input.dueDate !== undefined) {
    set.dueDate = input.dueDate;
  }

  let effectiveDependencies: readonly string[] = current.dependsOn;
  if (input.dependsOn !== undefined) {
    effectiveDependencies = input.dependsOn;
    const check = validateDependencies(effectiveDependencies, id);
    if (!check.valid) {
      throw new ValidationError('Invalid dependencies', { issues: [...check.issues] });
    }
    await assertDependenciesInProject(tenantId, current.projectId, effectiveDependencies);
    // Ciclos: BFS por las aristas GUARDADAS del proyecto desde las nuevas
    // dependencias; si se alcanza esta tarea, el update crearía un ciclo.
    if (effectiveDependencies.length > 0) {
      const edges = await taskRepo.dependencyEdges(tenantId, current.projectId);
      if (dependsOnReaches(edges, effectiveDependencies, id)) {
        throw new ValidationError('Circular dependency detected');
      }
    }
    set.dependsOn = [...effectiveDependencies];
  }

  if (input.status !== undefined) {
    if (input.status === current.status) {
      throw new ConflictError('Status is already the requested one');
    }
    if (!canTaskTransition(current.status, input.status)) {
      throw new ConflictError('Invalid status transition');
    }
    if (input.status === 'done') {
      // Pre-chequeo de bloqueo: ninguna escritura ocurre si algo sigue abierto.
      const blockedBy: string[] = [];
      for (const dependencyId of effectiveDependencies) {
        const dependency = await taskRepo.findById(tenantId, dependencyId);
        if (dependency !== null && isDependencyBlocking(dependency)) {
          blockedBy.push(dependencyId);
        }
      }
      if (blockedBy.length > 0) {
        throw new ConflictError('Task has unfinished dependencies', { blockedBy });
      }
    }
    set.status = input.status;
  }

  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Task is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Task is not archived');
    }
    set.archived = input.archived;
  }

  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await taskRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicTask(updated);
}

/** DELETE = soft-delete: marca `archived` (doble archive → 409). */
export async function archiveTask(tenantId: string, id: string): Promise<PublicTask> {
  const current = await taskRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Task is already archived');
  }
  const archived = await taskRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicTask(archived);
}
