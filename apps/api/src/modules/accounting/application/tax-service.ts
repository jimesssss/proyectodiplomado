import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import { toPublicTax, type PublicTax } from '../domain/entities/tax.js';
import {
  canArchive,
  canRestore,
  normalizeCode,
  validateCode,
} from '../domain/rules/accounting-rules.js';
import { taxRepo } from '../infrastructure/repositories/accounting-repository.js';

/**
 * Casos de uso del maestro de Impuesto (FASE 12). `tenantId` SIEMPRE del
 * JWT (ADR-002). `code` único por tenant e inmutable; `rate` en porcentaje
 * 0–100 (la precisión la fija el esqueStricto — sin redondeo extra, igual
 * que el `taxRate` por línea de FASE 9/10).
 */

export interface CreateTaxInput {
  readonly code: string;
  readonly name: string;
  readonly rate: number;
  readonly description?: string | undefined;
}

export interface PatchTaxInput {
  readonly name?: string | undefined;
  readonly rate?: number | undefined;
  readonly description?: string | null | undefined;
  readonly archived?: boolean | undefined;
}

export interface TaxListQuery {
  readonly page: number;
  readonly limit: number;
  readonly archived?: boolean | undefined;
}

export interface TaxPage {
  readonly items: readonly PublicTax[];
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

export async function createTax(tenantId: string, input: CreateTaxInput): Promise<PublicTax> {
  const payload: Record<string, unknown> = {
    code: assertCode(input.code),
    name: input.name.trim(),
    rate: input.rate,
  };
  if (input.description !== undefined) {
    payload.description = input.description.trim();
  }
  // Duplicado (tenantId, code) → 409 por índice único (también en repo).
  const tax = await taxRepo.create(tenantId, payload);
  return toPublicTax(tax);
}

export async function listTaxes(tenantId: string, query: TaxListQuery): Promise<TaxPage> {
  const filter = query.archived !== undefined ? { archived: query.archived } : {};
  const page = await taxRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicTax), total: page.total };
}

export async function getTax(tenantId: string, id: string): Promise<PublicTax> {
  const tax = await taxRepo.findById(tenantId, id);
  if (tax === null) {
    throw new NotFoundError();
  }
  return toPublicTax(tax);
}

export async function updateTax(
  tenantId: string,
  id: string,
  input: PatchTaxInput,
): Promise<PublicTax> {
  const current = await taxRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) {
    set.name = input.name.trim();
  }
  if (input.rate !== undefined) {
    set.rate = input.rate;
  }
  if (input.description !== undefined) {
    set.description = input.description === null ? null : input.description.trim();
  }
  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Tax is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Tax is not archived');
    }
    set.archived = input.archived;
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await taxRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicTax(updated);
}

/**
 * DELETE NO está publicado para impuestos (el catálogo no define
 * `accounting.tax:delete`): el archivado es `PATCH {archived:true}` con
 * `accounting.tax:update`. Implementación del contrato de la fábrica CRUD
 * (la ruta DELETE no se emite → peticiones → 404).
 */
export async function archiveTax(tenantId: string, id: string): Promise<PublicTax> {
  const current = await taxRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Tax is already archived');
  }
  const archived = await taxRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicTax(archived);
}
