/**
 * Reglas de dominio Projects: máquinas de estados (proyecto y tarea),
 * editabilidad de campos de negocio, archivado, normalización del código y
 * validación del grafo de dependencias entre tareas. Puras: sin Mongoose,
 * sin Express, sin I/O.
 */
import type { Project, ProjectStatus } from '../entities/project.js';
import type { Task, TaskPriority, TaskStatus } from '../entities/task.js';

export const DESCRIPTION_MAX = 500;
export const DEPENDENCIES_MAX = 50;

export interface RuleValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/**
 * Transiciones válidas del proyecto. Los estados terminales no declaran
 * transiciones: `completed`/`cancelled` congelan el documento (también sus
 * campos de negocio) hasta un eventual restore de archivado.
 */
export const PROJECT_TRANSITIONS: Partial<Record<ProjectStatus, readonly ProjectStatus[]>> = {
  planning: ['active', 'cancelled'],
  active: ['on_hold', 'completed', 'cancelled'],
  on_hold: ['active', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canProjectTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return (PROJECT_TRANSITIONS[from] ?? []).includes(to);
}

/** `completed`/`cancelled`: los campos de negocio quedan inmutables. */
export function isProjectTerminal(status: ProjectStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

/**
 * Transiciones válidas de la tarea. `open → done` directo permite cerrar
 * tareas sin pasar por `in_progress`; `done`/`cancelled` son terminales (la
 * terminación es también la guarda frente a re-escrituras de estado).
 */
export const TASK_TRANSITIONS: Partial<Record<TaskStatus, readonly TaskStatus[]>> = {
  open: ['in_progress', 'done', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: [],
  cancelled: [],
};

export function canTaskTransition(from: TaskStatus, to: TaskStatus): boolean {
  return (TASK_TRANSITIONS[from] ?? []).includes(to);
}

/** `done`/`cancelled`: los campos de negocio quedan inmutables. */
export function isTaskTerminal(status: TaskStatus): boolean {
  return status === 'done' || status === 'cancelled';
}

/**
 * Una dependencia NO bloquea completar si está `done` (hecha), `cancelled`
 * (nunca se hará) o archivada (sacada de juego): bloquea en cualquier otro
 * caso (p. ej. `open`/`in_progress` activas).
 */
export function isDependencyBlocking(dependency: Pick<Task, 'status' | 'archived'>): boolean {
  if (dependency.archived) {
    return false;
  }
  return dependency.status !== 'done' && dependency.status !== 'cancelled';
}

export function canArchive(archived: boolean): boolean {
  return !archived;
}

export function canRestore(archived: boolean): boolean {
  return archived;
}

/** Normaliza el código de proyecto: mayúsculas, espacios → guiones. */
export function normalizeProjectCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '-');
}

export function validateProjectCode(code: string): RuleValidation {
  const issues: string[] = [];
  if (!/^[A-Z0-9][A-Z0-9._-]{1,31}$/.test(code)) {
    issues.push('Code must be 2-32 chars: letters, digits, dot, dash or underscore');
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Reglas estructurales de `dependsOn`: sin auto-referencia (la tarea no
 * puede depender de sí misma) y sin ids duplicados. Las FK y la pertenencia
 * al mismo proyecto se resuelven en el servicio (404/400); los ciclos entre
 * tareas se detectan con `dependsOnReaches`.
 *
 * `selfId` es opcional: en el ALTA la tarea aún no tiene id (un ciclo es
 * imposible: ningún documento guardado puede apuntar a un ObjectId recién
 * generado), así que solo se comprueban duplicados.
 */
export function validateDependencies(
  dependencies: readonly string[],
  selfId?: string,
): RuleValidation {
  const issues: string[] = [];
  if (dependencies.length > DEPENDENCIES_MAX) {
    issues.push(`At most ${DEPENDENCIES_MAX} dependencies are allowed`);
  }
  const seen = new Set<string>();
  for (const id of dependencies) {
    if (selfId !== undefined && id === selfId) {
      issues.push('A task cannot depend on itself');
    }
    if (seen.has(id)) {
      issues.push('Duplicate dependency');
    }
    seen.add(id);
  }
  return { valid: issues.length === 0, issues };
}

/**
 * ¿Algún nodo alcanzable desde `from` sigue las aristas GUARDADAS
 * (`edges`: taskId → sus `dependsOn`) hasta `target`? Si `target` es la
 * tarea que estamos actualizando, el nuevo conjunto de aristas crearía un
 * ciclo (la BFS pisa las dependencias propias viejas porque arranca de las
 * nuevas).
 */
export function dependsOnReaches(
  edges: ReadonlyMap<string, readonly string[]>,
  from: readonly string[],
  target: string,
): boolean {
  const stack: string[] = [...from];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      break;
    }
    if (node === target) {
      return true;
    }
    if (seen.has(node)) {
      continue;
    }
    seen.add(node);
    stack.push(...(edges.get(node) ?? []));
  }
  return false;
}

/** Prioridad por defecto de una tarea nueva. */
export function defaultTaskPriority(): TaskPriority {
  return 'normal';
}

/** Coherencia de fechas del proyecto: fin ≥ inicio (null = sin límite). */
export function isValidDateRange(project: Pick<Project, 'startDate' | 'endDate'>): boolean {
  if (project.startDate === null || project.endDate === null) {
    return true;
  }
  return project.endDate.getTime() >= project.startDate.getTime();
}
