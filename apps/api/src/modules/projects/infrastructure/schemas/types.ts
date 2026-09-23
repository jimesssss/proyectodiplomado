import type { Types } from 'mongoose';
import type { ProjectStatus } from '../../domain/entities/project.js';
import type { TaskPriority, TaskStatus } from '../../domain/entities/task.js';

/**
 * Documentos de las 2 colecciones del módulo. `null` = campo opcional
 * limpiado vía PATCH (descripción/fechas/FKs); `undefined` = nunca escrito.
 * `managerId`/`assigneeId`/`projectId`/`dependsOn[]` son ObjectId en Mongo y
 * string en el dominio (único punto de casteo: mapper del repositorio).
 */
export interface ProjectDoc {
  _id: Types.ObjectId;
  tenantId: string;
  /** Clave natural única por tenant (normalizada e inmutable). */
  code: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  startDate?: Date | null;
  endDate?: Date | null;
  managerId?: Types.ObjectId | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskDoc {
  _id: Types.ObjectId;
  tenantId: string;
  projectId: Types.ObjectId;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: Types.ObjectId | null;
  dueDate?: Date | null;
  /** Dependencias hacia tareas del MISMO proyecto (grafo acíclico). */
  dependsOn?: Types.ObjectId[];
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}
