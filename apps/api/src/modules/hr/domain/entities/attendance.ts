/**
 * Entidad Attendance (FASE 19 — módulo HR). Registro de asistencia de UN
 * empleado por DÍA (`date` a medianoche UTC, único por empleado+día).
 * `checkIn`/`checkOut` son horas `HH:MM` (24h, sin zona — PARTIAL: hora
 * local). El `status` (`open`/`closed`) NO se almacena: se deriva de
 * `checkOut` al exponer (abierto hasta fichar la salida).
 */
export type AttendanceStatus = 'open' | 'closed';

export interface Attendance {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeId: string;
  readonly date: Date;
  readonly checkIn: string;
  readonly checkOut: string | null;
  readonly notes: string | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PublicAttendance extends Omit<Attendance, 'tenantId'> {
  /** Derivado (no persistido): `closed` cuando hay `checkOut`. */
  readonly status: AttendanceStatus;
}

export function deriveAttendanceStatus(checkOut: string | null): AttendanceStatus {
  return checkOut === null ? 'open' : 'closed';
}

export function toPublicAttendance(attendance: Attendance): PublicAttendance {
  return {
    id: attendance.id,
    employeeId: attendance.employeeId,
    date: attendance.date,
    checkIn: attendance.checkIn,
    checkOut: attendance.checkOut,
    notes: attendance.notes,
    archived: attendance.archived,
    createdAt: attendance.createdAt,
    updatedAt: attendance.updatedAt,
    status: deriveAttendanceStatus(attendance.checkOut),
  };
}
