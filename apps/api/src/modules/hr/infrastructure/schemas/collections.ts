import { Schema, model, models, type Model } from 'mongoose';
import { EMPLOYEE_STATUSES } from '../../domain/entities/employee.js';
import {
  DEPARTMENT_MAX,
  FIRST_NAME_MAX,
  LAST_NAME_MAX,
  NOTES_MAX,
  POSITION_MAX,
} from '../../domain/rules/hr-rules.js';
import type { AttendanceDoc, EmployeeDoc, SalaryDoc } from './types.js';

/**
 * 3 colecciones propias de HR (ADR-003): `employees` (maestro con clave
 * natural + máquina laboral), `attendance` (registro único por empleado+día)
 * y `salaries` (renglón único por empleado+período). Cada una se lista y
 * filtra independiente de la auditoría.
 */
export const EMPLOYEES_COLLECTION = 'employees';
export const ATTENDANCE_COLLECTION = 'attendance';
export const SALARIES_COLLECTION = 'salaries';

const employeeSchema = new Schema<EmployeeDoc>(
  {
    tenantId: { type: String, required: true },
    code: { type: String, required: true },
    firstName: { type: String, required: true, trim: true, maxlength: FIRST_NAME_MAX },
    lastName: { type: String, required: true, trim: true, maxlength: LAST_NAME_MAX },
    email: { type: String, required: true, trim: true, lowercase: true },
    position: { type: String, required: true, trim: true, maxlength: POSITION_MAX },
    department: { type: String, default: null, trim: true, maxlength: DEPARTMENT_MAX },
    userId: { type: Schema.Types.ObjectId, default: null },
    hireDate: { type: Date, required: true },
    status: { type: String, required: true, enum: [...EMPLOYEE_STATUSES] },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: EMPLOYEES_COLLECTION },
);

// Clave natural única POR tenant (ADR-002): duplicado → 409 en el repo.
employeeSchema.index({ tenantId: 1, code: 1 }, { unique: true });
// Email laboral único por tenant (dos fichas no compilan la misma cuenta).
employeeSchema.index({ tenantId: 1, email: 1 }, { unique: true });
// Listado por defecto: GET /employees (desc por creación).
employeeSchema.index({ tenantId: 1, createdAt: -1 });
// Listado archivado: GET /employees?archived=.
employeeSchema.index({ tenantId: 1, archived: 1, createdAt: -1 });
// Cola de personal: GET /employees?status= (p. ej. solo `active`).
employeeSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

const attendanceSchema = new Schema<AttendanceDoc>(
  {
    tenantId: { type: String, required: true },
    employeeId: { type: Schema.Types.ObjectId, required: true },
    date: { type: Date, required: true },
    checkIn: { type: String, required: true, maxlength: 5 },
    checkOut: { type: String, default: null, maxlength: 5 },
    notes: { type: String, default: null, maxlength: NOTES_MAX },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: ATTENDANCE_COLLECTION },
);

// UN registro por empleado por DÍA (unicidad incluye archivados: corregir
// es vía PATCH, no archivar y recrear) → duplicado → 409 en el repo.
attendanceSchema.index({ tenantId: 1, employeeId: 1, date: 1 }, { unique: true });
// Listado y rangos: GET /attendance (orden `date` desc, `?from=`/`?to=`).
attendanceSchema.index({ tenantId: 1, date: -1 });
// Listado archivado: GET /attendance?archived=.
attendanceSchema.index({ tenantId: 1, archived: 1, date: -1 });

const salarySchema = new Schema<SalaryDoc>(
  {
    tenantId: { type: String, required: true },
    employeeId: { type: Schema.Types.ObjectId, required: true },
    period: { type: String, required: true },
    baseAmount: { type: Number, required: true, min: 0 },
    bonusAmount: { type: Number, required: true, min: 0, default: 0 },
    deductionAmount: { type: Number, required: true, min: 0, default: 0 },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: SALARIES_COLLECTION },
);

// UN renglón de nómina por empleado por PERÍODO (unicidad incluye archivados:
// un período anulado sigue ocupado → no se paga dos veces) → 409 en el repo.
salarySchema.index({ tenantId: 1, employeeId: 1, period: 1 }, { unique: true });
// Listado por defecto: GET /salaries (desc por creación).
salarySchema.index({ tenantId: 1, createdAt: -1 });
// Cierre de nómina: GET /salaries?period= (todos los sueldos del mes).
salarySchema.index({ tenantId: 1, period: 1, createdAt: -1 });
// Listado archivado: GET /salaries?archived=.
salarySchema.index({ tenantId: 1, archived: 1, createdAt: -1 });

function getModel<T>(name: string, schema: Schema<T>): Model<T> {
  const existing = models[name] as Model<T> | undefined;
  if (existing !== undefined) {
    return existing;
  }
  return model<T>(name, schema);
}

export const EmployeeModel = getModel<EmployeeDoc>('HrEmployee', employeeSchema);
export const AttendanceModel = getModel<AttendanceDoc>('HrAttendance', attendanceSchema);
export const SalaryModel = getModel<SalaryDoc>('HrSalary', salarySchema);
