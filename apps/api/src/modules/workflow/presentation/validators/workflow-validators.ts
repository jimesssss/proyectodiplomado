import { z } from 'zod';
import { APPROVAL_STATUSES } from '../../domain/entities/approval.js';
import { INSTANCE_STATES } from '../../domain/entities/workflow-instance.js';
import {
  CONDITION_OPERATORS,
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_TRIGGERS,
} from '../../domain/entities/workflow.js';
import {
  APPROVAL_DECISIONS,
  APPROVER_ROLE_MAX,
  COMMENT_MAX,
  CONTEXT_VALUE_MAX,
  DESCRIPTION_MAX,
  ENTITY_TYPE_MAX,
  KEY_MAX,
  NAME_MAX,
} from '../../domain/rules/workflow-rules.js';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdPattern, 'Invalid id');

/**
 * Esquemas estrictos: cualquier campo desconocido (incluido `tenantId`,
 * `archived`/`state` en create, `key`/`trigger`/`condition`/`action` en PATCH
 * — inmutables — o `status`/`instanceId`/`decidedBy` en la decisión — todos
 * SOLO-los-escribe-el-servidor o del motor) se RECHAZA con 400 (ADR-002).
 */

const pageField = z.coerce.number().int().min(1).max(10_000).default(1);
const limitField = z.coerce.number().int().min(1).max(100).default(20);
const archivedField = z.enum(['true', 'false']).transform((value) => value === 'true');
const entityTypeField = z.string().min(1).max(ENTITY_TYPE_MAX);
const scalarValue = z.union([z.number(), z.string().min(1).max(CONTEXT_VALUE_MAX), z.boolean()]);

// --- Definiciones de workflow ---

export const createWorkflowBodySchema = z
  .strictObject({
    key: z.string().min(2).max(KEY_MAX),
    name: z.string().min(1).max(NAME_MAX),
    description: z.string().max(DESCRIPTION_MAX).optional(),
    trigger: z.strictObject({
      event: z.enum(WORKFLOW_TRIGGERS),
      entityType: entityTypeField,
    }),
    condition: z.strictObject({
      field: z.string().regex(/^[A-Za-z][A-Za-z0-9._]{0,63}$/, 'Invalid field name'),
      operator: z.enum(CONDITION_OPERATORS),
      value: scalarValue,
    }),
    action: z.strictObject({
      type: z.enum(WORKFLOW_ACTION_TYPES),
      approverRole: z.string().min(1).max(APPROVER_ROLE_MAX),
    }),
  })
  .superRefine((body, ctx) => {
    // Tipo del `value` vs operador: rechazado en la FUENTE (400), no en runtime.
    const { operator, value } = body.condition;
    const needsNumber =
      operator === 'gt' || operator === 'gte' || operator === 'lt' || operator === 'lte';
    if (needsNumber && typeof value !== 'number') {
      ctx.addIssue({
        code: 'custom',
        path: ['condition', 'value'],
        message: `operator "${operator}" requires a numeric value`,
      });
    }
    if (operator === 'contains' && typeof value !== 'string') {
      ctx.addIssue({
        code: 'custom',
        path: ['condition', 'value'],
        message: 'operator "contains" requires a string value',
      });
    }
  });

/** `key`/`trigger`/`condition`/`action` inmutables (→ 400). */
export const patchWorkflowBodySchema = z.strictObject({
  name: z.string().min(1).max(NAME_MAX).optional(),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  archived: z.boolean().optional(),
});

export const workflowListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
});

// --- Ejecución del motor (run) ---

/** `state`/`workflowId`/`tenantId` server-only → 400; `entityId` OPACO (sin FK). */
export const runWorkflowBodySchema = z.strictObject({
  entityType: entityTypeField,
  entityId: objectId,
  context: z.record(z.string(), scalarValue).optional(),
});

export const instanceListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  state: z.enum(INSTANCE_STATES).optional(),
});

// --- Aprobaciones (cola + decisión) ---

export const approvalListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  status: z.enum(APPROVAL_STATUSES).optional(),
  workflowId: objectId.optional(),
  entityType: entityTypeField.optional(),
  entityId: objectId.optional(),
});

/** `status`/`instanceId`/`decidedBy` server-only → 400 (solo `decision`). */
export const decisionBodySchema = z.strictObject({
  decision: z.enum(APPROVAL_DECISIONS),
  comment: z.string().max(COMMENT_MAX).optional(),
});
