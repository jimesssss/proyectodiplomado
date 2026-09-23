import { DomainError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import {
  toPublicBankTransaction,
  type PublicBankTransaction,
} from '../domain/entities/bank-transaction.js';
import { roundMoney } from '../domain/rules/treasury-rules.js';
import { bankTxRepo } from '../infrastructure/repositories/treasury-repository.js';
import { assertAccountActive } from './treasury-account-service.js';

/**
 * Casos de uso de líneas de estado de cuenta (FASE 13). Son registros
 * EXTERNOS del banco: NO mueven el saldo interno (eso solo lo hacen
 * `payment`/`receipt`) — existen para conciliarlas contra el ledger. Sin
 * máquina de estados ni archivado: solo `description` es editable (el
 * importe/fecha/cuenta son el hecho bancario y `reconciliationId` lo escribe
 * SOLO el servidor → no existen en el PATCH → 400). La cuenta destino debe
 * ser de TIPO banco (422 `DOMAIN_ERROR` — una caja no tiene estado de
 * cuenta) y estar activa (404 ajeno/inexistente, 409 archivada).
 */

export interface CreateBankTransactionInput {
  readonly accountId: string;
  readonly amount: number;
  readonly date?: Date | undefined;
  readonly externalId?: string | undefined;
  readonly description?: string | undefined;
}

export interface PatchBankTransactionInput {
  readonly description?: string | null | undefined;
}

export interface BankTxListQuery {
  readonly page: number;
  readonly limit: number;
  readonly accountId?: string | undefined;
  readonly reconciled?: boolean | undefined;
}

export interface BankTxPage {
  readonly items: readonly PublicBankTransaction[];
  readonly total: number;
}

/** La cuenta debe existir, estar activa y ser de tipo `bank`. */
async function assertBankAccount(tenantId: string, accountId: string): Promise<string> {
  const account = await assertAccountActive(tenantId, accountId);
  if (account.type !== 'bank') {
    throw new DomainError('Bank transactions require a bank account', {
      type: account.type,
    });
  }
  return account.id;
}

export async function createBankTransaction(
  tenantId: string,
  input: CreateBankTransactionInput,
): Promise<PublicBankTransaction> {
  const accountId = await assertBankAccount(tenantId, input.accountId);
  const tx = await bankTxRepo.create(tenantId, {
    accountId,
    date: input.date ?? new Date(),
    amount: roundMoney(input.amount),
    externalId: input.externalId ?? null,
    description: input.description ?? null,
  });
  return toPublicBankTransaction(tx);
}

export async function listBankTransactions(
  tenantId: string,
  query: BankTxListQuery,
): Promise<BankTxPage> {
  const filter = {
    ...(query.accountId !== undefined ? { accountId: query.accountId } : {}),
    ...(query.reconciled !== undefined ? { reconciled: query.reconciled } : {}),
  };
  const page = await bankTxRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicBankTransaction), total: page.total };
}

export async function getBankTransaction(
  tenantId: string,
  id: string,
): Promise<PublicBankTransaction> {
  const tx = await bankTxRepo.findById(tenantId, id);
  if (tx === null) {
    throw new NotFoundError();
  }
  return toPublicBankTransaction(tx);
}

export async function updateBankTransaction(
  tenantId: string,
  id: string,
  input: PatchBankTransactionInput,
): Promise<PublicBankTransaction> {
  const current = await bankTxRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  const set: Record<string, unknown> = {};
  if (input.description !== undefined) {
    set.description = input.description === null ? null : input.description.trim();
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await bankTxRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicBankTransaction(updated);
}
