import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import { toPublicSalary, type PublicSalary } from '../domain/entities/salary.js';
import { canArchive, canRestore, roundMoney } from '../domain/rules/hr-rules.js';
import {
  employeeRepo,
  salaryRepo,
  type SalaryListFilter,
} from '../infrastructure/repositories/hr-repository.js';

/**
 * Casos de uso de nómina básica (FASE 19). UN renglón por empleado por
 * PERÍODO `YYYY-MM` (clave única → `409` si se repite); importes con
 * `roundMoney` (2 decimales) y `netAmount` DERIVADO al exponer (imposible
 * desincronizarlo). FK empleado → `404` uniforme; `employeeId` y `period`
 * son fijos al crear (NO existen en el PATCH → `400`). La ruta DELETE NO
 * está publicada (`hr.salary:*` no tiene `:delete`) — se archiva con
 * `PATCH {archived}` con `hr.salary:update` (período anulado sigue ocupado:
 * no se paga dos veces). PARTIAL: sin integración contable ni moneda.
 */

export interface CreateSalaryInput {
  readonly employeeId: string;
  readonly period: string;
  readonly baseAmount: number;
  readonly bonusAmount?: number | undefined;
  readonly deductionAmount?: number | undefined;
}

export interface PatchSalaryInput {
  readonly baseAmount?: number | undefined;
  readonly bonusAmount?: number | undefined;
  readonly deductionAmount?: number | undefined;
  readonly archived?: boolean | undefined;
}

export interface SalaryListQuery {
  readonly page: number;
  readonly limit: number;
  readonly employeeId?: string | undefined;
  readonly period?: string | undefined;
  readonly archived?: boolean | undefined;
}

export interface SalaryPage {
  readonly items: readonly PublicSalary[];
  readonly total: number;
}

export async function createSalary(
  tenantId: string,
  input: CreateSalaryInput,
): Promise<PublicSalary> {
  const employee = await employeeRepo.findById(tenantId, input.employeeId);
  if (employee === null) {
    throw new NotFoundError(); // empleado inexistente/ajeno → 404 uniforme
  }
  if (employee.archived) {
    throw new ConflictError('Employee is archived'); // paralelo a 'Project is archived' (FASE 17)
  }
  const created = await salaryRepo.create(tenantId, {
    employeeId: input.employeeId,
    period: input.period, // validado por Zod (`YYYY-MM`)
    baseAmount: roundMoney(input.baseAmount),
    bonusAmount: roundMoney(input.bonusAmount ?? 0),
    deductionAmount: roundMoney(input.deductionAmount ?? 0),
  });
  return toPublicSalary(created);
}

export async function listSalaries(tenantId: string, query: SalaryListQuery): Promise<SalaryPage> {
  const filter: SalaryListFilter = {
    employeeId: query.employeeId,
    period: query.period,
    archived: query.archived,
  };
  const page = await salaryRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map((salary) => toPublicSalary(salary)), total: page.total };
}

export async function getSalary(tenantId: string, id: string): Promise<PublicSalary> {
  const salary = await salaryRepo.findById(tenantId, id);
  if (salary === null) {
    throw new NotFoundError();
  }
  return toPublicSalary(salary);
}

export async function updateSalary(
  tenantId: string,
  id: string,
  input: PatchSalaryInput,
): Promise<PublicSalary> {
  const current = await salaryRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }

  const set: Record<string, unknown> = {};
  if (input.baseAmount !== undefined) {
    set.baseAmount = roundMoney(input.baseAmount);
  }
  if (input.bonusAmount !== undefined) {
    set.bonusAmount = roundMoney(input.bonusAmount);
  }
  if (input.deductionAmount !== undefined) {
    set.deductionAmount = roundMoney(input.deductionAmount);
  }

  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Salary is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Salary is not archived');
    }
    set.archived = input.archived;
  }

  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await salaryRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicSalary(updated);
}

/**
 * Sin `hr.salary:delete` en el catálogo → la ruta DELETE NO se publica
 * (peticiones → 404); el archivado real es `PATCH {archived}` con
 * `hr.salary:update`. Esta función queda como implementación completa del
 * contrato del router CRUD (patrón `archiveBom`, FASE 16).
 */
export async function archiveSalary(tenantId: string, id: string): Promise<PublicSalary> {
  const current = await salaryRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Salary is already archived');
  }
  const archived = await salaryRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicSalary(archived);
}
