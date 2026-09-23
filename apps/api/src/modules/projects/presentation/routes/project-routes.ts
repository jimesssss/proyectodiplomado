import type { Router } from 'express';
import {
  createCrudRouter,
  type CrudListQueryBase,
  type CrudPatchBase,
  type CrudResourceSpec,
  type CrudRouterDeps,
} from '../../../../core/http/crud-router.js';
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  updateProject,
  type CreateProjectInput,
  type PatchProjectInput,
  type ProjectListQuery,
} from '../../application/project-service.js';
import {
  archiveTask,
  createTask,
  getTask,
  listTasks,
  updateTask,
  type CreateTaskInput,
  type PatchTaskInput,
  type TaskListQuery,
} from '../../application/task-service.js';
import type { PublicProject } from '../../domain/entities/project.js';
import type { PublicTask } from '../../domain/entities/task.js';
import {
  createProjectBodySchema,
  createTaskBodySchema,
  patchProjectBodySchema,
  patchTaskBodySchema,
  projectListQuerySchema,
  taskListQuerySchema,
} from '../validators/project-validators.js';

export type ProjectRouterDeps = CrudRouterDeps;

/**
 * Montajes del módulo bajo `/api/v1/projects` y `/api/v1/tasks` (convenciones
 * §4 fila 17). AMBOS recursos usan el grupo `project:*`: el catálogo SÍ
 * define `project:delete` (sin bump de versión, pv=2 vigente desde FASE 16)
 * → DELETE publicado como **soft-delete** (patrón CRM/product: marca
 * `archived`, doble archive → 409); las transiciones de estado van por
 * `PATCH {status}` con `project:update`.
 */
export const PROJECT_ROUTE_PATHS = {
  projects: '/api/v1/projects',
  tasks: '/api/v1/tasks',
} as const;

function projectSpec(): CrudResourceSpec<
  PublicProject,
  CreateProjectInput,
  PatchProjectInput & CrudPatchBase,
  ProjectListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'project:read',
      create: 'project:create',
      update: 'project:update',
      delete: 'project:delete',
    },
    entity: 'project',
    createSchema: createProjectBodySchema,
    patchSchema: patchProjectBodySchema,
    listQuerySchema: projectListQuerySchema,
    handlers: {
      create: (tenantId, body) => createProject(tenantId, body),
      list: (tenantId, query) => listProjects(tenantId, query),
      get: (tenantId, id) => getProject(tenantId, id),
      update: (tenantId, id, patch) => updateProject(tenantId, id, patch),
      archive: (tenantId, id) => archiveProject(tenantId, id),
    },
  };
}

function taskSpec(): CrudResourceSpec<
  PublicTask,
  CreateTaskInput,
  PatchTaskInput & CrudPatchBase,
  TaskListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      // Tareas: grupo `project` (el módulo no define permisos propios).
      read: 'project:read',
      create: 'project:create',
      update: 'project:update',
      delete: 'project:delete',
    },
    entity: 'task',
    createSchema: createTaskBodySchema,
    patchSchema: patchTaskBodySchema,
    listQuerySchema: taskListQuerySchema,
    handlers: {
      create: (tenantId, body) => createTask(tenantId, body),
      list: (tenantId, query) => listTasks(tenantId, query),
      get: (tenantId, id) => getTask(tenantId, id),
      update: (tenantId, id, patch) => updateTask(tenantId, id, patch),
      archive: (tenantId, id) => archiveTask(tenantId, id),
    },
  };
}

/** Los 2 montajes del módulo, listos para la composition root. */
export function createProjectsRouters(
  deps: ProjectRouterDeps,
): readonly { path: string; router: Router }[] {
  return [
    { path: PROJECT_ROUTE_PATHS.projects, router: createCrudRouter(deps, projectSpec()) },
    { path: PROJECT_ROUTE_PATHS.tasks, router: createCrudRouter(deps, taskSpec()) },
  ];
}
