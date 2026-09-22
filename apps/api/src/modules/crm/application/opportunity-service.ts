import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import {
  toPublicOpportunity,
  type OpportunityStage,
  type PublicOpportunity,
} from '../domain/entities/opportunity.js';
import {
  canArchive,
  canRestore,
  canTransitionOpportunity,
  normalizeCurrency,
  validateName,
} from '../domain/rules/crm-rules.js';
import { customerRepo, opportunityRepo } from '../infrastructure/repositories/crm-repository.js';
import type { CrmPage } from './customer-service.js';

/**
 * Casos de uso de Oportunidad. `stage` es una máquina de estados VALIDADA
 * (crm-rules): saltos y terminales (`won`/`lost`) → 409; `lost` exige
 * `lostReason` (400 si falta). FK `customerId` del mismo tenant (404 uniforme).
 */

export interface CreateOpportunityInput {
  readonly name: string;
  readonly customerId: string;
  readonly stage?: OpportunityStage | undefined;
  readonly amount?: number | undefined;
  readonly currency?: string | undefined;
  readonly expectedCloseDate?: Date | undefined;
}

export interface PatchOpportunityInput {
  readonly name?: string | undefined;
  readonly customerId?: string | undefined;
  readonly stage?: OpportunityStage | undefined;
  readonly amount?: number | undefined;
  readonly currency?: string | undefined;
  readonly lostReason?: string | undefined;
  readonly expectedCloseDate?: Date | null | undefined;
  readonly archived?: boolean | undefined;
}

export interface OpportunityListQuery {
  readonly page: number;
  readonly limit: number;
  readonly archived?: boolean | undefined;
  readonly stage?: OpportunityStage | undefined;
}

function assertName(name: string): string {
  const check = validateName(name);
  if (!check.valid) {
    throw new ValidationError('Invalid name', { issues: check.issues });
  }
  return check.value;
}

function assertCurrency(currency: string): string {
  const normalized = normalizeCurrency(currency);
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new ValidationError('Invalid currency', { currency });
  }
  return normalized;
}

async function assertCustomerExists(tenantId: string, customerId: string): Promise<void> {
  const customer = await customerRepo.findById(tenantId, customerId);
  if (customer === null) {
    throw new NotFoundError();
  }
}

export async function createOpportunity(
  tenantId: string,
  input: CreateOpportunityInput,
): Promise<PublicOpportunity> {
  await assertCustomerExists(tenantId, input.customerId);
  const payload: Record<string, unknown> = {
    name: assertName(input.name),
    customerId: input.customerId,
    stage: input.stage ?? 'prospecting',
    amount: input.amount ?? 0,
    currency: input.currency === undefined ? 'USD' : assertCurrency(input.currency),
    expectedCloseDate: input.expectedCloseDate ?? null,
  };
  const opportunity = await opportunityRepo.create(tenantId, payload);
  return toPublicOpportunity(opportunity);
}

export async function listOpportunities(
  tenantId: string,
  query: OpportunityListQuery,
): Promise<CrmPage<PublicOpportunity>> {
  const filter = {
    ...(query.archived !== undefined ? { archived: query.archived } : {}),
    ...(query.stage !== undefined ? { stage: query.stage } : {}),
  };
  const page = await opportunityRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicOpportunity), total: page.total };
}

export async function getOpportunity(tenantId: string, id: string): Promise<PublicOpportunity> {
  const opportunity = await opportunityRepo.findById(tenantId, id);
  if (opportunity === null) {
    throw new NotFoundError();
  }
  return toPublicOpportunity(opportunity);
}

export async function updateOpportunity(
  tenantId: string,
  id: string,
  input: PatchOpportunityInput,
): Promise<PublicOpportunity> {
  const current = await opportunityRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) {
    set.name = assertName(input.name);
  }
  if (input.customerId !== undefined) {
    await assertCustomerExists(tenantId, input.customerId);
    set.customerId = input.customerId;
  }
  if (input.amount !== undefined) {
    set.amount = input.amount;
  }
  if (input.currency !== undefined) {
    set.currency = assertCurrency(input.currency);
  }
  if (input.expectedCloseDate !== undefined) {
    set.expectedCloseDate = input.expectedCloseDate;
  }

  // `lostReason` SOLO junto a `stage: lost`; `lost` exige razón.
  if (input.lostReason !== undefined && input.stage !== 'lost') {
    throw new ValidationError('lostReason is only allowed when stage is lost');
  }
  if (input.stage !== undefined) {
    if (input.stage === current.stage) {
      throw new ConflictError('Stage is already the requested one');
    }
    if (!canTransitionOpportunity(current.stage, input.stage)) {
      throw new ConflictError('Invalid stage transition');
    }
    if (input.stage === 'lost') {
      if (input.lostReason === undefined) {
        throw new ValidationError('lostReason is required when stage is lost');
      }
      set.lostReason = input.lostReason.trim();
    }
    set.stage = input.stage;
  }

  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Opportunity is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Opportunity is not archived');
    }
    set.archived = input.archived;
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await opportunityRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicOpportunity(updated);
}

/** DELETE = soft-delete: marca `archived` (doble archive → 409). */
export async function archiveOpportunity(tenantId: string, id: string): Promise<PublicOpportunity> {
  const current = await opportunityRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Opportunity is already archived');
  }
  const archived = await opportunityRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicOpportunity(archived);
}
