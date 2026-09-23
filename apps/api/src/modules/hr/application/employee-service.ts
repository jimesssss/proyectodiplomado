import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
// FK de usuario (composición FASE 8): HR → Identity, nunca al revés.
import { findUserInTenant } from '../../identity/index.js';
import {
  toPublicEmployee,
  type EmployeeStatus,
  type PublicEmployee,
} from '../domain/entities/employee.js';
import {
  canArchive,
  canEmployeeTransition,
  canRestore,
  isEmployeeTerminal,
  normalizeEmployeeCode,
  normalizeEmail,
  validateEmployeeCode,
} from '../domain/rules/hr-rules.js';
import {
  employeeRepo,
  type EmployeeListFilter,
} from '../infrastructure/repositories/hr-repository.js';

/**
 * Casos de uso de fichas de empleado (FASE 19). `tenantId` SIEMPRE del JWT
 * (ADR-002); usuario desconocido → 400 (patrón CRM). `code` se normaliza y
 * valida en el servidor (único por tenant, inmutable); email en minúsculas
 * (único por tenant → 409). Máquina laboral con `terminated` terminal: los
 * campos de negocio se congelan ahí (409); `archived` es ortogonal
 * (soft-delete con `employee:delete`).
 */

export interface CreateEmployeeInput {
  readonly code: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly position: string;
  readonly department?: string | undefined;
  readonly hireDate: Date;
  readonly userId?: string | undefined;
}

export interface PatchEmployeeInput {
  readonly firstName?: string | undefined;
  readonly lastName?: string | undefined;
  readonly email?: string | undefined;
  readonly position?: string | undefined;
  readonly department?: string | null | undefined;
  readonly hireDate?: Date | undefined;
  readonly userId?: string | null | undefined;
  readonly status?: EmployeeStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface EmployeeListQuery {
  readonly page: number;
  readonly limit: number;
  readonly status?: EmployeeStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface EmployeePage {
  readonly items: readonly PublicEmployee[];
  readonly total: number;
}

/** Campos de negocio: congelados cuando la ficha está `terminated`. */
const BUSINESS_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'position',
  'department',
  'hireDate',
  'userId',
] as const;

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** `userId` debe existir en el tenant (desconocido → 400, como CRM). */
async function assertUser(tenantId: string, userId: string): Promise<void> {
  const user = await findUserInTenant(tenantId, userId);
  if (user === null) {
    throw new ValidationError('Unknown user', { user: userId });
  }
}

export async function createEmployee(
  tenantId: string,
  input: CreateEmployeeInput,
): Promise<PublicEmployee> {
  const normalizedCode = normalizeEmployeeCode(input.code);
  const validation = validateEmployeeCode(normalizedCode);
  if (!validation.valid) {
    throw new ValidationError('Invalid code', {
      issues: validation.issues.map((message) => ({ path: 'code', message })),
    });
  }
  const payload: Record<string, unknown> = {
    code: normalizedCode,
    firstName: input.firstName, // zod `.trim()` (min sobre el recortado)
    lastName: input.lastName,
    email: normalizeEmail(input.email),
    position: input.position,
    department: trimOrNull(input.department),
    hireDate: input.hireDate,
    status: 'active',
    userId: null,
  };
  if (input.userId !== undefined) {
    await assertUser(tenantId, input.userId);
    payload.userId = input.userId;
  }
  const employee = await employeeRepo.create(tenantId, payload);
  return toPublicEmployee(employee);
}

export async function listEmployees(
  tenantId: string,
  query: EmployeeListQuery,
): Promise<EmployeePage> {
  const filter: EmployeeListFilter = { status: query.status, archived: query.archived };
  const page = await employeeRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map((employee) => toPublicEmployee(employee)), total: page.total };
}

export async function getEmployee(tenantId: string, id: string): Promise<PublicEmployee> {
  const employee = await employeeRepo.findById(tenantId, id);
  if (employee === null) {
    throw new NotFoundError();
  }
  return toPublicEmployee(employee);
}

export async function updateEmployee(
  tenantId: string,
  id: string,
  input: PatchEmployeeInput,
): Promise<PublicEmployee> {
  const current = await employeeRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }

  const requested = BUSINESS_FIELDS.filter((field) => input[field] !== undefined);
  if (requested.length > 0 && isEmployeeTerminal(current.status)) {
    throw new ConflictError('Only non-terminal employees can be edited');
  }

  const set: Record<string, unknown> = {};
  if (input.firstName !== undefined) {
    set.firstName = input.firstName;
  }
  if (input.lastName !== undefined) {
    set.lastName = input.lastName;
  }
  if (input.email !== undefined) {
    set.email = normalizeEmail(input.email);
  }
  if (input.position !== undefined) {
    set.position = input.position;
  }
  if (input.department !== undefined) {
    set.department = trimOrNull(input.department);
  }
  if (input.hireDate !== undefined) {
    set.hireDate = input.hireDate;
  }
  if (input.userId !== undefined) {
    if (input.userId === null) {
      set.userId = null;
    } else {
      await assertUser(tenantId, input.userId);
      set.userId = input.userId;
    }
  }

  if (input.status !== undefined) {
    if (input.status === current.status) {
      throw new ConflictError('Status is already the requested one');
    }
    if (!canEmployeeTransition(current.status, input.status)) {
      throw new ConflictError('Invalid status transition');
    }
    set.status = input.status;
  }

  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Employee is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Employee is not archived');
    }
    set.archived = input.archived;
  }

  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await employeeRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicEmployee(updated);
}

/** DELETE = soft-delete: marca `archived` (doble archive → 409). */
export async function archiveEmployee(tenantId: string, id: string): Promise<PublicEmployee> {
  const current = await employeeRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Employee is already archived');
  }
  const archived = await employeeRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicEmployee(archived);
}
