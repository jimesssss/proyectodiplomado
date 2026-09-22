import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import { toPublicContact, type PublicContact } from '../domain/entities/contact.js';
import {
  canArchive,
  canRestore,
  isValidEmail,
  normalizeEmail,
  validateName,
} from '../domain/rules/crm-rules.js';
import {
  contactRepo,
  customerRepo,
  demoteOtherPrimaries,
} from '../infrastructure/repositories/crm-repository.js';
import type { CrmPage } from './customer-service.js';

/**
 * Casos de uso de Contacto. FK `customerId` DEL MISMO TENANT (inexistente o
 * ajeno → 404 uniforme, sin revelar existencia). Regla: un solo principal
 * por cliente (al marcar uno, se degradan los demás).
 */

export interface CreateContactInput {
  readonly customerId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly jobTitle?: string | undefined;
  readonly isPrimary?: boolean | undefined;
}

export interface PatchContactInput {
  readonly firstName?: string | undefined;
  readonly lastName?: string | undefined;
  readonly email?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly jobTitle?: string | null | undefined;
  readonly isPrimary?: boolean | undefined;
  readonly archived?: boolean | undefined;
}

export interface ContactListQuery {
  readonly page: number;
  readonly limit: number;
  readonly archived?: boolean | undefined;
  readonly customerId?: string | undefined;
}

function assertPersonName(value: string, field: string): string {
  const check = validateName(value);
  if (!check.valid) {
    throw new ValidationError(`Invalid ${field}`, { issues: check.issues });
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

async function assertCustomerExists(tenantId: string, customerId: string): Promise<void> {
  const customer = await customerRepo.findById(tenantId, customerId);
  if (customer === null) {
    throw new NotFoundError();
  }
}

export async function createContact(
  tenantId: string,
  input: CreateContactInput,
): Promise<PublicContact> {
  await assertCustomerExists(tenantId, input.customerId);
  const isPrimary = input.isPrimary ?? false;
  if (isPrimary) {
    await demoteOtherPrimaries(tenantId, input.customerId, null);
  }
  const payload: Record<string, unknown> = {
    customerId: input.customerId,
    firstName: assertPersonName(input.firstName, 'firstName'),
    lastName: assertPersonName(input.lastName, 'lastName'),
    isPrimary,
  };
  if (input.email !== undefined) {
    payload.email = assertEmail(input.email);
  }
  if (input.phone !== undefined) {
    payload.phone = input.phone.trim();
  }
  if (input.jobTitle !== undefined) {
    payload.jobTitle = input.jobTitle.trim();
  }
  const contact = await contactRepo.create(tenantId, payload);
  return toPublicContact(contact);
}

export async function listContacts(
  tenantId: string,
  query: ContactListQuery,
): Promise<CrmPage<PublicContact>> {
  const filter = {
    ...(query.archived !== undefined ? { archived: query.archived } : {}),
    ...(query.customerId !== undefined ? { customerId: query.customerId } : {}),
  };
  const page = await contactRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicContact), total: page.total };
}

export async function getContact(tenantId: string, id: string): Promise<PublicContact> {
  const contact = await contactRepo.findById(tenantId, id);
  if (contact === null) {
    throw new NotFoundError();
  }
  return toPublicContact(contact);
}

export async function updateContact(
  tenantId: string,
  id: string,
  input: PatchContactInput,
): Promise<PublicContact> {
  const current = await contactRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  const set: Record<string, unknown> = {};
  if (input.firstName !== undefined) {
    set.firstName = assertPersonName(input.firstName, 'firstName');
  }
  if (input.lastName !== undefined) {
    set.lastName = assertPersonName(input.lastName, 'lastName');
  }
  if (input.email !== undefined) {
    set.email = input.email === null ? null : assertEmail(input.email);
  }
  if (input.phone !== undefined) {
    set.phone = input.phone === null ? null : input.phone.trim();
  }
  if (input.jobTitle !== undefined) {
    set.jobTitle = input.jobTitle === null ? null : input.jobTitle.trim();
  }
  if (input.isPrimary !== undefined) {
    set.isPrimary = input.isPrimary;
    if (input.isPrimary) {
      await demoteOtherPrimaries(tenantId, current.customerId, id);
    }
  }
  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Contact is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Contact is not archived');
    }
    set.archived = input.archived;
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await contactRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicContact(updated);
}

/** DELETE = soft-delete: marca `archived` (doble archive → 409). */
export async function archiveContact(tenantId: string, id: string): Promise<PublicContact> {
  const current = await contactRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Contact is already archived');
  }
  const archived = await contactRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicContact(archived);
}
