/**
 * Reglas de dominio Workflow (FASE 14): máquinas de instancia y aprobación,
 * archivado, normalización de `key` y evaluación PURA de la condición.
 * Sin Mongoose, sin Express, sin I/O.
 */
import type { ApprovalStatus } from '../entities/approval.js';
import type { InstanceState } from '../entities/workflow-instance.js';
import type { ConditionOperator, ConditionValue, WorkflowCondition } from '../entities/workflow.js';

export const KEY_MAX = 64;
export const NAME_MAX = 200;
export const DESCRIPTION_MAX = 2_000;
export const ENTITY_TYPE_MAX = 64;
export const APPROVER_ROLE_MAX = 64;
export const COMMENT_MAX = 500;
export const CONTEXT_VALUE_MAX = 500;

export interface RuleValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/**
 * Instancia: `awaiting_approval → approved|rejected`; `approved`, `rejected` y
 * `skipped` son terminales (re-ejecutar crea otra instancia).
 */
export const INSTANCE_TRANSITIONS: Partial<Record<InstanceState, readonly InstanceState[]>> = {
  awaiting_approval: ['approved', 'rejected'],
  approved: [],
  rejected: [],
  skipped: [],
};

export function canInstanceTransition(from: InstanceState, to: InstanceState): boolean {
  return (INSTANCE_TRANSITIONS[from] ?? []).includes(to);
}

/** Aprobación: `pending → approved|rejected`; los decididos son terminales. */
export const APPROVAL_TRANSITIONS: Partial<Record<ApprovalStatus, readonly ApprovalStatus[]>> = {
  pending: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

export function canApprovalTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return (APPROVAL_TRANSITIONS[from] ?? []).includes(to);
}

/** Únicas decisiones admitidas en `POST …/decision`. */
export const APPROVAL_DECISIONS = ['approved', 'rejected'] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export function canArchive(archived: boolean): boolean {
  return !archived;
}

export function canRestore(archived: boolean): boolean {
  return archived;
}

/** Normaliza la clave natural: mayúsculas, espacios → guiones. */
export function normalizeKey(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '-');
}

export function validateKey(key: string): RuleValidation {
  const issues: string[] = [];
  if (!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(key)) {
    issues.push(`Key must be 2-${KEY_MAX} chars: letters, digits, dot, dash or underscore`);
  }
  return { valid: issues.length === 0, issues };
}

/** Resultado de EVALUAR la condición (el servicio lo traduce a 422). */
export type ConditionOutcome =
  | { readonly ok: true; readonly matched: boolean }
  | { readonly ok: false; readonly reason: 'missing' | 'mismatch'; readonly field: string };

const NUMERIC_OPERATORS: ReadonlySet<ConditionOperator> = new Set(['gt', 'gte', 'lt', 'lte']);

/**
 * Evalúa `condition` contra el `context` de la ejecución. Pura y total:
 * - campo ausente → `missing` (el motor NO asume false: 422 explícito),
 * - tipo real ≠ tipo exigido por el operador → `mismatch` (también 422),
 * - match/no-match → `ok:true, matched`.
 */
export function evaluateCondition(
  condition: WorkflowCondition,
  context: Readonly<Record<string, ConditionValue>>,
): ConditionOutcome {
  if (!Object.prototype.hasOwnProperty.call(context, condition.field)) {
    return { ok: false, reason: 'missing', field: condition.field };
  }
  const actual = context[condition.field];
  const expected = condition.value;
  const mismatch: ConditionOutcome = {
    ok: false,
    reason: 'mismatch',
    field: condition.field,
  };

  if (NUMERIC_OPERATORS.has(condition.operator)) {
    if (typeof actual !== 'number' || typeof expected !== 'number') {
      return mismatch;
    }
    switch (condition.operator) {
      case 'gt':
        return { ok: true, matched: actual > expected };
      case 'gte':
        return { ok: true, matched: actual >= expected };
      case 'lt':
        return { ok: true, matched: actual < expected };
      case 'lte':
        return { ok: true, matched: actual <= expected };
      default:
        return mismatch;
    }
  }

  if (condition.operator === 'eq' || condition.operator === 'ne') {
    if (typeof actual !== typeof expected) {
      return mismatch;
    }
    const matched = condition.operator === 'eq' ? actual === expected : actual !== expected;
    return { ok: true, matched };
  }

  // `contains`: subcadena sobre textos.
  if (typeof actual !== 'string' || typeof expected !== 'string') {
    return mismatch;
  }
  return { ok: true, matched: actual.includes(expected) };
}
