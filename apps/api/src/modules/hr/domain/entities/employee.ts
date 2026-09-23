/**
 * Entidad Employee (FASE 19 — módulo HR). Personal del tenant con clave
 * natural `code` única e inmutable (patrón projects/CRM), FK opcional hacia
 * la cuenta de usuario del sistema y máquina de estados laborales con
 * `terminated` terminal. El email se normaliza a minúsculas en el servicio.
 */
export const EMPLOYEE_STATUSES = ['active', 'inactive', 'terminated'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export interface Employee {
  readonly id: string;
  readonly tenantId: string;
  /** Clave natural única por tenant (normalizada e inmutable). */
  readonly code: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly position: string;
  /** Texto libre (1-80). FK a departamentos de Organization: NO implementado (PARTIAL). */
  readonly department: string | null;
  readonly userId: string | null;
  readonly hireDate: Date;
  readonly status: EmployeeStatus;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type PublicEmployee = Omit<Employee, 'tenantId'>;

export function toPublicEmployee(employee: Employee): PublicEmployee {
  return {
    id: employee.id,
    code: employee.code,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    position: employee.position,
    department: employee.department,
    userId: employee.userId,
    hireDate: employee.hireDate,
    status: employee.status,
    archived: employee.archived,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}
