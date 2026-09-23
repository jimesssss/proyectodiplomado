/**
 * Solicitud de aprobación (FASE 14): cola de trabajo creada por el motor
 * cuando una instancia matchea su condición. Máquina: `pending →
 * approved|rejected` (terminales) vía `POST …/decision` con `approval:approve`.
 * NO hay creación pública (solo el motor la crea) ni PATCH/DELETE → 404;
 * `approverRole` es un snapshot de la definición al ejecutar (ediciones
 * posteriores no reescriben solicitudes pendientes).
 */

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface Approval {
  readonly id: string;
  readonly tenantId: string;
  readonly instanceId: string;
  readonly workflowId: string;
  readonly entityType: string;
  readonly entityId: string;
  /** Snapshot de `action.approverRole` al momento del `run`. */
  readonly approverRole: string;
  readonly status: ApprovalStatus;
  /** Usuario que decidió (JWT `sub`); null mientras está `pending`. */
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
  readonly comment: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`). */
export interface PublicApproval {
  readonly id: string;
  readonly instanceId: string;
  readonly workflowId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly approverRole: string;
  readonly status: ApprovalStatus;
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
  readonly comment: string | null;
}

export function toPublicApproval(approval: Approval): PublicApproval {
  return {
    id: approval.id,
    instanceId: approval.instanceId,
    workflowId: approval.workflowId,
    entityType: approval.entityType,
    entityId: approval.entityId,
    approverRole: approval.approverRole,
    status: approval.status,
    decidedBy: approval.decidedBy,
    decidedAt: approval.decidedAt,
    comment: approval.comment,
  };
}
