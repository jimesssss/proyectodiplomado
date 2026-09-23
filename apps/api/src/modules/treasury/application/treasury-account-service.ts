import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import type { PublicCashMovement } from '../domain/entities/cash-movement.js';
import { toPublicCashMovement } from '../domain/entities/cash-movement.js';
import {
  toPublicTreasuryAccount,
  type PublicTreasuryAccount,
  type TreasuryAccountType,
} from '../domain/entities/treasury-account.js';
import {
  canArchive,
  canRestore,
  normalizeCode,
  normalizeCurrency,
  roundMoney,
  validateCode,
  validateCurrency,
} from '../domain/rules/treasury-rules.js';
import { accountRepo, movementRepo } from '../infrastructure/repositories/treasury-repository.js';

/**
 * Casos de uso de cuentas de tesorería (FASE 13). `tenantId` SIEMPRE del
 * JWT (ADR-002). `code` único por tenant e inmutable; `type`/`currency`/
 * `openingBalance` también inmutables (cambiarlos reescribiría el saldo
 * proyectado → el PATCH ni siquiera los admite → 400). Al crear se registra
 * el asiento `opening` en el ledger `cashMovements` para que
 * `balance = openingBalance + Σ movimientos` siempre cierre (2 escrituras:
 * ventana de caída documentada). Archivar/restaurar vía `PATCH {archived}`
 * (el catálogo no define `bank.account:delete` → sin ruta DELETE).
 */

export interface CreateTreasuryAccountInput {
  readonly type: TreasuryAccountType;
  readonly code: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly accountNumber?: string | undefined;
  readonly currency?: string | undefined;
  readonly openingBalance?: number | undefined;
}

export interface PatchTreasuryAccountInput {
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly archived?: boolean | undefined;
}

export interface TreasuryAccountListQuery {
  readonly page: number;
  readonly limit: number;
  readonly type?: TreasuryAccountType | undefined;
  readonly archived?: boolean | undefined;
}

export interface TreasuryAccountPage {
  readonly items: readonly PublicTreasuryAccount[];
  readonly total: number;
}

export interface MovementListQuery {
  readonly page: number;
  readonly limit: number;
}

export interface MovementPage {
  readonly items: readonly PublicCashMovement[];
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

function assertCurrency(currency: string): string {
  const normalized = normalizeCurrency(currency);
  const check = validateCurrency(normalized);
  if (!check.valid) {
    throw new ValidationError('Invalid currency', { issues: check.issues });
  }
  return normalized;
}

export async function createTreasuryAccount(
  tenantId: string,
  input: CreateTreasuryAccountInput,
): Promise<PublicTreasuryAccount> {
  const opening = roundMoney(input.openingBalance ?? 0);
  const payload: Record<string, unknown> = {
    type: input.type,
    code: assertCode(input.code),
    name: input.name.trim(),
    currency: assertCurrency(input.currency ?? 'USD'),
    openingBalance: opening,
    // Proyección server-only: parte del apertura y solo `$inc` + guardia.
    balance: opening,
  };
  if (input.description !== undefined) {
    payload.description = input.description.trim();
  }
  if (input.accountNumber !== undefined) {
    payload.accountNumber = input.accountNumber.trim();
  }
  // Duplicado (tenantId, code) → 409 por índice único (también en repo).
  const account = await accountRepo.create(tenantId, payload);
  // Ledger: asiento de apertura SIEMPRE (aunque sea 0) — así la suma del
  // ledger coincide con el saldo proyectado desde el primer momento.
  await movementRepo.create(tenantId, {
    accountId: account.id,
    amount: account.openingBalance,
    balanceAfter: account.balance,
    sourceType: 'opening',
    sourceId: account.id,
    reason: 'Opening balance',
  });
  return toPublicTreasuryAccount(account);
}

export async function listTreasuryAccounts(
  tenantId: string,
  query: TreasuryAccountListQuery,
): Promise<TreasuryAccountPage> {
  const filter = {
    ...(query.type !== undefined ? { type: query.type } : {}),
    ...(query.archived !== undefined ? { archived: query.archived } : {}),
  };
  const page = await accountRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicTreasuryAccount), total: page.total };
}

export async function getTreasuryAccount(
  tenantId: string,
  id: string,
): Promise<PublicTreasuryAccount> {
  const account = await accountRepo.findById(tenantId, id);
  if (account === null) {
    throw new NotFoundError();
  }
  return toPublicTreasuryAccount(account);
}

export async function updateTreasuryAccount(
  tenantId: string,
  id: string,
  input: PatchTreasuryAccountInput,
): Promise<PublicTreasuryAccount> {
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
  return toPublicTreasuryAccount(updated);
}

/**
 * DELETE NO está publicado para cuentas (el catálogo no define
 * `bank.account:delete`): el archivado es `PATCH {archived:true}` con
 * `bank.account:update`. Implementación del contrato de la fábrica CRUD (la
 * ruta DELETE no se emite → peticiones → 404).
 */
export async function archiveTreasuryAccount(
  tenantId: string,
  id: string,
): Promise<PublicTreasuryAccount> {
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
  return toPublicTreasuryAccount(archived);
}

/**
 * FK de cuenta de tesorería: inexistente o de otro tenant → 404 uniforme;
 * archivada → 409 (el dinero no circula por una cuenta fuera de uso).
 */
export async function assertAccountActive(
  tenantId: string,
  accountId: string,
): Promise<PublicTreasuryAccount> {
  const account = await getTreasuryAccount(tenantId, accountId);
  if (account.archived) {
    throw new ConflictError('Account is archived');
  }
  return account;
}

/**
 * Extracto de la cuenta: su ledger `cashMovements` (append-only, el orden
 * es `createdAt` descendente con `balanceAfter` reconstruible). La cuenta
 * inexistente/ajena → 404 uniforme (no una lista vacía).
 */
export async function listAccountMovements(
  tenantId: string,
  accountId: string,
  query: MovementListQuery,
): Promise<MovementPage> {
  await getTreasuryAccount(tenantId, accountId);
  const page = await movementRepo.listByAccount(tenantId, accountId, query.page, query.limit);
  return { items: page.items.map(toPublicCashMovement), total: page.total };
}
