import { Schema, model, models, type Model } from 'mongoose';
import { PROJECT_STATUSES } from '../../domain/entities/project.js';
import { TASK_PRIORITIES, TASK_STATUSES } from '../../domain/entities/task.js';
import type { ProjectDoc, TaskDoc } from './types.js';

/**
 * 2 colecciones: `projects` (maestro con clave natural + máquina de estados)
 * y `tasks` (hijo de proyecto con grafo de dependencias). Sin líneas
 * embebidas: las tareas se listan y filtran de forma independiente
 * (colección propia, ADR-003 — como contacts/activities de CRM).
 */
export const PROJECTS_COLLECTION = 'projects';
export const TASKS_COLLECTION = 'tasks';

const projectSchema = new Schema<ProjectDoc>(
  {
    tenantId: { type: String, required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: null },
    status: { type: String, required: true, enum: [...PROJECT_STATUSES] },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    managerId: { type: Schema.Types.ObjectId, default: null },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: PROJECTS_COLLECTION },
);

// Clave natural única POR tenant (ADR-002): duplicado → 409 en el repo.
projectSchema.index({ tenantId: 1, code: 1 }, { unique: true });
// Listado por defecto: GET /projects (desc por creación).
projectSchema.index({ tenantId: 1, createdAt: -1 });
// Cola filtrada: GET /projects?status=.
projectSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
// Listado archivado: GET /projects?archived=.
projectSchema.index({ tenantId: 1, archived: 1, createdAt: -1 });

const taskSchema = new Schema<TaskDoc>(
  {
    tenantId: { type: String, required: true },
    projectId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    status: { type: String, required: true, enum: [...TASK_STATUSES] },
    priority: { type: String, required: true, enum: [...TASK_PRIORITIES], default: 'normal' },
    assigneeId: { type: Schema.Types.ObjectId, default: null },
    dueDate: { type: Date, default: null },
    dependsOn: { type: [Schema.Types.ObjectId], default: [] },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: TASKS_COLLECTION },
);

// Cola global de tareas: GET /tasks (desc por creación).
taskSchema.index({ tenantId: 1, createdAt: -1 });
// Tareas de UN proyecto: GET /tasks?projectId=.
taskSchema.index({ tenantId: 1, projectId: 1, createdAt: -1 });
// Cola filtrada: GET /tasks?status= (p. ej. la de "por hacer").
taskSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
// Listado archivado: GET /tasks?archived=.
taskSchema.index({ tenantId: 1, archived: 1, createdAt: -1 });

function getModel<T>(name: string, schema: Schema<T>): Model<T> {
  const existing = models[name] as Model<T> | undefined;
  if (existing !== undefined) {
    return existing;
  }
  return model<T>(name, schema);
}

export const ProjectModel = getModel<ProjectDoc>('ProjectsProject', projectSchema);
export const TaskModel = getModel<TaskDoc>('ProjectsTask', taskSchema);
