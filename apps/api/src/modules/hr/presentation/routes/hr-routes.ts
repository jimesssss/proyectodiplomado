import type { Router } from 'express';
import {
  createCrudRouter,
  type CrudListQueryBase,
  type CrudPatchBase,
  type CrudResourceSpec,
  type CrudRouterDeps,
} from '../../../../core/http/crud-router.js';
import {
  archiveAttendance,
  createAttendance,
  getAttendance,
  listAttendance,
  updateAttendance,
  type AttendanceListQuery,
  type CreateAttendanceInput,
  type PatchAttendanceInput,
} from '../../application/attendance-service.js';
import {
  archiveEmployee,
  createEmployee,
  getEmployee,
  listEmployees,
  updateEmployee,
  type CreateEmployeeInput,
  type EmployeeListQuery,
  type PatchEmployeeInput,
} from '../../application/employee-service.js';
import {
  archiveSalary,
  createSalary,
  getSalary,
  listSalaries,
  updateSalary,
  type CreateSalaryInput,
  type PatchSalaryInput,
  type SalaryListQuery,
} from '../../application/salary-service.js';
import type { PublicAttendance } from '../../domain/entities/attendance.js';
import type { PublicEmployee } from '../../domain/entities/employee.js';
import type { PublicSalary } from '../../domain/entities/salary.js';
import {
  attendanceListQuerySchema,
  createAttendanceBodySchema,
  createEmployeeBodySchema,
  createSalaryBodySchema,
  employeeListQuerySchema,
  patchAttendanceBodySchema,
  patchEmployeeBodySchema,
  patchSalaryBodySchema,
  salaryListQuerySchema,
} from '../validators/hr-validators.js';

export type HrRouterDeps = CrudRouterDeps;

/**
 * Los 3 montajes del módulo bajo `/api/v1/*` (convenciones §4, fila 19).
 * El catálogo v1 SÍ tiene `employee:delete` → **13 endpoints**: empleados
 * con DELETE publicado (soft-delete); `attendance:*` y `hr.salary:*` NO
 * tienen `:delete` → esas rutas DELETE NO se publican (peticiones → 404) y
 * los registros se archivan con `PATCH {archived}` con su permiso de
 * actualización (patrón bom/production.order/goods.receipt).
 */
export const HR_ROUTE_PATHS = {
  employees: '/api/v1/employees',
  attendance: '/api/v1/attendance',
  salaries: '/api/v1/salaries',
} as const;

function employeeSpec(): CrudResourceSpec<
  PublicEmployee,
  CreateEmployeeInput,
  PatchEmployeeInput & CrudPatchBase,
  EmployeeListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'employee:read',
      create: 'employee:create',
      update: 'employee:update',
      delete: 'employee:delete',
    },
    entity: 'employee',
    createSchema: createEmployeeBodySchema,
    patchSchema: patchEmployeeBodySchema,
    listQuerySchema: employeeListQuerySchema,
    handlers: {
      create: (tenantId, body) => createEmployee(tenantId, body),
      list: (tenantId, query) => listEmployees(tenantId, query),
      get: (tenantId, id) => getEmployee(tenantId, id),
      update: (tenantId, id, patch) => updateEmployee(tenantId, id, patch),
      archive: (tenantId, id) => archiveEmployee(tenantId, id),
    },
  };
}

function attendanceSpec(): CrudResourceSpec<
  PublicAttendance,
  CreateAttendanceInput,
  PatchAttendanceInput & CrudPatchBase,
  AttendanceListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'attendance:read',
      create: 'attendance:create',
      update: 'attendance:update',
      // Sin `attendance:delete` en el catálogo → ruta DELETE no publicada (404).
    },
    entity: 'attendance',
    createSchema: createAttendanceBodySchema,
    patchSchema: patchAttendanceBodySchema,
    listQuerySchema: attendanceListQuerySchema,
    handlers: {
      create: (tenantId, body) => createAttendance(tenantId, body),
      list: (tenantId, query) => listAttendance(tenantId, query),
      get: (tenantId, id) => getAttendance(tenantId, id),
      update: (tenantId, id, patch) => updateAttendance(tenantId, id, patch),
      archive: (tenantId, id) => archiveAttendance(tenantId, id),
    },
  };
}

function salarySpec(): CrudResourceSpec<
  PublicSalary,
  CreateSalaryInput,
  PatchSalaryInput & CrudPatchBase,
  SalaryListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'hr.salary:read',
      create: 'hr.salary:create',
      update: 'hr.salary:update',
      // Sin `hr.salary:delete` en el catálogo → ruta DELETE no publicada (404).
    },
    entity: 'salary',
    createSchema: createSalaryBodySchema,
    patchSchema: patchSalaryBodySchema,
    listQuerySchema: salaryListQuerySchema,
    handlers: {
      create: (tenantId, body) => createSalary(tenantId, body),
      list: (tenantId, query) => listSalaries(tenantId, query),
      get: (tenantId, id) => getSalary(tenantId, id),
      update: (tenantId, id, patch) => updateSalary(tenantId, id, patch),
      archive: (tenantId, id) => archiveSalary(tenantId, id),
    },
  };
}

/** El montaje del módulo (3 rutas), listo para la composition root. */
export function createHrRouters(deps: HrRouterDeps): readonly { path: string; router: Router }[] {
  return [
    { path: HR_ROUTE_PATHS.employees, router: createCrudRouter(deps, employeeSpec()) },
    { path: HR_ROUTE_PATHS.attendance, router: createCrudRouter(deps, attendanceSpec()) },
    { path: HR_ROUTE_PATHS.salaries, router: createCrudRouter(deps, salarySpec()) },
  ];
}
