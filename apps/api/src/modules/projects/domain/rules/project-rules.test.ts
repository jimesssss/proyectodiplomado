/**
 * Reglas de dominio Projects — FASE 17.
 * Puras (sin Mongo/Express): máquinas de estados (proyecto y tarea),
 * editabilidad de no-terminales, archivado, normalización/validación del
 * código, bloqueo de dependencias al completar, reglas estructurales de
 * `dependsOn` y detección de ciclos (BFS sobre el grafo guardado).
 */
import { describe, expect, it } from 'vitest';
import {
  DEPENDENCIES_MAX,
  DESCRIPTION_MAX,
  PROJECT_TRANSITIONS,
  TASK_TRANSITIONS,
  canArchive,
  canProjectTransition,
  canRestore,
  canTaskTransition,
  defaultTaskPriority,
  dependsOnReaches,
  isDependencyBlocking,
  isProjectTerminal,
  isTaskTerminal,
  isValidDateRange,
  normalizeProjectCode,
  validateDependencies,
  validateProjectCode,
} from './project-rules.js';
import { PROJECT_STATUSES } from '../entities/project.js';
import { TASK_STATUSES } from '../entities/task.js';

const T = '64b0000000000000000000t0';
const A = '64b0000000000000000000a0';
const B = '64b0000000000000000000b0';
const C = '64b0000000000000000000c0';
const D = '64b0000000000000000000d0';

describe('projects rules: máquina de estados del proyecto', () => {
  it('planning → active|cancelled; active → on_hold|completed|cancelled; on_hold → active|cancelled', () => {
    expect(PROJECT_TRANSITIONS.planning).toEqual(['active', 'cancelled']);
    expect(PROJECT_TRANSITIONS.active).toEqual(['on_hold', 'completed', 'cancelled']);
    expect(PROJECT_TRANSITIONS.on_hold).toEqual(['active', 'cancelled']);
    expect(canProjectTransition('planning', 'active')).toBe(true);
    expect(canProjectTransition('active', 'on_hold')).toBe(true);
    expect(canProjectTransition('active', 'completed')).toBe(true);
    expect(canProjectTransition('on_hold', 'active')).toBe(true);
    expect(canProjectTransition('planning', 'cancelled')).toBe(true);
  });

  it('sin saltos y terminales sin salida', () => {
    expect(canProjectTransition('planning', 'completed')).toBe(false);
    expect(canProjectTransition('planning', 'on_hold')).toBe(false);
    expect(canProjectTransition('on_hold', 'completed')).toBe(false);
    expect(canProjectTransition('active', 'planning')).toBe(false);
    expect(canProjectTransition('completed', 'active')).toBe(false);
    expect(canProjectTransition('completed', 'cancelled')).toBe(false);
    expect(canProjectTransition('cancelled', 'active')).toBe(false);
    expect(PROJECT_TRANSITIONS.completed).toEqual([]);
    expect(PROJECT_TRANSITIONS.cancelled).toEqual([]);
  });

  it('los 5 estados existen y completed/cancelled son terminales', () => {
    expect([...PROJECT_STATUSES]).toEqual([
      'planning',
      'active',
      'on_hold',
      'completed',
      'cancelled',
    ]);
    expect(isProjectTerminal('planning')).toBe(false);
    expect(isProjectTerminal('active')).toBe(false);
    expect(isProjectTerminal('on_hold')).toBe(false);
    expect(isProjectTerminal('completed')).toBe(true);
    expect(isProjectTerminal('cancelled')).toBe(true);
  });
});

describe('projects rules: máquina de estados de la tarea', () => {
  it('open → in_progress|done|cancelled (incluye salto directo); in_progress → done|cancelled', () => {
    expect(TASK_TRANSITIONS.open).toEqual(['in_progress', 'done', 'cancelled']);
    expect(TASK_TRANSITIONS.in_progress).toEqual(['done', 'cancelled']);
    expect(canTaskTransition('open', 'in_progress')).toBe(true);
    expect(canTaskTransition('open', 'done')).toBe(true); // tareas simples
    expect(canTaskTransition('open', 'cancelled')).toBe(true);
    expect(canTaskTransition('in_progress', 'done')).toBe(true);
    expect(canTaskTransition('in_progress', 'cancelled')).toBe(true);
  });

  it('sin saltos hacia atrás y terminales sin salida', () => {
    expect(canTaskTransition('in_progress', 'open')).toBe(false);
    expect(canTaskTransition('done', 'in_progress')).toBe(false);
    expect(canTaskTransition('done', 'cancelled')).toBe(false);
    expect(canTaskTransition('cancelled', 'open')).toBe(false);
    expect(TASK_TRANSITIONS.done).toEqual([]);
    expect(TASK_TRANSITIONS.cancelled).toEqual([]);
    expect([...TASK_STATUSES]).toEqual(['open', 'in_progress', 'done', 'cancelled']);
    expect(isTaskTerminal('open')).toBe(false);
    expect(isTaskTerminal('in_progress')).toBe(false);
    expect(isTaskTerminal('done')).toBe(true);
    expect(isTaskTerminal('cancelled')).toBe(true);
  });

  it('archivar/restore solo en el sentido correcto', () => {
    expect(canArchive(false)).toBe(true);
    expect(canArchive(true)).toBe(false);
    expect(canRestore(true)).toBe(true);
    expect(canRestore(false)).toBe(false);
  });
});

