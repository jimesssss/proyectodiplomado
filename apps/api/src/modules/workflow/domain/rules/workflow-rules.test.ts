/**
 * Reglas de dominio Workflow — FASE 14 (unitarias, sin base de datos).
 */
import { describe, expect, it } from 'vitest';
import { toPublicApproval, type Approval } from '../entities/approval.js';
import { toPublicWorkflowInstance, type WorkflowInstance } from '../entities/workflow-instance.js';
import {
  CONDITION_OPERATORS,
  toPublicWorkflow,
  WORKFLOW_TRIGGERS,
  type Workflow,
} from '../entities/workflow.js';
import {
  APPROVAL_DECISIONS,
  APPROVAL_TRANSITIONS,
  INSTANCE_TRANSITIONS,
  KEY_MAX,
  canApprovalTransition,
  canArchive,
  canInstanceTransition,
  canRestore,
  evaluateCondition,
  normalizeKey,
  validateKey,
} from './workflow-rules.js';

const NOW = new Date('2026-01-15T10:00:00.000Z');
const SECRET_TENANT = 'tenant-secreto-no-expuesto';

const workflow: Workflow = {
  id: 'w1',
  tenantId: SECRET_TENANT,
  key: 'BIG-APPROVAL',
  name: 'Aprobación grande',
  description: null,
  trigger: { event: 'SalesOrderCreated', entityType: 'sales.order' },
  condition: { field: 'total', operator: 'gt', value: 50_000 },
  action: { type: 'request_approval', approverRole: 'gerente' },
  archived: false,
  createdAt: NOW,
  updatedAt: NOW,
};

const instance: WorkflowInstance = {
  id: 'i1',
  tenantId: SECRET_TENANT,
  workflowId: 'w1',
  entityType: 'sales.order',
  entityId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  context: { total: 75_000 },
  state: 'awaiting_approval',
  createdAt: NOW,
  updatedAt: NOW,
};

const approval: Approval = {
  id: 'a1',
  tenantId: SECRET_TENANT,
  instanceId: 'i1',
  workflowId: 'w1',
  entityType: 'sales.order',
  entityId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  approverRole: 'gerente',
  status: 'pending',
  decidedBy: null,
  decidedAt: null,
  comment: null,
  createdAt: NOW,
  updatedAt: NOW,
};

describe('workflow rules: máquinas de estados', () => {
  it('instancia: awaiting_approval → approved|rejected; terminales y skipped', () => {
    expect(canInstanceTransition('awaiting_approval', 'approved')).toBe(true);
    expect(canInstanceTransition('awaiting_approval', 'rejected')).toBe(true);
    expect(canInstanceTransition('awaiting_approval', 'skipped')).toBe(false);
    expect(canInstanceTransition('approved', 'rejected')).toBe(false);
    expect(canInstanceTransition('approved', 'awaiting_approval')).toBe(false);
    expect(canInstanceTransition('rejected', 'approved')).toBe(false);
    expect(canInstanceTransition('skipped', 'approved')).toBe(false);
    expect(canInstanceTransition('awaiting_approval', 'awaiting_approval')).toBe(false);
    expect(INSTANCE_TRANSITIONS.approved).toEqual([]);
    expect(INSTANCE_TRANSITIONS.rejected).toEqual([]);
    expect(INSTANCE_TRANSITIONS.skipped).toEqual([]);
  });

  it('aprobación: pending → approved|rejected; decididas son terminales', () => {
    expect(canApprovalTransition('pending', 'approved')).toBe(true);
    expect(canApprovalTransition('pending', 'rejected')).toBe(true);
    expect(canApprovalTransition('pending', 'pending')).toBe(false);
    expect(canApprovalTransition('approved', 'rejected')).toBe(false);
    expect(canApprovalTransition('rejected', 'approved')).toBe(false);
    expect(APPROVAL_TRANSITIONS.approved).toEqual([]);
    expect(APPROVAL_TRANSITIONS.rejected).toEqual([]);
    expect(APPROVAL_DECISIONS).toEqual(['approved', 'rejected']);
  });

  it('archivar/restore por bandera', () => {
    expect(canArchive(false)).toBe(true);
    expect(canArchive(true)).toBe(false);
    expect(canRestore(true)).toBe(true);
    expect(canRestore(false)).toBe(false);
  });
});

describe('workflow rules: clave natural', () => {
  it('normalizeKey: mayúsculas y espacios → guiones; validate 2-64 chars', () => {
    expect(normalizeKey(' big approval ')).toBe('BIG-APPROVAL');
    expect(normalizeKey('caja  chica')).toBe('CAJA-CHICA');
    expect(validateKey('BIG-APPROVAL').valid).toBe(true);
    expect(validateKey('WF.2').valid).toBe(true);
    expect(validateKey('B').valid).toBe(false); // mínimo 2
    expect(validateKey('con espacios').valid).toBe(false);
    expect(validateKey('x'.repeat(KEY_MAX + 1)).valid).toBe(false);
    expect(validateKey('-empieza-guion').valid).toBe(false);
  });
});

