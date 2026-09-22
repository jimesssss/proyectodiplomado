import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import { findUserInTenant } from '../../identity/index.js';
import {
  toPublicLead,
  type LeadSource,
  type LeadStatus,
  type PublicLead,
} from '../domain/entities/lead.js';
import {
  canArchive,
  canRestore,
  canTransitionLead,
  isValidEmail,
  normalizeEmail,
  validateName,
} from '../domain/rules/crm-rules.js';
import { customerRepo, leadRepo } from '../infrastructure/repositories/crm-repository.js';
import type { CrmPage } from './customer-service.js';

/**
 * Casos de uso de Lead. `status` es una máquina de estados VALIDADA
 * (crm-rules): saltos y estados terminales → 409. Convertir exige cliente
 * asociado DEL MISMO TENANT. `assignedTo` debe ser un usuario del tenant.
 */

export interface CreateLeadInput {
  readonly name: string;
  readonly source: LeadSource;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly notes?: string | undefined;
  readonly customerId?: string | undefined;
  readonly assignedTo?: string | undefined;
}

export interface PatchLeadInput {
  readonly name?: string | undefined;
  readonly source?: LeadSource | undefined;
  readonly email?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly notes?: string | null | undefined;
  readonly customerId?: string | null | undefined;
  readonly assignedTo?: string | null | undefined;
  readonly status?: LeadStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface LeadListQuery {
  readonly page: number;
  readonly limit: number;
  readonly archived?: boolean | undefined;
  readonly status?: LeadStatus | undefined;
}

function assertName(name: string): string {
  const check = validateName(name);
  if (!check.valid) {
    throw new ValidationError('Invalid name', { issues: check.issues });
  }
  return check.value;
}

function assertEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    throw new ValidationError('Invalid email');
  }
  return normalized;
}

/** `assignedTo` debe existir en el tenant (desconocido → 400, como roles). */
async function assertAssignable(tenantId: string, userId: string): Promise<void> {
  const user = await findUserInTenant(tenantId, userId);
  if (user === null) {
    throw new ValidationError('Unknown user', { user: userId });
  }
}

async function assertCustomerExists(tenantId: string, customerId: string): Promise<void> {
  const customer = await customerRepo.findById(tenantId, customerId);
  if (customer === null) {
    throw new NotFoundError();
  }
}

export async function createLead(tenantId: string, input: CreateLeadInput): Promise<PublicLead> {
  if (input.assignedTo !== undefined) {
    await assertAssignable(tenantId, input.assignedTo);
  }
  if (input.customerId !== undefined) {
    await assertCustomerExists(tenantId, input.customerId);
  }
  const payload: Record<string, unknown> = {
    name: assertName(input.name),
    source: input.source,
    status: 'new',
  };
  if (input.email !== undefined) {
    payload.email = assertEmail(input.email);
  }
  if (input.phone !== undefined) {
    payload.phone = input.phone.trim();
  }
  if (input.notes !== undefined) {
    payload.notes = input.notes.trim();
  }
  if (input.customerId !== undefined) {
    payload.customerId = input.customerId;
  }
  if (input.assignedTo !== undefined) {
    payload.assignedTo = input.assignedTo;
  }
  const lead = await leadRepo.create(tenantId, payload);
  return toPublicLead(lead);
}

export async function listLeads(
  tenantId: string,
  query: LeadListQuery,
): Promise<CrmPage<PublicLead>> {
  const filter = {
    ...(query.archived !== undefined ? { archived: query.archived } : {}),
    ...(query.status !== undefined ? { status: query.status } : {}),
  };
  const page = await leadRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicLead), total: page.total };
}

export async function getLead(tenantId: string, id: string): Promise<PublicLead> {
  const lead = await leadRepo.findById(tenantId, id);
  if (lead === null) {
    throw new NotFoundError();
  }
  return toPublicLead(lead);
}

export async function updateLead(
  tenantId: string,
  id: string,
  input: PatchLeadInput,
): Promise<PublicLead> {
  const current = await leadRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) {
    set.name = assertName(input.name);
  }
  if (input.source !== undefined) {
    set.source = input.source;
  }
  if (input.email !== undefined) {
    set.email = input.email === null ? null : assertEmail(input.email);
  }
  if (input.phone !== undefined) {
    set.phone = input.phone === null ? null : input.phone.trim();
  }
  if (input.notes !== undefined) {
    set.notes = input.notes === null ? null : input.notes.trim();
  }
  if (input.assignedTo !== undefined) {
    if (input.assignedTo === null) {
      set.assignedTo = null;
    } else {
      await assertAssignable(tenantId, input.assignedTo);
      set.assignedTo = input.assignedTo;
    }
  }

  // FK al cliente: null solo si no está convertido (siempre del mismo tenant).
  if (input.customerId !== undefined) {
    if (input.customerId === null) {
      if (current.status === 'converted' || input.status === 'converted') {
        throw new ConflictError('Cannot unlink the customer of a converted lead');
      }
      set.customerId = null;
    } else {
      await assertCustomerExists(tenantId, input.customerId);
      set.customerId = input.customerId;
    }
  }

  // Transiciones de estado: mismo estado → 409; salto inválido → 409;
  // convertir exige cliente (del patch o el ya asociado).
  if (input.status !== undefined) {
    if (input.status === current.status) {
      throw new ConflictError('Status is already the requested one');
    }
    if (!canTransitionLead(current.status, input.status)) {
      throw new ConflictError('Invalid status transition');
    }
    if (input.status === 'converted') {
      const resolved = 'customerId' in set ? (set.customerId as string | null) : current.customerId;
      if (resolved === null) {
        throw new ValidationError('customerId is required to convert a lead');
      }
    }
    set.status = input.status;
  }

  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Lead is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Lead is not archived');
    }
    set.archived = input.archived;
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await leadRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicLead(updated);
}

/** DELETE = soft-delete: marca `archived` (doble archive → 409). */
export async function archiveLead(tenantId: string, id: string): Promise<PublicLead> {
  const current = await leadRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Lead is already archived');
  }
  const archived = await leadRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicLead(archived);
}
