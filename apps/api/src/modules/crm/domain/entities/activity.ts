/**
 * Dominio CRM — Actividad (timeline: llamadas, emails, reuniones, tareas,
 * notas). Debe referenciar AL MENOS UNO de: customer, lead u opportunity
 * (todos del mismo tenant, 404 uniforme).
 */

export const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'task', 'note'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface Activity {
  readonly id: string;
  readonly tenantId: string;
  readonly type: ActivityType;
  readonly subject: string;
  readonly notes: string | null;
  readonly dueAt: Date | null;
  readonly completed: boolean;
  readonly completedAt: Date | null;
  readonly customerId: string | null;
  readonly leadId: string | null;
  readonly opportunityId: string | null;
  /** Usuario del MISMO tenant asignado (validado en servicio). */
  readonly assignedTo: string | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicActivity {
  readonly id: string;
  readonly type: ActivityType;
  readonly subject: string;
  readonly notes: string | null;
  readonly dueAt: Date | null;
  readonly completed: boolean;
  readonly completedAt: Date | null;
  readonly customerId: string | null;
  readonly leadId: string | null;
  readonly opportunityId: string | null;
  readonly assignedTo: string | null;
  readonly archived: boolean;
}

export function toPublicActivity(activity: Activity): PublicActivity {
  return {
    id: activity.id,
    type: activity.type,
    subject: activity.subject,
    notes: activity.notes,
    dueAt: activity.dueAt,
    completed: activity.completed,
    completedAt: activity.completedAt,
    customerId: activity.customerId,
    leadId: activity.leadId,
    opportunityId: activity.opportunityId,
    assignedTo: activity.assignedTo,
    archived: activity.archived,
  };
}
