import { z } from 'zod';
import { PROJECT_STATUSES } from '../../domain/entities/project.js';
import { TASK_PRIORITIES, TASK_STATUSES } from '../../domain/entities/task.js';
import { DEPENDENCIES_MAX, DESCRIPTION_MAX } from '../../domain/rules/project-rules.js';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdPattern, 'Invalid id');

/**
 * Esquemas estrictos: cualquier campo desconocido se RECHAZA con 400
 * (ADR-002). `code` solo existe en el create del proyecto (clave natural
 * inmutable → PATCH con `code` → 400); `status` viaja en el PATCH como
 * transición de máquina de estados; `tenantId`/`projectId` nunca en el
 * PATCH de la tarea (`projectId` es fijo al crear; el tenant sale del JWT).
 */

const pageField = z.coerce.number().int().min(1).max(10_000).default(1);
const limitField = z.coerce.number().int().min(1).max(100).default(20);
const archivedField = z.enum(['true', 'false']).transform((value) => value === 'true');

const descriptionField = z.string().max(DESCRIPTION_MAX);
const dependenciesField = z.array(objectId).max(DEPENDENCIES_MAX);

// --- Project (maestro) ---

export const createProjectBodySchema = z.strictObject({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  description: descriptionField.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  managerId: objectId.optional(),
});

export const patchProjectBodySchema = z.strictObject({
  name: z.string().min(1).max(120).optional(),
  description: descriptionField.nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  managerId: objectId.nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  archived: z.boolean().optional(),
});

export const projectListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
});

// --- Task (hijo de proyecto) ---

export const createTaskBodySchema = z.strictObject({
  projectId: objectId,
  title: z.string().min(1).max(120),
  description: descriptionField.optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: objectId.optional(),
  dueDate: z.coerce.date().optional(),
  dependsOn: dependenciesField.optional(),
});

export const patchTaskBodySchema = z.strictObject({
  title: z.string().min(1).max(120).optional(),
  description: descriptionField.nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: objectId.nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  dependsOn: dependenciesField.optional(),
  status: z.enum(TASK_STATUSES).optional(),
  archived: z.boolean().optional(),
});

export const taskListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
  status: z.enum(TASK_STATUSES).optional(),
  projectId: objectId.optional(),
});