describe('workflow rules: evaluación de la condición', () => {
  const numeric = { field: 'total', operator: 'gt', value: 100 } as const;

  it('operadores numéricos: gt/gte/lt/lte matchean y no matchean', () => {
    expect(evaluateCondition(numeric, { total: 101 })).toEqual({ ok: true, matched: true });
    expect(evaluateCondition(numeric, { total: 100 })).toEqual({ ok: true, matched: false });
    expect(evaluateCondition({ ...numeric, operator: 'gte' }, { total: 100 })).toEqual({
      ok: true,
      matched: true,
    });
    expect(evaluateCondition({ ...numeric, operator: 'lt' }, { total: 99 })).toEqual({
      ok: true,
      matched: true,
    });
    expect(evaluateCondition({ ...numeric, operator: 'lte' }, { total: 100 })).toEqual({
      ok: true,
      matched: true,
    });
    expect(evaluateCondition(numeric, { total: -5 })).toEqual({ ok: true, matched: false });
  });

  it('eq/ne comparan por valor en number/string/boolean', () => {
    expect(evaluateCondition({ field: 'n', operator: 'eq', value: 5 }, { n: 5 })).toEqual({
      ok: true,
      matched: true,
    });
    expect(evaluateCondition({ field: 's', operator: 'eq', value: 'alta' }, { s: 'alta' })).toEqual(
      { ok: true, matched: true },
    );
    expect(evaluateCondition({ field: 'b', operator: 'eq', value: true }, { b: true })).toEqual({
      ok: true,
      matched: true,
    });
    expect(evaluateCondition({ field: 'n', operator: 'ne', value: 5 }, { n: 6 })).toEqual({
      ok: true,
      matched: true,
    });
    expect(evaluateCondition({ field: 'n', operator: 'ne', value: 5 }, { n: 5 })).toEqual({
      ok: true,
      matched: false,
    });
  });

  it('contains: subcadena sobre textos', () => {
    const cond = { field: 'status', operator: 'contains', value: 'pend' } as const;
    expect(evaluateCondition(cond, { status: 'pendiente' })).toEqual({
      ok: true,
      matched: true,
    });
    expect(evaluateCondition(cond, { status: 'aprobado' })).toEqual({
      ok: true,
      matched: false,
    });
  });

  it('campo ausente en el contexto → missing (nunca asume false)', () => {
    const outcome = evaluateCondition(numeric, { otro: 500 });
    expect(outcome).toEqual({ ok: false, reason: 'missing', field: 'total' });
    // La ausencia se detecta aunque el campo venga del prototipo (hasOwn).
    expect(evaluateCondition({ ...numeric, field: 'constructor' }, {})).toEqual({
      ok: false,
      reason: 'missing',
      field: 'constructor',
    });
  });

  it('tipo real incompatible con el operador → mismatch', () => {
    expect(evaluateCondition(numeric, { total: 'grande' })).toEqual({
      ok: false,
      reason: 'mismatch',
      field: 'total',
    });
    expect(evaluateCondition({ field: 's', operator: 'contains', value: 'x' }, { s: 42 })).toEqual({
      ok: false,
      reason: 'mismatch',
      field: 's',
    });
    expect(evaluateCondition({ field: 'n', operator: 'eq', value: 5 }, { n: '5' })).toEqual({
      ok: false,
      reason: 'mismatch',
      field: 'n',
    });
  });

  it('el catálogo de operadores y disparadores es el esperado', () => {
    expect(CONDITION_OPERATORS).toEqual(['gt', 'gte', 'lt', 'lte', 'eq', 'ne', 'contains']);
    expect(WORKFLOW_TRIGGERS).toContain('WorkflowCompleted');
    expect(WORKFLOW_TRIGGERS).toContain('SalesOrderCreated');
    expect(WORKFLOW_TRIGGERS).toHaveLength(7);
  });
});

describe('workflow rules: representaciones públicas', () => {
  it('toPublic* de workflow, instancia y aprobación nunca exponen tenantId', () => {
    const publics = [
      toPublicWorkflow(workflow),
      toPublicWorkflowInstance(instance),
      toPublicApproval(approval),
    ];
    for (const item of publics) {
      const raw = JSON.stringify(item);
      expect(raw).not.toContain('tenantId');
      expect(raw).not.toContain(SECRET_TENANT);
    }
  });

  it('toPublicWorkflowInstance conserva el snapshot del contexto', () => {
    const pub = toPublicWorkflowInstance(instance);
    expect(pub.context).toEqual({ total: 75_000 });
    expect(pub.state).toBe('awaiting_approval');
    // El contexto viaja como `Readonly` (inmutable en compilación), mismo
    // patrón que `toPublicWorkflow` con `trigger`.
    expect(pub).not.toHaveProperty('tenantId');
  });

  it('toPublicApproval expone la decisión (o pendiente) sin tenantId', () => {
    const pending = toPublicApproval(approval);
    expect(pending.status).toBe('pending');
    expect(pending.decidedBy).toBeNull();
    expect(pending.decidedAt).toBeNull();

    const decided = toPublicApproval({
      ...approval,
      status: 'approved',
      decidedBy: 'user-1',
      decidedAt: NOW,
      comment: 'ok',
    });
    expect(decided.status).toBe('approved');
    expect(decided.decidedBy).toBe('user-1');
    expect(decided.comment).toBe('ok');
    expect(JSON.stringify(decided)).not.toContain(SECRET_TENANT);
  });
});
