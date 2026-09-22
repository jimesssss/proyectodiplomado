import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import {
  toPublicSupplier,
  type PublicSupplier,
  type SupplierAddress,
} from '../domain/entities/supplier.js';
import {
  canArchive,
  canRestore,
  normalizeCode,
  validateCode,
} from '../domain/rules/purchase-rules.js';
import { supplierRepo } from '../infrastructure/repositories/purchase-repository.js';

/**
 * Casos de uso del maestro de Proveedor. `tenantId` SIEMPRE viene del JWT
 * (ADR-002). `code` único por tenant e inmutable; DELETE = soft-delete.
 */

export interface CreateSupplierInput {
  readonly code: string;
  readonly name: string;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly taxId?: string | undefined;
  readonly address?: SupplierAddress | undefined;
}

export interface PatchSupplierInput {
  readonly name?: string | undefined;
  readonly email?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly taxId?: string | null | undefined;
  readonly address?: SupplierAddress | null | undefined;
  readonly archived?: boolean | undefined;
}

export interface SupplierListQuery {
  readonly page: number;
  readonly limit: number;
  readonly archived?: boolean | undefined;
}

export interface SupplierPage {
  readonly items: readonly PublicSupplier[];
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

/** Dirección: recorta, país a mayúsculas y descarta campos vacíos (null si vacía). */
function normalizeAddress(address: SupplierAddress): SupplierAddress | null {
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

export async function createSupplier(
  tenantId: string,
  input: CreateSupplierInput,
): Promise<PublicSupplier> {
  const payload: Record<string, unknown> = {
    code: assertCode(input.code),
    name: input.name.trim(),
  };
  if (input.email !== undefined) {
    payload.email = input.email.trim().toLowerCase();
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
  const supplier = await supplierRepo.create(tenantId, payload);
  return toPublicSupplier(supplier);
}

export async function listSuppliers(
  tenantId: string,
  query: SupplierListQuery,
): Promise<SupplierPage> {
  const filter = query.archived !== undefined ? { archived: query.archived } : {};
  const page = await supplierRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicSupplier), total: page.total };
}

export async function getSupplier(tenantId: string, id: string): Promise<PublicSupplier> {
  const supplier = await supplierRepo.findById(tenantId, id);
  if (supplier === null) {
    throw new NotFoundError();
  }
  return toPublicSupplier(supplier);
}

export async function updateSupplier(
  tenantId: string,
  id: string,
  input: PatchSupplierInput,
): Promise<PublicSupplier> {
  const current = await supplierRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) {
    set.name = input.name.trim();
  }
  if (input.email !== undefined) {
    set.email = input.email === null ? null : input.email.trim().toLowerCase();
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
      throw new ConflictError('Supplier is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Supplier is not archived');
    }
    set.archived = input.archived;
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await supplierRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicSupplier(updated);
}

/** DELETE = soft-delete: marca `archived` (doble archive → 409). */
export async function archiveSupplier(tenantId: string, id: string): Promise<PublicSupplier> {
  const current = await supplierRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Supplier is already archived');
  }
  const archived = await supplierRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicSupplier(archived);
}
