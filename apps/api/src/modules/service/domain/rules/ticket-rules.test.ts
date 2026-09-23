/**
 * Reglas de dominio Service — FASE 18.
 * Puras (sin Mongo/Express): máquina de estados de soporte CON reapertura
 * (`resolved → in_progress`), terminales `closed`/`cancelled` (los que
 * congelan los campos de negocio), archivado, prioridad por defecto, SLA
 * derivado (`dueAt` = creación + horas) y límites de los campos de texto.
 */
import { describe, expect, it } from 'vitest';
import {
  DESCRIPTION_MAX,
  RESOLUTION_MAX,
  SUBJECT_MAX,
  TICKET_SLA_HOURS,
  TICKET_TRANSITIONS,
  canArchive,
  canRestore,
  canTicketTransition,
  computeDueAt,
  defaultTicketPriority,
  isTicketTerminal,
} from './ticket-rules.js';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../entities/ticket.js';

describe('service rules: máquina de estados de soporte', () => {
  it('open → in_progress|resolved|cancelled (incluye resolver directo); in_progress → resolved|cancelled', () => {
    expect(TICKET_TRANSITIONS.open).toEqual(['in_progress', 'resolved', 'cancelled']);
    expect(TICKET_TRANSITIONS.in_progress).toEqual(['resolved', 'cancelled']);
    expect(canTicketTransition('open', 'in_progress')).toBe(true);
    expect(canTicketTransition('open', 'resolved')).toBe(true); // incidencia trivial
    expect(canTicketTransition('open', 'cancelled')).toBe(true);
    expect(canTicketTransition('in_progress', 'resolved')).toBe(true);
    expect(canTicketTransition('in_progress', 'cancelled')).toBe(true);
  });

  it('resolved NO es terminal: reabrir (→ in_progress) o cerrar (→ closed)', () => {
    expect(TICKET_TRANSITIONS.resolved).toEqual(['in_progress', 'closed']);
    expect(canTicketTransition('resolved', 'in_progress')).toBe(true); // reapertura
    expect(canTicketTransition('resolved', 'closed')).toBe(true);
    expect(canTicketTransition('resolved', 'cancelled')).toBe(false); // ya resuelto no se cancela
    expect(canTicketTransition('open', 'closed')).toBe(false); // debe pasar por resolved
    expect(canTicketTransition('in_progress', 'closed')).toBe(false);
  });

  it('closed/cancelled sin salida (terminales) y el resto no', () => {
    expect(TICKET_TRANSITIONS.closed).toEqual([]);
    expect(TICKET_TRANSITIONS.cancelled).toEqual([]);
    expect(canTicketTransition('closed', 'in_progress')).toBe(false);
    expect(canTicketTransition('cancelled', 'open')).toBe(false);
    expect(isTicketTerminal('open')).toBe(false);
    expect(isTicketTerminal('in_progress')).toBe(false);
    expect(isTicketTerminal('resolved')).toBe(false); // reabrible
    expect(isTicketTerminal('closed')).toBe(true);
    expect(isTicketTerminal('cancelled')).toBe(true);
  });

  it('5 estados y 4 prioridades en el orden canónico', () => {
    expect([...TICKET_STATUSES]).toEqual([
      'open',
      'in_progress',
      'resolved',
      'closed',
      'cancelled',
    ]);
    expect([...TICKET_PRIORITIES]).toEqual(['low', 'normal', 'high', 'urgent']);
  });

  it('archivar/restore solo en el sentido correcto', () => {
    expect(canArchive(false)).toBe(true);
    expect(canArchive(true)).toBe(false);
    expect(canRestore(true)).toBe(true);
    expect(canRestore(false)).toBe(false);
  });
});

describe('service rules: SLA derivado (dueAt)', () => {
  it('horas por prioridad: urgent 4, high 8, normal 24, low 72', () => {
    expect(TICKET_SLA_HOURS).toEqual({ urgent: 4, high: 8, normal: 24, low: 72 });
  });

  it('computeDueAt = creación + SLA (prioridad por defecto: 24 h)', () => {
    const createdAt = new Date('2026-03-10T08:00:00.000Z');
    expect(computeDueAt(createdAt, 'normal').toISOString()).toBe('2026-03-11T08:00:00.000Z');
    expect(computeDueAt(createdAt, 'urgent').toISOString()).toBe('2026-03-10T12:00:00.000Z');
    expect(computeDueAt(createdAt, 'high').toISOString()).toBe('2026-03-10T16:00:00.000Z');
    expect(computeDueAt(createdAt, 'low').toISOString()).toBe('2026-03-13T08:00:00.000Z');
    // Cambiar la prioridad DESPLAZA el vencimiento (recalculado al exponer).
    expect(computeDueAt(createdAt, 'urgent').getTime()).toBeLessThan(
      computeDueAt(createdAt, 'low').getTime(),
    );
  });

  it('defaults y límites de campos', () => {
    expect(defaultTicketPriority()).toBe('normal');
    expect(SUBJECT_MAX).toBe(120);
    expect(DESCRIPTION_MAX).toBe(500);
    expect(RESOLUTION_MAX).toBe(500);
  });
});