describe('projects rules: bloqueo de dependencias al completar', () => {
  it('bloquea con dependencias activas; done/cancelled/archivada no bloquean', () => {
    expect(isDependencyBlocking({ status: 'open', archived: false })).toBe(true);
    expect(isDependencyBlocking({ status: 'in_progress', archived: false })).toBe(true);
    expect(isDependencyBlocking({ status: 'done', archived: false })).toBe(false);
    expect(isDependencyBlocking({ status: 'cancelled', archived: false })).toBe(false);
    // Archivada = fuera de juego aunque siga abierta.
    expect(isDependencyBlocking({ status: 'open', archived: true })).toBe(false);
  });
});

describe('projects rules: estructura de dependsOn', () => {
  it('duplicados se rechazan (con y sin selfId)', () => {
    const withDuplicates = validateDependencies([A, B, A]);
    expect(withDuplicates.valid).toBe(false);
    expect(withDuplicates.issues).toContain('Duplicate dependency');
    const duplicatesWithSelf = validateDependencies([A, A], T);
    expect(duplicatesWithSelf.issues).toContain('Duplicate dependency');
  });

  it('auto-referencia solo aplica con selfId (en el ALTA la tarea aún no existe)', () => {
    expect(validateDependencies([T]).valid).toBe(true); // alta: imposible ciclar
    const self = validateDependencies([A, T], T);
    expect(self.valid).toBe(false);
    expect(self.issues).toContain('A task cannot depend on itself');
    const noSelf = validateDependencies([A, B], T);
    expect(noSelf).toEqual({ valid: true, issues: [] });
  });

  it(`como máximo ${DEPENDENCIES_MAX} dependencias`, () => {
    const many = Array.from({ length: DEPENDENCIES_MAX + 1 }, (_, index) =>
      String(index).padStart(24, '0'),
    );
    const check = validateDependencies(many);
    expect(check.valid).toBe(false);
    expect(check.issues).toContain(`At most ${DEPENDENCIES_MAX} dependencies are allowed`);
    expect(check.issues).not.toContain('Duplicate dependency'); // todas distintas
  });
});

describe('projects rules: detección de ciclos (dependsOnReaches)', () => {
  it('camino directo y encadenado hasta la tarea objetivo', () => {
    // B depende de T: añadir T→B crearía el ciclo T→B→T.
    expect(dependsOnReaches(new Map([[B, [T]]]), [B], T)).toBe(true);
    // B→C→D→T: cadena de 3 aristas guardadas.
    const chain = new Map<string, readonly string[]>([
      [B, [C]],
      [C, [D]],
      [D, [T]],
    ]);
    expect(dependsOnReaches(chain, [B], T)).toBe(true);
    // La propia tarea en el conjunto inicial (self ya rechazado antes).
    expect(dependsOnReaches(new Map(), [T], T)).toBe(true);
  });

  it('sin camino no hay ciclo (incluye ciclos ajenos que deben terminar)', () => {
    const noPath = new Map<string, readonly string[]>([
      [B, [C]],
      [C, []],
    ]);
    expect(dependsOnReaches(noPath, [B], T)).toBe(false);
    // Ciclo existente X↔Y que NO incluye a T: el BFS lo atraviesa y termina.
    const foreignCycle = new Map<string, readonly string[]>([
      [A, [B]],
      [B, [A]],
    ]);
    expect(dependsOnReaches(foreignCycle, [A], T)).toBe(false);
    // Sin aristas / lista vacía.
    expect(dependsOnReaches(new Map(), [], T)).toBe(false);
    expect(dependsOnReaches(new Map(), [B], T)).toBe(false);
  });
});

describe('projects rules: código, fechas y prioridad', () => {
  it('normalizeProjectCode: mayúsculas, \\s+ colapsa a guiones', () => {
    expect(normalizeProjectCode('web portal')).toBe('WEB-PORTAL');
    expect(normalizeProjectCode('  tornillo   m6 ')).toBe('TORNILLO-M6');
    expect(normalizeProjectCode('P-1')).toBe('P-1');
  });

  it('validateProjectCode: 2-32 chars (letras, dígitos, punto, guion, guion bajo)', () => {
    expect(validateProjectCode('WEB-PORTAL').valid).toBe(true);
    expect(validateProjectCode('A.B_C-1').valid).toBe(true); // ya normalizado
    expect(validateProjectCode('A').valid).toBe(false);
    expect(validateProjectCode('X'.repeat(33)).valid).toBe(false);
    expect(validateProjectCode('.startsWith-dot').valid).toBe(false);
    const check = validateProjectCode('A');
    expect(check.issues).toEqual([
      'Code must be 2-32 chars: letters, digits, dot, dash or underscore',
    ]);
  });

  it('isValidDateRange: null = sin límite; fin ≥ inicio', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-06-30T00:00:00.000Z');
    expect(isValidDateRange({ startDate: start, endDate: null })).toBe(true);
    expect(isValidDateRange({ startDate: null, endDate: end })).toBe(true);
    expect(isValidDateRange({ startDate: null, endDate: null })).toBe(true);
    expect(isValidDateRange({ startDate: start, endDate: end })).toBe(true);
    expect(isValidDateRange({ startDate: start, endDate: start })).toBe(true); // mismo día
    expect(isValidDateRange({ startDate: end, endDate: start })).toBe(false); // invertidas
  });

  it('defaults: prioridad normal y límites de campos', () => {
    expect(defaultTaskPriority()).toBe('normal');
    expect(DESCRIPTION_MAX).toBe(500);
    expect(DEPENDENCIES_MAX).toBe(50);
  });
});
