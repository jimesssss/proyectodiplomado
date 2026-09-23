/**
 * Superficie pública del módulo Projects (FASE 17).
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 */
export {
  createProjectsRouters,
  PROJECT_ROUTE_PATHS,
  type ProjectRouterDeps,
} from './presentation/routes/project-routes.js';
export {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  updateProject,
} from './application/project-service.js';
export {
  archiveTask,
  createTask,
  getTask,
  listTasks,
  updateTask,
} from './application/task-service.js';
export {
  PROJECT_STATUSES,
  toPublicProject,
  type Project,
  type ProjectStatus,
  type PublicProject,
} from './domain/entities/project.js';
export {
  TASK_PRIORITIES,
  TASK_STATUSES,
  toPublicTask,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type PublicTask,
} from './domain/entities/task.js';
export {
  PROJECT_TRANSITIONS,
  TASK_TRANSITIONS,
  canProjectTransition,
  canTaskTransition,
  dependsOnReaches,
  isDependencyBlocking,
  isProjectTerminal,
  isTaskTerminal,
  normalizeProjectCode,
  validateDependencies,
} from './domain/rules/project-rules.js';
