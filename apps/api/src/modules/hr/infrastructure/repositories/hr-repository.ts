import { Types, type Model } from 'mongoose';
import { ConflictError } from '../../../../core/errors/app-error.js';
import type { Attendance } from '../../domain/entities/attendance.js';
import type { Employee } from '../../domain/entities/employee.js';
import type { Salary } from '../../domain/entities/salary.js';
import type { EmployeeStatus } from '../../domain/entities/employee.js';
import { AttendanceModel, EmployeeModel, SalaryModel } from '../schemas/collections.js';
import type { AttendanceDoc, EmployeeDoc, SalaryDoc } from '../schemas/types.js';

/**
 * Repositorio HR — único camino a MongoDB del módulo (3 colecciones).
 * TODA operación filtra por `tenantId` (nunca llega del cliente, ADR-002).
 * Único punto de casteo: payload/$set de create/update y ObjectId en
 * filtros/mappers. Duplicados (`E11000`) → `409` con mensaje del índice.
 */

export interface EmployeeListFilter {
  readonly status?: EmployeeStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface AttendanceListFilter {
  readonly employeeId?: string | undefined;
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
  readonly archived?: boolean | undefined;
}

export interface SalaryListFilter {
  readonly employeeId?: string | undefined;
  readonly period?: string | undefined;
  readonly archived?: boolean | undefined;
}

export interface RepoPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

/** Mensaje del `409` según el índice violado (code vs email vs único-doc). */
function duplicateConflict(error: unknown, fallback: string): ConflictError {
  const indexHint = String(error).toLowerCase();
  if (indexHint.includes('email')) {
    return new ConflictError('Email already exists');
  }
  return new ConflictError(fallback);
}

function mapEmployee(doc: EmployeeDoc): Employee {
  return {
    id: String(doc._id),
    tenantId: doc.tenantId,
    code: doc.code,
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    position: doc.position,
    department: doc.department ?? null,
    userId: doc.userId == null ? null : String(doc.userId),
    hireDate: doc.hireDate,
    status: doc.status,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapAttendance(doc: AttendanceDoc): Attendance {
  return {
    id: String(doc._id),
    tenantId: doc.tenantId,
    employeeId: String(doc.employeeId),
    date: doc.date,
    checkIn: doc.checkIn,
    checkOut: doc.checkOut ?? null,
    notes: doc.notes ?? null,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapSalary(doc: SalaryDoc): Salary {
  return {
    id: String(doc._id),
    tenantId: doc.tenantId,
    employeeId: String(doc.employeeId),
    period: doc.period,
    baseAmount: doc.baseAmount,
    bonusAmount: doc.bonusAmount,
    deductionAmount: doc.deductionAmount,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Listado paginado con orden/`skip`/`count` sobre el MISMO filtro. */
async function paged<TDoc, TEntity>(
  model: Model<TDoc>,
  tenantId: string,
  extra: Record<string, unknown>,
  page: number,
  limit: number,
  sort: Record<string, 1 | -1>,
  map: (doc: TDoc) => TEntity,
): Promise<RepoPage<TEntity>> {
  const skip = (page - 1) * limit;
  const mongoFilter = { tenantId, ...extra };
  const [docs, total] = await Promise.all([
    model.find(mongoFilter).sort(sort).skip(skip).limit(limit).lean(),
    model.countDocuments(mongoFilter),
  ]);
  return {
    items: docs.map((doc) => map(doc as TDoc)),
    total,
  };
}

export interface EmployeeRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Employee>;
  findById(tenantId: string, id: string): Promise<Employee | null>;
  list(
    tenantId: string,
    filter: EmployeeListFilter,
    page: number,
    limit: number,
  ): Promise<RepoPage<Employee>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<Employee | null>;
}

export const employeeRepo: EmployeeRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await EmployeeModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as EmployeeDoc);
      return mapEmployee(doc.toObject() as unknown as EmployeeDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw duplicateConflict(error, 'Code already exists');
      }
      throw error;
    }
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await EmployeeModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapEmployee(doc as unknown as EmployeeDoc);
  },

  async list(tenantId, filter, page, limit) {
    return paged(
      EmployeeModel,
      tenantId,
      {
        ...(filter.status !== undefined ? { status: filter.status } : {}),
        ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
      },
      page,
      limit,
      { createdAt: -1, _id: -1 },
      mapEmployee,
    );
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await EmployeeModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), tenantId },
      { $set: set as Record<string, never> },
      { returnDocument: 'after' },
    ).lean();
    return doc === null ? null : mapEmployee(doc as unknown as EmployeeDoc);
  },
};

export interface AttendanceRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Attendance>;
  findById(tenantId: string, id: string): Promise<Attendance | null>;
  list(
    tenantId: string,
    filter: AttendanceListFilter,
    page: number,
    limit: number,
  ): Promise<RepoPage<Attendance>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<Attendance | null>;
}

export const attendanceRepo: AttendanceRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await AttendanceModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as AttendanceDoc);
      return mapAttendance(doc.toObject() as unknown as AttendanceDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('Attendance already recorded for this date');
      }
      throw error;
    }
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await AttendanceModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapAttendance(doc as unknown as AttendanceDoc);
  },

  async list(tenantId, filter, page, limit) {
    return paged(
      AttendanceModel,
      tenantId,
      {
        ...(filter.employeeId !== undefined ? { employeeId: filter.employeeId } : {}),
        ...(filter.from !== undefined || filter.to !== undefined
          ? {
              date: {
                ...(filter.from !== undefined ? { $gte: filter.from } : {}),
                ...(filter.to !== undefined ? { $lte: filter.to } : {}),
              },
            }
          : {}),
        ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
      },
      page,
      limit,
      { date: -1, _id: -1 },
      mapAttendance,
    );
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await AttendanceModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), tenantId },
      { $set: set as Record<string, never> },
      { returnDocument: 'after' },
    ).lean();
    return doc === null ? null : mapAttendance(doc as unknown as AttendanceDoc);
  },
};

export interface SalaryRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Salary>;
  findById(tenantId: string, id: string): Promise<Salary | null>;
  list(
    tenantId: string,
    filter: SalaryListFilter,
    page: number,
    limit: number,
  ): Promise<RepoPage<Salary>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<Salary | null>;
}

export const salaryRepo: SalaryRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await SalaryModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as SalaryDoc);
      return mapSalary(doc.toObject() as unknown as SalaryDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('Salary record already exists for this period');
      }
      throw error;
    }
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await SalaryModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapSalary(doc as unknown as SalaryDoc);
  },

  async list(tenantId, filter, page, limit) {
    return paged(
      SalaryModel,
      tenantId,
      {
        ...(filter.employeeId !== undefined ? { employeeId: filter.employeeId } : {}),
        ...(filter.period !== undefined ? { period: filter.period } : {}),
        ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
      },
      page,
      limit,
      { createdAt: -1, _id: -1 },
      mapSalary,
    );
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await SalaryModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), tenantId },
      { $set: set as Record<string, never> },
      { returnDocument: 'after' },
    ).lean();
    return doc === null ? null : mapSalary(doc as unknown as SalaryDoc);
  },
};
