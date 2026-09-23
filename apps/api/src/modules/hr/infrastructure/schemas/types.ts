import type { Types } from 'mongoose';
import type { EmployeeStatus } from '../../domain/entities/employee.js';

/**
 * Documentos de las 3 colecciones del módulo HR. `null` = campo opcional
 * limpiado vía PATCH; `undefined` = nunca escrito. `employeeId`/`userId` son
 * ObjectId en Mongo y string en el dominio (único punto de casteo: mapper
 * del repositorio). `status` del empleado SÍ se almacena; el `status` de
 * asistencia (`open`/`closed`) y el `netAmount` de nómina NO existen en el
 * documento (derivados al exponer).
 */
export interface EmployeeDoc {
  _id: Types.ObjectId;
  tenantId: string;
  /** Clave natural única por tenant (normalizada e inmutable). */
  code: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string;
  department?: string | null;
  userId?: Types.ObjectId | null;
  hireDate: Date;
  status: EmployeeStatus;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttendanceDoc {
  _id: Types.ObjectId;
  tenantId: string;
  employeeId: Types.ObjectId;
  /** Día a medianoche UTC: parte de la clave única empleado+día. */
  date: Date;
  checkIn: string;
  checkOut?: string | null;
  notes?: string | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalaryDoc {
  _id: Types.ObjectId;
  tenantId: string;
  employeeId: Types.ObjectId;
  /** `YYYY-MM`: parte de la clave única empleado+período. */
  period: string;
  baseAmount: number;
  bonusAmount: number;
  deductionAmount: number;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}
