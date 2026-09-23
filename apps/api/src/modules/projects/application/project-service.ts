import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
// FK de usuario (composición FASE 8): Projects → Identity, nunca al revés.
import { findUserInTenant } from '../../identity/index.js';
import {
  toPublicProject,
  type ProjectStatus,
  type PublicProject,
} from '../domain/entities/project.js';
import {
  canArchive,
  canProjectTransition,
  canRestore,
  isProjectTerminal,
  isValidDateRange,
  normalizeProjectCode,
  validateProjectCode,
} from '../domain/rules/project-rules.js';
import {
  projectRepo,
  type ProjectListFilter,
} from '../infrastructure/repositories/project-repository.js';

/**
 * Casos de uso del maestro de proyectos (FASE 17). `tenantId` SIEMPRE del
 * JWT (ADR-002); FKs inexistentes/ajenas → 404 uniforme, usuario
 * desconocido → 400 (patrón CRM). `code` es la clave natural: normalizada,
 * inmutable (no aparece en el PATCH → 400 por esquema estricto) y única por
 * tenant (409). Los campos de negocio solo son editables en estados NO
 * terminales (`completed`/`cancelled` congelan el documento); `archived` es
 * ortogonal (soft-delete con `PATCH {archived}` y `DELETE`).
 */

export interface CreateProjectInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly startDate?: Date | undefined;
  readonly endDate?: Date | undefined;
  readonly managerId?: string | undefined;
}

export interface PatchProjectInput {
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly startDate?: Date | null | undefined;
  readonly endDate?: Date | null | undefined;
  readonly managerId?: string | null | undefined;
  readonly status?: ProjectStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface ProjectListQuery {
  readonly page: number;
  readonly limit: number;
  readonly status?: ProjectStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface ProjectPage {
  readonly items: readonly PublicProject[];
  readonly total: number;
}

/** Campos de negocio: congelados en estados terminales. */
const BUSINESS_FIELDS = ['name', 'description', 'startDate', 'endDate', 'managerId'] as const;

function assertCode(code: string): string {
  const normalized = normalizeProjectCode(code);
  const check = validateProjectCode(normalized);
  if (!check.valid) {
    throw new ValidationError('Invalid code', { issues: [...check.issues] });
  }
  return normalized;
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** `managerId` debe existir en el tenant (desconocido → 400, como CRM). */
async function assertManager(tenantId: string, userId: string): Promise<void> {
  const user = await findUserInTenant(tenantId, userId);
  if (user === null) {
    throw new ValidationError('Unknown user', { user: userId });
  }
}

function assertDateRange(startDate: Date | null, endDate: Date | null): void {
  if (!isValidDateRange({ startDate, endDate })) {
    throw new ValidationError('endDate must be on or after startDate');
  }
}

export async function createProject(
  tenantId: string,
  input: CreateProjectInput,
): Promise<PublicProject> {
  const startDate = input.startDate ?? null;
  const endDate = input.endDate ?? null;
  assertDateRange(startDate, endDate);
  const payload: Record<string, unknown> = {
    code: assertCode(input.code),
    name: input.name.trim(),
    description: trimOrNull(input.description),
    status: 'planning',
    startDate,
    endDate,
    managerId: null,
  };
  if (input.managerId !== undefined) {
    await assertManager(tenantId, input.managerId);
    payload.managerId = input.managerId;
  }
  const project = await projectRepo.create(tenantId, payload);
  return toPublicProject(project);
}

export async function listProjects(
  tenantId: string,
  query: ProjectListQuery,
): Promise<ProjectPage> {
  const filter: ProjectListFilter = { status: query.status, archived: query.archived };
  const page = await projectRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map((project) => toPublicProject(project)), total: page.total };
}

export async function getProject(tenantId: string, id: string): Promise<PublicProject> {
  const project = await projectRepo.findById(tenantId, id);
  if (project === null) {
    throw new NotFoundError();
  }
  return toPublicProject(project);
}

export async function updateProject(
  tenantId: string,
  id: string,
  input: PatchProjectInput,
): Promise<PublicProject> {
  const current = await projectRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }

  const set: Record<string, unknown> = {};
  const requested = BUSINESS_FIELDS.filter((field) => input[field] !== undefined);
  if (requested.length > 0 && isProjectTerminal(current.status)) {
    throw new ConflictError('Only non-terminal projects can be edited');
  }
  if (input.name !== undefined) {
    set.name = input.name.trim();
  }
  if (input.description !== undefined) {
    set.description = trimOrNull(input.description);
  }
  if (input.startDate !== undefined) {
    set.startDate = input.startDate;
  }
  if (input.endDate !== undefined) {
    set.endDate = input.endDate;
  }
  // Coherencia sobre los valores EFECTIVOS (los que quedarían guardados).
  const effectiveStart = input.startDate !== undefined ? input.startDate : current.startDate;
  const effectiveEnd = input.endDate !== undefined ? input.endDate : current.endDate;
  assertDateRange(effectiveStart, effectiveEnd);
  if (input.managerId !== undefined) {
    if (input.managerId === null) {
      set.managerId = null;
    } else {
      await assertManager(tenantId, input.managerId);
      set.managerId = input.managerId;
    }
  }

  if (input.status !== undefined) {
    if (input.status === current.status) {
      throw new ConflictError('Status is already the requested one');
    }
    if (!canProjectTransition(current.status, input.status)) {
      throw new ConflictError('Invalid status transition');
    }
    set.status = input.status;
  }

  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Project is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Project is not archived');
    }
    set.archived = input.archived;
  }

  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await projectRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicProject(updated);
}

/** DELETE = soft-delete: marca `archived` (doble archive → 409). */
export async function archiveProject(tenantId: string, id: string): Promise<PublicProject> {
  const current = await projectRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Project is already archived');
  }
  const archived = await projectRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicProject(archived);
}
