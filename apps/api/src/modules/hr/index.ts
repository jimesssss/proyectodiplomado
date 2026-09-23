/**
 * Superficie pública del módulo HR (FASE 19).
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 */
export {
  createHrRouters,
  HR_ROUTE_PATHS,
  type HrRouterDeps,
} from './presentation/routes/hr-routes.js';
export {
  archiveAttendance,
  createAttendance,
  getAttendance,
  listAttendance,
  updateAttendance,
} from './application/attendance-service.js';
export {
  archiveEmployee,
  createEmployee,
  getEmployee,
  listEmployees,
  updateEmployee,
} from './application/employee-service.js';
export {
  archiveSalary,
  createSalary,
  getSalary,
  listSalaries,
  updateSalary,
} from './application/salary-service.js';
export {
  deriveAttendanceStatus,
  toPublicAttendance,
  type Attendance,
  type AttendanceStatus,
  type PublicAttendance,
} from './domain/entities/attendance.js';
export {
  EMPLOYEE_STATUSES,
  toPublicEmployee,
  type Employee,
  type EmployeeStatus,
  type PublicEmployee,
} from './domain/entities/employee.js';
export { toPublicSalary, type PublicSalary, type Salary } from './domain/entities/salary.js';
export {
  EMPLOYEE_TRANSITIONS,
  canEmployeeTransition,
  computeNetPay,
  isEmployeeTerminal,
  normalizeAttendanceDate,
  normalizeEmployeeCode,
} from './domain/rules/hr-rules.js';
