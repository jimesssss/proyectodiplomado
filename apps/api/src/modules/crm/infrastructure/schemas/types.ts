import type { Types } from 'mongoose';
import type { ActivityType } from '../../domain/entities/activity.js';
import type { CustomerAddress, CustomerType } from '../../domain/entities/customer.js';
import type { LeadSource, LeadStatus } from '../../domain/entities/lead.js';
import type { OpportunityStage } from '../../domain/entities/opportunity.js';

/**
 * Tipos de documento CRM (FASE 8).
 * Se usa `Types.ObjectId` (nunca el `ObjectId` de nivel superior: rompe los
 * filtros de mongoose 9 — ver FASE 3). TODOS llevan `tenantId` + `archived`
 * (soft-delete) — ADR-002/ADR-003.
 */
export interface CrmDocBase {
  _id: Types.ObjectId;
  tenantId: string;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** `null` = campo limpiado explícitamente vía PATCH; `undefined` = nunca escrito. */
export interface CustomerDoc extends CrmDocBase {
  code: string;
  name: string;
  type: CustomerType;
  email?: string | null;
  phone?: string | null;
  taxId?: string | null;
  address?: CustomerAddress | null;
}

export interface ContactDoc extends CrmDocBase {
  customerId: Types.ObjectId;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  isPrimary: boolean;
}

export interface LeadDoc extends CrmDocBase {
  name: string;
  source: LeadSource;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  status: LeadStatus;
  customerId?: Types.ObjectId | null;
  assignedTo?: string | null;
}

export interface OpportunityDoc extends CrmDocBase {
  name: string;
  customerId: Types.ObjectId;
  stage: OpportunityStage;
  amount: number;
  currency: string;
  expectedCloseDate?: Date | null;
  lostReason?: string | null;
}

export interface ActivityDoc extends CrmDocBase {
  type: ActivityType;
  subject: string;
  notes?: string | null;
  dueAt?: Date | null;
  completed: boolean;
  completedAt?: Date | null;
  customerId?: Types.ObjectId | null;
  leadId?: Types.ObjectId | null;
  opportunityId?: Types.ObjectId | null;
  assignedTo?: string | null;
}
