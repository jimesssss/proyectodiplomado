import { z } from 'zod';
import { EMPLOYEE_STATUSES } from '../../domain/entities/employee.js';
import {
  DEPARTMENT_MAX,
  FIRST_NAME_MAX,
  LAST_NAME_MAX,
  MONEY_MAX,
  NOTES_MAX,
  PERIOD_PATTERN,
  POSITION_MAX,
  TIME_PATTERN,
} from '../../domain/rules/hr-rules.js';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdPattern, 'Invalid id');

/**
 * Esquemas estrictos: cualquier campo desconocido se RECHAZA con 400
 * (ADR-002). `code`/`email`/`hireDate`/`userId`/`status`/`archived` del
 * empleado, `employeeId`+`date` de asistencia y `employeeId`+`period` de
 * nómina son inmutables o de solo-lectura (NO existen en su PATCH → 400);
 * `firstName`/`lastName`/`position` van con `.trim()` (zod 4 recorta ANTES
 * del `min`: en blanco → 400); `email` el formato con Zod y las minúsculas
 * las aplica el servicio; `tenantId` nunca.
 */

const pageField = z.coerce.number().int().min(1).max(10_000).default(1);
const limitField = z.coerce.number().int().min(1).max(100).default(20);
const archivedField = z.enum(['true', 'false']).transform((value) => value === 'true');

const codeField = z.string().min(1).max(32);
const firstNameField = z.string().trim().min(1).max(FIRST_NAME_MAX);
const lastNameField = z.string().trim().min(1).max(LAST_NAME_MAX);
// `.trim()` ANTES de `.email()` (mismo orden que `.trim().min(1)`: la
// receta corre primero → ' x@y.com ' valida y el servicio baja a minúsculas).
const emailField = z.string().trim().min(3).max(254).email('Invalid email');
const positionField = z.string().trim().min(1).max(POSITION_MAX);
const departmentField = z.string().max(DEPARTMENT_MAX);
const timeField = z.string().regex(TIME_PATTERN, 'Invalid time');
const periodField = z.string().regex(PERIOD_PATTERN, 'Invalid period');
const amountField = z.number().min(0).max(MONEY_MAX);
const notesField = z.string().max(NOTES_MAX);

// --- Employee (maestro) ---

export const createEmployeeBodySchema = z.strictObject({
  code: codeField,
  firstName: firstNameField,
  lastName: lastNameField,
  email: emailField,
  position: positionField,
  department: departmentField.optional(),
  hireDate: z.coerce.date(),
  userId: objectId.optional(),
});

export const patchEmployeeBodySchema = z.strictObject({
  firstName: firstNameField.optional(),
  lastName: lastNameField.optional(),
  email: emailField.optional(),
  position: positionField.optional(),
  department: departmentField.nullable().optional(),
  hireDate: z.coerce.date().optional(),
  userId: objectId.nullable().optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  archived: z.boolean().optional(),
});

export const employeeListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
});

// --- Attendance ---

export const createAttendanceBodySchema = z.strictObject({
  employeeId: objectId,
  date: z.coerce.date(),
  checkIn: timeField,
  checkOut: timeField.optional(),
  notes: notesField.optional(),
});

export const patchAttendanceBodySchema = z.strictObject({
  checkIn: timeField.nullable().optional(),
  checkOut: timeField.nullable().optional(),
  notes: notesField.nullable().optional(),
  archived: z.boolean().optional(),
});

export const attendanceListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  employeeId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  archived: archivedField.optional(),
});

// --- Salary ---

export const createSalaryBodySchema = z.strictObject({
  employeeId: objectId,
  period: periodField,
  baseAmount: amountField,
  bonusAmount: amountField.optional(),
  deductionAmount: amountField.optional(),
});

export const patchSalaryBodySchema = z.strictObject({
  baseAmount: amountField.optional(),
  bonusAmount: amountField.optional(),
  deductionAmount: amountField.optional(),
  archived: z.boolean().optional(),
});

export const salaryListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  employeeId: objectId.optional(),
  period: periodField.optional(),
  archived: archivedField.optional(),
});
