/**
 * Dominio CRM — Lead (prospecto sin cerrar).
 * Ciclo de vida en `status` con transiciones VALIDADAS (ver crm-rules);
 * `archived` es independiente (soft-delete del registro).
 */

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = ['web', 'referral', 'event', 'outbound', 'partner', 'other'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface Lead {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly source: LeadSource;
  readonly email: string | null;
  readonly phone: string | null;
  readonly notes: string | null;
  readonly status: LeadStatus;
  /** Cliente asociado (obligatorio al convertir; opcional antes). */
  readonly customerId: string | null;
  /** Usuario del MISMO tenant asignado (validado en servicio). */
  readonly assignedTo: string | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicLead {
  readonly id: string;
  readonly name: string;
  readonly source: LeadSource;
  readonly email: string | null;
  readonly phone: string | null;
  readonly notes: string | null;
  readonly status: LeadStatus;
  readonly customerId: string | null;
  readonly assignedTo: string | null;
  readonly archived: boolean;
}

export function toPublicLead(lead: Lead): PublicLead {
  return {
    id: lead.id,
    name: lead.name,
    source: lead.source,
    email: lead.email,
    phone: lead.phone,
    notes: lead.notes,
    status: lead.status,
    customerId: lead.customerId,
    assignedTo: lead.assignedTo,
    archived: lead.archived,
  };
}
