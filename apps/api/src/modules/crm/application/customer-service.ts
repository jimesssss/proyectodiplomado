import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import {
  toPublicCustomer,
  type CustomerAddress,
  type CustomerType,
  type PublicCustomer,
} from '../domain/entities/customer.js';
import {
  canArchive,
  canRestore,
  isValidEmail,
  normalizeCode,
  normalizeEmail,
  validateCode,
  validateName,
} from '../domain/rules/crm-rules.js';
import { customerRepo } from '../infrastructure/repositories/crm-repository.js';

/**
 * Casos de uso de Cliente. `tenantId` SIEMPRE viene del JWT (ADR-002) y se
 * transmite a cada operación del repositorio. DELETE = soft-delete (`archived`).
 */

export interface CreateCustomerInput {
  readonly code: string;
  readonly name: string;
  readonly type?: CustomerType | undefined;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly taxId?: string | undefined;
  readonly address?: CustomerAddress | undefined;
}

export interface PatchCustomerInput {
  readonly name?: string | undefined;
  readonly type?: CustomerType | undefined;
  readonly email?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly taxId?: string | null | undefined;
  readonly address?: CustomerAddress | null | undefined;
  readonly archived?: boolean | undefined;
}

export interface CustomerListQuery {
  readonly page: number;
  readonly limit: number;
  readonly archived?: boolean | undefined;
}

export interface CrmPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

function assertCode(code: string): string {
  const normalized = normalizeCode(code);
  const check = validateCode(normalized);
  if (!check.valid) {
    throw new ValidationError('Invalid code', { issues: check.issues });
  }
  return normalized;
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

/** Dirección: recorta, país a mayúsculas y descarta campos vacíos (null si vacía). */
function normalizeAddress(address: CustomerAddress): CustomerAddress | null {
  const street = address.street?.trim();
  const city = address.city?.trim();
  const region = address.region?.trim();
  const postalCode = address.postalCode?.trim();
  const country = address.country?.trim().toUpperCase();
  const fields = [street, city, region, postalCode, country];
  if (!fields.some((field) => field !== undefined && field !== '')) {
    return null;
  }
  return {
    ...(street ? { street } : {}),
    ...(city ? { city } : {}),
    ...(region ? { region } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(country ? { country } : {}),
  };
}

export async function createCustomer(
  tenantId: string,
  input: CreateCustomerInput,
): Promise<PublicCustomer> {
  const payload: Record<string, unknown> = {
    code: assertCode(input.code),
    name: assertName(input.name),
    type: input.type ?? 'company',
  };
  if (input.email !== undefined) {
    payload.email = assertEmail(input.email);
  }
  if (input.phone !== undefined) {
    payload.phone = input.phone.trim();
  }
  if (input.taxId !== undefined) {
    payload.taxId = input.taxId.trim().toUpperCase();
  }
  if (input.address !== undefined) {
    payload.address = normalizeAddress(input.address);
  }
  // Duplicado (tenantId, code) → 409 por índice único (también en repo).
  const customer = await customerRepo.create(tenantId, payload);
  return toPublicCustomer(customer);
}

export async function listCustomers(
  tenantId: string,
  query: CustomerListQuery,
): Promise<CrmPage<PublicCustomer>> {
  const filter = query.archived !== undefined ? { archived: query.archived } : {};
  const page = await customerRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicCustomer), total: page.total };
}

export async function getCustomer(tenantId: string, id: string): Promise<PublicCustomer> {
  const customer = await customerRepo.findById(tenantId, id);
  if (customer === null) {
    throw new NotFoundError();
  }
  return toPublicCustomer(customer);
}

export async function updateCustomer(
  tenantId: string,
  id: string,
  input: PatchCustomerInput,
): Promise<PublicCustomer> {
  const current = await customerRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) {
    set.name = assertName(input.name);
  }
  if (input.type !== undefined) {
    set.type = input.type;
  }
  if (input.email !== undefined) {
    set.email = input.email === null ? null : assertEmail(input.email);
  }
  if (input.phone !== undefined) {
    set.phone = input.phone === null ? null : input.phone.trim();
  }
  if (input.taxId !== undefined) {
    set.taxId = input.taxId === null ? null : input.taxId.trim().toUpperCase();
  }
  if (input.address !== undefined) {
    set.address = input.address === null ? null : normalizeAddress(input.address);
  }
  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Customer is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Customer is not archived');
    }
    set.archived = input.archived;
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await customerRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicCustomer(updated);
}

/** DELETE = soft-delete: marca `archived` (doble archive → 409). */
export async function archiveCustomer(tenantId: string, id: string): Promise<PublicCustomer> {
  const current = await customerRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Customer is already archived');
  }
  const archived = await customerRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicCustomer(archived);
}
