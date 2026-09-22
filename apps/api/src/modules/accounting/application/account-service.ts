import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import {
  toPublicAccount,
  type AccountNature,
  type PublicAccount,
} from '../domain/entities/account.js';
import {
  canArchive,
  canRestore,
  normalizeCode,
  validateCode,
} from '../domain/rules/accounting-rules.js';
import { accountRepo } from '../infrastructure/repositories/accounting-repository.js';

/**
 * Casos de uso del plan contable (FASE 12). `tenantId` SIEMPRE del JWT
 * (ADR-002). `code` único por tenant e INMUTABLE (como `nature`: cambiar la
 * naturaleza de una cuenta usada por asientos rompería la consistencia del
 * extracto → el PATCH ni siquiera la admite → 400). El saldo normal se
 * DERIVA de `nature` al salir; no existe como campo escribible.
 */

export interface CreateAccountInput {
  readonly code: string;
  readonly name: string;
  readonly nature: AccountNature;
  readonly description?: string | undefined;
}

export interface PatchAccountInput {
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly archived?: boolean | undefined;
}

export interface AccountListQuery {
  readonly page: number;
  readonly limit: number;
  readonly archived?: boolean | undefined;
}

export interface AccountPage {
  readonly items: readonly PublicAccount[];
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

export async function createAccount(
  tenantId: string,
  input: CreateAccountInput,
): Promise<PublicAccount> {
  const payload: Record<string, unknown> = {
    code: assertCode(input.code),
    name: input.name.trim(),
    nature: input.nature,
  };
  if (input.description !== undefined) {
    payload.description = input.description.trim();
  }
  // Duplicado (tenantId, code) → 409 por índice único (también en repo).
  const account = await accountRepo.create(tenantId, payload);
  return toPublicAccount(account);
}

export async function listAccounts(
  tenantId: string,
  query: AccountListQuery,
): Promise<AccountPage> {
  const filter = query.archived !== undefined ? { archived: query.archived } : {};
  const page = await accountRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicAccount), total: page.total };
}

export async function getAccount(tenantId: string, id: string): Promise<PublicAccount> {
  const account = await accountRepo.findById(tenantId, id);
  if (account === null) {
    throw new NotFoundError();
  }
  return toPublicAccount(account);
}

export async function updateAccount(
  tenantId: string,
  id: string,
  input: PatchAccountInput,
): Promise<PublicAccount> {
  const current = await accountRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) {
    set.name = input.name.trim();
  }
  if (input.description !== undefined) {
    set.description = input.description === null ? null : input.description.trim();
  }
  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Account is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Account is not archived');
    }
    set.archived = input.archived;
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await accountRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicAccount(updated);
}

/**
 * DELETE NO está publicado para cuentas (el catálogo no define
 * `accounting.account:delete`): el archivado es `PATCH {archived:true}` con
 * `accounting.account:update`. Implementación del contrato de la fábrica
 * CRUD (la ruta DELETE no se emite → peticiones → 404).
 */
export async function archiveAccount(tenantId: string, id: string): Promise<PublicAccount> {
  const current = await accountRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Account is already archived');
  }
  const archived = await accountRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicAccount(archived);
}

/**
 * FK de cuenta para líneas de asientos: inexistente o de otro tenant →
 * 404 uniforme; archivada → 409 (no se asienta contra una cuenta fuera de uso).
 */
export async function assertAccountActive(
  tenantId: string,
  accountId: string,
): Promise<PublicAccount> {
  const account = await getAccount(tenantId, accountId);
  if (account.archived) {
    throw new ConflictError('Account is archived');
  }
  return account;
}
