/**
 * Dominio Projects — tarea (FASE 17).
 *
 * La tarea vive en SU proyecto (`projectId`): sus dependencias (`dependsOn`)
 * solo pueden apuntar a tareas del MISMO proyecto (sin ciclos — se valida en
 * cada escritura). Máquina de estados `open → in_progress → done` (con
 * salto directo `open → done` para tareas simples) y `cancelled` como salida;
 * los dos últimos son terminales. COMPLETAR (`→ done`) exige que todas las
 * dependencias estén desbloqueadas (`done`/`cancelled` o archivadas).
 */

export const TASK_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Task {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  /** Asignado: usuario del MISMO tenant (FK) o `null`. */
  readonly assigneeId: string | null;
  readonly dueDate: Date | null;
  /** Ids de tareas del mismo proyecto de las que depende (grafo acíclico). */
  readonly dependsOn: readonly string[];
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicTask {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly assigneeId: string | null;
  readonly dueDate: Date | null;
  readonly dependsOn: readonly string[];
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function toPublicTask(task: Task): PublicTask {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId,
    dueDate: task.dueDate,
    dependsOn: [...task.dependsOn],
    archived: task.archived,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
