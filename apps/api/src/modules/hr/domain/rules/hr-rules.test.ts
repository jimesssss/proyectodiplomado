/**
 * Reglas de dominio HR — FASE 19.
 * Puras (sin Mongo/Express): máquina del empleado con `terminated` terminal,
 * código/email normalizados, horas `HH:MM` (orden salida ≥ entrada), día de
 * asistencia a medianoche UTC, período `YYYY-MM` y neto de nómina derivado
 * con `roundMoney`.
 */
import { describe, expect, it } from 'vitest';
import {
  DEPARTMENT_MAX,
  EMPLOYEE_TRANSITIONS,
  FIRST_NAME_MAX,
  LAST_NAME_MAX,
  NOTES_MAX,
  PERIOD_PATTERN,
  POSITION_MAX,
  TIME_PATTERN,
  canArchive,
  canEmployeeTransition,
  canRestore,
  computeNetPay,
  isCheckOutOnOrAfter,
  isEmployeeTerminal,
  isValidPeriod,
  isValidTime,
  normalizeAttendanceDate,
  normalizeEmail,
  normalizeEmployeeCode,
  validateEmployeeCode,
} from './hr-rules.js';
import { EMPLOYEE_STATUSES } from '../entities/employee.js';

describe('hr rules: máquina del empleado', () => {
  it('active ↔ inactive y ambas → terminated; terminated sin salida', () => {
    expect(EMPLOYEE_TRANSITIONS.active).toEqual(['inactive', 'terminated']);
    expect(EMPLOYEE_TRANSITIONS.inactive).toEqual(['active', 'terminated']);
    expect(canEmployeeTransition('active', 'inactive')).toBe(true);
    expect(canEmployeeTransition('inactive', 'active')).toBe(true); // reincorporación
    expect(canEmployeeTransition('active', 'terminated')).toBe(true);
    expect(canEmployeeTransition('inactive', 'terminated')).toBe(true);
    expect(canEmployeeTransition('terminated', 'active')).toBe(false);
    expect(canEmployeeTransition('active', 'active')).toBe(false); // repetido → 409 en servicio
  });

  it('terminal solo `terminated`; archivar/restore en un solo sentido', () => {
    expect(isEmployeeTerminal('active')).toBe(false);
    expect(isEmployeeTerminal('inactive')).toBe(false);
    expect(isEmployeeTerminal('terminated')).toBe(true);
    expect(canArchive(false)).toBe(true);
    expect(canArchive(true)).toBe(false);
    expect(canRestore(true)).toBe(true);
    expect(canRestore(false)).toBe(false);
  });

  it('3 estados en el orden canónico', () => {
    expect([...EMPLOYEE_STATUSES]).toEqual(['active', 'inactive', 'terminated']);
  });
});

describe('hr rules: código y email', () => {
  it('normalizeEmployeeCode: trim, mayúsculas y espacios → guiones', () => {
    expect(normalizeEmployeeCode(' ana torres ')).toBe('ANA-TORRES');
    expect(normalizeEmployeeCode('emp  01')).toBe('EMP-01');
    expect(normalizeEmployeeCode('E-2026/01')).toBe('E-2026/01');
  });

  it('validateEmployeeCode: 2-32 de [A-Z0-9._-] con inicial válida', () => {
    expect(validateEmployeeCode('EMP-01').valid).toBe(true);
    expect(validateEmployeeCode('A').valid).toBe(false); //1 < 2
    expect(validateEmployeeCode('A'.repeat(33)).valid).toBe(false); // >32
    expect(validateEmployeeCode('-LEAD').valid).toBe(false); // inicial no alfanumérica
    expect(validateEmployeeCode('EMP 01').valid).toBe(false); // espacio sin normalizar
    expect(validateEmployeeCode('Ñ-01').valid).toBe(false);
  });

  it('normalizeEmail: trim + minúsculas (formato lo valida Zod)', () => {
    expect(normalizeEmail('  Ana.Torres@Example.COM ')).toBe('ana.torres@example.com');
  });

  it('límites de campos', () => {
    expect(FIRST_NAME_MAX).toBe(60);
    expect(LAST_NAME_MAX).toBe(60);
    expect(POSITION_MAX).toBe(80);
    expect(DEPARTMENT_MAX).toBe(80);
    expect(NOTES_MAX).toBe(200);
  });
});

describe('hr rules: asistencia', () => {
  it('TIME_PATTERN: 24h HH:MM', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('08:30')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:00')).toBe(false); //2 dígitos
    expect(isValidTime('08:60')).toBe(false);
    expect(isValidTime('0800')).toBe(false);
    expect(TIME_PATTERN.test('07:15')).toBe(true);
  });

  it('salida ≥ entrada (lexicográfico == cronológico para HH:MM)', () => {
    expect(isCheckOutOnOrAfter('08:00', '17:00')).toBe(true);
    expect(isCheckOutOnOrAfter('08:00', '08:00')).toBe(true); // misma hora
    expect(isCheckOutOnOrAfter('08:30', '10:05')).toBe(true);
    expect(isCheckOutOnOrAfter('09:00', '08:59')).toBe(false);
    expect(isCheckOutOnOrAfter('09:00', '10:00')).toBe(true); // '1' > '0'
  });

  it('normalizeAttendanceDate: trunca a medianoche UTC', () => {
    expect(normalizeAttendanceDate(new Date('2026-09-23T14:35:12.000Z')).toISOString()).toBe(
      '2026-09-23T00:00:00.000Z',
    );
    expect(normalizeAttendanceDate(new Date('2026-01-01T00:00:00.000Z')).toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });
});

describe('hr rules: nómina', () => {
  it('PERIOD_PATTERN: YYYY-MM con mes 01-12', () => {
    expect(isValidPeriod('2026-09')).toBe(true);
    expect(isValidPeriod('2026-12')).toBe(true);
    expect(isValidPeriod('2026-00')).toBe(false);
    expect(isValidPeriod('2026-13')).toBe(false);
    expect(isValidPeriod('2026-9')).toBe(false); // mes con 1 dígito
    expect(isValidPeriod('202609')).toBe(false);
    expect(PERIOD_PATTERN.test('2026-01')).toBe(true);
  });

  it('computeNetPay = base + bonus − deduction con roundMoney (2 decimales)', () => {
    expect(computeNetPay(1000, 50, 100.5)).toBe(949.5);
    expect(computeNetPay(1000.005, 0, 0)).toBe(1000.01); // redondeo 2dp
    expect(computeNetPay(0, 0, 0)).toBe(0);
    expect(computeNetPay(1000, 0, 5000)).toBe(-4000); // neto negativo permitido (anticipo)
    expect(computeNetPay(10.005, 0, 0)).toBe(10.01);
  });
});
