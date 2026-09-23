import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import { toPublicAttendance, type PublicAttendance } from '../domain/entities/attendance.js';
import {
  canArchive,
  canRestore,
  isCheckOutOnOrAfter,
  normalizeAttendanceDate,
} from '../domain/rules/hr-rules.js';
import {
  attendanceRepo,
  employeeRepo,
  type AttendanceListFilter,
} from '../infrastructure/repositories/hr-repository.js';

/**
 * Casos de uso de asistencia (FASE 19). UN registro por empleado por DÍA
 * (clave única `employeeId+date`, `409` si se repite); el día se trunca a
 * medianoche UTC. Sin máquina: el registro se edita libremente (fichajes y
 * notas) y el `status` `open|closed` se DERIVA de `checkOut` al exponer.
 * FK empleado → `404` uniforme (mismo módulo, patrón projects); la ruta
 * DELETE NO está publicada (`attendance:*` no tiene `:delete`) — se archiva
 * con `PATCH {archived}` con `attendance:update`.
 */

export interface CreateAttendanceInput {
  readonly employeeId: string;
  readonly date: Date;
  readonly checkIn: string;
  readonly checkOut?: string | undefined;
  readonly notes?: string | undefined;
}

export interface PatchAttendanceInput {
  readonly checkIn?: string | null | undefined;
  readonly checkOut?: string | null | undefined;
  readonly notes?: string | null | undefined;
  readonly archived?: boolean | undefined;
}

export interface AttendanceListQuery {
  readonly page: number;
  readonly limit: number;
  readonly employeeId?: string | undefined;
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
  readonly archived?: boolean | undefined;
}

export interface AttendancePage {
  readonly items: readonly PublicAttendance[];
  readonly total: number;
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** La pareja efectiva (entrada+salida) debe ser coherente y del mismo día. */
function assertTimes(checkIn: string | null, checkOut: string | null): void {
  if (checkOut !== null && checkIn === null) {
    throw new ValidationError('checkIn is required when checkOut is set');
  }
  if (checkOut !== null && checkIn !== null && !isCheckOutOnOrAfter(checkIn, checkOut)) {
    throw new ValidationError('checkOut must be on or after checkIn');
  }
}

export async function createAttendance(
  tenantId: string,
  input: CreateAttendanceInput,
): Promise<PublicAttendance> {
  const employee = await employeeRepo.findById(tenantId, input.employeeId);
  if (employee === null) {
    throw new NotFoundError(); // empleado inexistente/ajeno → 404 uniforme
  }
  if (employee.archived) {
    throw new ConflictError('Employee is archived'); // paralelo a 'Project is archived' (FASE 17)
  }
  assertTimes(input.checkIn, input.checkOut ?? null);
  const created = await attendanceRepo.create(tenantId, {
    employeeId: input.employeeId,
    date: normalizeAttendanceDate(input.date), // día a medianoche UTC (parte de la clave)
    checkIn: input.checkIn,
    checkOut: input.checkOut ?? null,
    notes: trimOrNull(input.notes),
  });
  return toPublicAttendance(created);
}

export async function listAttendance(
  tenantId: string,
  query: AttendanceListQuery,
): Promise<AttendancePage> {
  const from = query.from === undefined ? undefined : normalizeAttendanceDate(query.from);
  const to = query.to === undefined ? undefined : normalizeAttendanceDate(query.to);
  if (from !== undefined && to !== undefined && from.getTime() > to.getTime()) {
    throw new ValidationError('from must be on or before to');
  }
  const filter: AttendanceListFilter = {
    employeeId: query.employeeId,
    from,
    to,
    archived: query.archived,
  };
  const page = await attendanceRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map((record) => toPublicAttendance(record)), total: page.total };
}

export async function getAttendance(tenantId: string, id: string): Promise<PublicAttendance> {
  const record = await attendanceRepo.findById(tenantId, id);
  if (record === null) {
    throw new NotFoundError();
  }
  return toPublicAttendance(record);
}

export async function updateAttendance(
  tenantId: string,
  id: string,
  input: PatchAttendanceInput,
): Promise<PublicAttendance> {
  const current = await attendanceRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }

  const set: Record<string, unknown> = {};
  if (input.checkIn !== undefined) {
    set.checkIn = input.checkIn;
  }
  if (input.checkOut !== undefined) {
    set.checkOut = input.checkOut;
  }
  if (input.notes !== undefined) {
    set.notes = trimOrNull(input.notes);
  }

  // Siempre valida la PAREJA efectiva (lo escrito + lo que ya estaba): la
  // entrada no puede desaparecer debajo de una salida existente.
  const effectiveCheckIn = input.checkIn !== undefined ? input.checkIn : current.checkIn;
  const effectiveCheckOut = input.checkOut !== undefined ? input.checkOut : current.checkOut;
  assertTimes(effectiveCheckIn, effectiveCheckOut);

  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Attendance is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Attendance is not archived');
    }
    set.archived = input.archived;
  }

  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await attendanceRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicAttendance(updated);
}

/**
 * Sin `attendance:delete` en el catálogo → la ruta DELETE NO se publica
 * (peticiones → 404); el archivado real es `PATCH {archived}` con
 * `attendance:update`. Esta función queda como implementación completa del
 * contrato del router CRUD (patrón `archiveBom`, FASE 16).
 */
export async function archiveAttendance(tenantId: string, id: string): Promise<PublicAttendance> {
  const current = await attendanceRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Attendance is already archived');
  }
  const archived = await attendanceRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicAttendance(archived);
}
