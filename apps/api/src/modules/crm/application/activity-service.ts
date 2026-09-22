import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import { findUserInTenant } from '../../identity/index.js';
import {
  toPublicActivity,
  type ActivityType,
  type PublicActivity,
} from '../domain/entities/activity.js';
import { canArchive, canRestore, validateSubject } from '../domain/rules/crm-rules.js';
import {
  activityRepo,
  customerRepo,
  leadRepo,
  opportunityRepo,
} from '../infrastructure/repositories/crm-repository.js';
import type { CrmPage } from './customer-service.js';

/**
 * Casos de uso de Actividad (timeline). Debe referenciar AL MENOS UNO de
 * customer/lead/opportunity (todos del tenant → 404 uniforme si no existen).
 * `completed: true` fija `completedAt` en el servidor (nunca lo elige el cliente).
 */

export interface CreateActivityInput {
  readonly type: ActivityType;
  readonly subject: string;
  readonly notes?: string | undefined;
  readonly dueAt?: Date | undefined;
  readonly completed?: boolean | undefined;
  readonly customerId?: string | undefined;
  readonly leadId?: string | undefined;
  readonly opportunityId?: string | undefined;
  readonly assignedTo?: string | undefined;
}

export interface PatchActivityInput {
  readonly type?: ActivityType | undefined;
  readonly subject?: string | undefined;
  readonly notes?: string | null | undefined;
  readonly dueAt?: Date | null | undefined;
  readonly completed?: boolean | undefined;
  readonly customerId?: string | null | undefined;
  readonly leadId?: string | null | undefined;
  readonly opportunityId?: string | null | undefined;
  readonly assignedTo?: string | null | undefined;
  readonly archived?: boolean | undefined;
}

export interface ActivityListQuery {
  readonly page: number;
  readonly limit: number;
  readonly archived?: boolean | undefined;
  readonly customerId?: string | undefined;
  readonly leadId?: string | undefined;
  readonly opportunityId?: string | undefined;
}

const NO_LINK_MESSAGE = 'Activity must reference at least one of customerId, leadId, opportunityId';

function assertSubject(subject: string): string {
  const check = validateSubject(subject);
  if (!check.valid) {
    throw new ValidationError('Invalid subject', { issues: check.issues });
  }
  return check.value;
}

async function assertAssignable(tenantId: string, userId: string): Promise<void> {
  const user = await findUserInTenant(tenantId, userId);
  if (user === null) {
    throw new ValidationError('Unknown user', { user: userId });
  }
}

async function assertLinkExists(
  repo: { findById(tenantId: string, id: string): Promise<unknown> },
  tenantId: string,
  id: string,
): Promise<void> {
  const found = await repo.findById(tenantId, id);
  if (found === null) {
    throw new NotFoundError();
  }
}

export async function createActivity(
  tenantId: string,
  input: CreateActivityInput,
): Promise<PublicActivity> {
  const hasLink =
    input.customerId !== undefined ||
    input.leadId !== undefined ||
    input.opportunityId !== undefined;
  if (!hasLink) {
    throw new ValidationError(NO_LINK_MESSAGE);
  }
  if (input.customerId !== undefined) {
    await assertLinkExists(customerRepo, tenantId, input.customerId);
  }
  if (input.leadId !== undefined) {
    await assertLinkExists(leadRepo, tenantId, input.leadId);
  }
  if (input.opportunityId !== undefined) {
    await assertLinkExists(opportunityRepo, tenantId, input.opportunityId);
  }
  if (input.assignedTo !== undefined) {
    await assertAssignable(tenantId, input.assignedTo);
  }
  const completed = input.completed ?? false;
  const payload: Record<string, unknown> = {
    type: input.type,
    subject: assertSubject(input.subject),
    completed,
    completedAt: completed ? new Date() : null,
    dueAt: input.dueAt ?? null,
  };
  if (input.notes !== undefined) {
    payload.notes = input.notes.trim() || null;
  }
  if (input.customerId !== undefined) {
    payload.customerId = input.customerId;
  }
  if (input.leadId !== undefined) {
    payload.leadId = input.leadId;
  }
  if (input.opportunityId !== undefined) {
    payload.opportunityId = input.opportunityId;
  }
  if (input.assignedTo !== undefined) {
    payload.assignedTo = input.assignedTo;
  }
  const activity = await activityRepo.create(tenantId, payload);
  return toPublicActivity(activity);
}

export async function listActivities(
  tenantId: string,
  query: ActivityListQuery,
): Promise<CrmPage<PublicActivity>> {
  const filter = {
    ...(query.archived !== undefined ? { archived: query.archived } : {}),
    ...(query.customerId !== undefined ? { customerId: query.customerId } : {}),
    ...(query.leadId !== undefined ? { leadId: query.leadId } : {}),
    ...(query.opportunityId !== undefined ? { opportunityId: query.opportunityId } : {}),
  };
  const page = await activityRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicActivity), total: page.total };
}

export async function getActivity(tenantId: string, id: string): Promise<PublicActivity> {
  const activity = await activityRepo.findById(tenantId, id);
  if (activity === null) {
    throw new NotFoundError();
  }
  return toPublicActivity(activity);
}

export async function updateActivity(
  tenantId: string,
  id: string,
  input: PatchActivityInput,
): Promise<PublicActivity> {
  const current = await activityRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  const set: Record<string, unknown> = {};
  if (input.type !== undefined) {
    set.type = input.type;
  }
  if (input.subject !== undefined) {
    set.subject = assertSubject(input.subject);
  }
  if (input.notes !== undefined) {
    set.notes = input.notes === null ? null : input.notes.trim() || null;
  }
  if (input.dueAt !== undefined) {
    set.dueAt = input.dueAt;
  }
  if (input.assignedTo !== undefined) {
    if (input.assignedTo === null) {
      set.assignedTo = null;
    } else {
      await assertAssignable(tenantId, input.assignedTo);
      set.assignedTo = input.assignedTo;
    }
  }

  // Enlaces: el resultado final debe conservar AL MENOS UNO.
  let customerId = current.customerId;
  let leadId = current.leadId;
  let opportunityId = current.opportunityId;
  if (input.customerId !== undefined) {
    if (input.customerId !== null) {
      await assertLinkExists(customerRepo, tenantId, input.customerId);
    }
    customerId = input.customerId;
    set.customerId = input.customerId;
  }
  if (input.leadId !== undefined) {
    if (input.leadId !== null) {
      await assertLinkExists(leadRepo, tenantId, input.leadId);
    }
    leadId = input.leadId;
    set.leadId = input.leadId;
  }
  if (input.opportunityId !== undefined) {
    if (input.opportunityId !== null) {
      await assertLinkExists(opportunityRepo, tenantId, input.opportunityId);
    }
    opportunityId = input.opportunityId;
    set.opportunityId = input.opportunityId;
  }
  if (customerId === null && leadId === null && opportunityId === null) {
    throw new ValidationError(NO_LINK_MESSAGE);
  }

  // `completedAt` lo fija SIEMPRE el servidor.
  if (input.completed !== undefined) {
    set.completed = input.completed;
    set.completedAt = input.completed ? new Date() : null;
  }

  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Activity is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Activity is not archived');
    }
    set.archived = input.archived;
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await activityRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicActivity(updated);
}

/** DELETE = soft-delete: marca `archived` (doble archive → 409). */
export async function archiveActivity(tenantId: string, id: string): Promise<PublicActivity> {
  const current = await activityRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Activity is already archived');
  }
  const archived = await activityRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicActivity(archived);
}
