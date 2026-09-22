/**
 * Dominio CRM — Oportunidad de venta.
 * `stage` con transiciones VALIDADAS (ver crm-rules); `won`/`lost` son
 * terminales. `lost` exige `lostReason`. FK `customerId` del mismo tenant.
 */

export const OPPORTUNITY_STAGES = [
  'prospecting',
  'qualification',
  'proposal',
  'negotiation',
  'won',
  'lost',
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

/** Etapas permitidas al CREAR (ganada/perdida solo por transición). */
export const OPEN_STAGES = ['prospecting', 'qualification', 'proposal', 'negotiation'] as const;

export interface Opportunity {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly customerId: string;
  readonly stage: OpportunityStage;
  readonly amount: number;
  /** ISO-4217 en mayúsculas (p. ej. `USD`). */
  readonly currency: string;
  readonly expectedCloseDate: Date | null;
  readonly lostReason: string | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicOpportunity {
  readonly id: string;
  readonly name: string;
  readonly customerId: string;
  readonly stage: OpportunityStage;
  readonly amount: number;
  readonly currency: string;
  readonly expectedCloseDate: Date | null;
  readonly lostReason: string | null;
  readonly archived: boolean;
}

export function toPublicOpportunity(opportunity: Opportunity): PublicOpportunity {
  return {
    id: opportunity.id,
    name: opportunity.name,
    customerId: opportunity.customerId,
    stage: opportunity.stage,
    amount: opportunity.amount,
    currency: opportunity.currency,
    expectedCloseDate: opportunity.expectedCloseDate,
    lostReason: opportunity.lostReason,
    archived: opportunity.archived,
  };
}
