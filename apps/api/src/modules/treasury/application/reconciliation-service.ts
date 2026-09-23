import {
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
} from '../../../core/errors/app-error.js';
import { nextDocumentNumber } from '../../../core/numbering/numbering.js';
import {
  toPublicReconciliation,
  type PublicReconciliation,
  type Reconciliation,
  type ReconciliationLine,
} from '../domain/entities/reconciliation.js';
import { RECONCILIATION_PREFIX } from '../domain/rules/treasury-rules.js';
import {
  bankTxRepo,
  movementRepo,
  reconRepo,
} from '../infrastructure/repositories/treasury-repository.js';
import { assertAccountActive } from './treasury-account-service.js';

/**
 * Casos de uso de Conciliaciones bancarias (FASE 13). El documento `REC-*`
 * empareja líneas del estado de cuenta (`bankTransactions`) con registros
 * del ledger (`cashMovements`, opcional). Toda la validación del set de
 * líneas ocurre ANTES de escribir nada; después de escribir el documento se
 * sincronizan los flags `reconciliationId` (desmarcar las que salieron y
 * RECLAMAR las que entraron — solo si están libres o ya nuestras, nunca
 * pisando otra conciliación). Sin `:delete` ni máquina de estados: las
 * líneas se corrigen REEMPLAZÁNDOLAS en `PATCH` (re-validadas), no
 * archivándolas. La cuenta debe ser de tipo `bank` (422) y estar activa.
 */

export interface ReconciliationLineInput {
  readonly bankTransactionId: string;
  readonly movementId?: string | null | undefined;
}

export interface CreateReconciliationInput {
  readonly accountId: string;
  readonly reconciledAt?: Date | undefined;
  readonly lines: readonly ReconciliationLineInput[];
  readonly notes?: string | undefined;
}

export interface PatchReconciliationInput {
  readonly lines?: readonly ReconciliationLineInput[] | undefined;
  readonly notes?: string | null | undefined;
}

export interface ReconciliationListQuery {
  readonly page: number;
  readonly limit: number;
  readonly accountId?: string | undefined;
}

export interface ReconciliationPage {
  readonly items: readonly PublicReconciliation[];
  readonly total: number;
}

/**
 * Valida el set COMPLETO de líneas antes de cualquier escritura:
 * - duplicados en el payload → 400;
 * - línea inexistente/ajena → 404 uniforme;
 * - línea de OTRA cuenta → 409;
 * - línea ya conciliada en OTRA conciliación → 409 (`allowId` permite las
 *   que ya apuntan a ESTA — re-editar sus propias líneas);
 * - `movementId` inexistente/ajeno → 404; de otra cuenta → 409.
 */
async function validateLines(
  tenantId: string,
  accountId: string,
  lines: readonly ReconciliationLineInput[],
  allowId: string | null,
): Promise<ReconciliationLine[]> {
  // Fase 1: duplicados del payload (400) — error de PETICIÓN, se evalúa
  // ANTES de mirar el estado de las entidades (una línea repetida es
  // inválida aunque además esté ya conciliada).
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.bankTransactionId)) {
      throw new ValidationError('Duplicate bank transaction in lines', {
        bankTransactionId: line.bankTransactionId,
      });
    }
    seen.add(line.bankTransactionId);
  }

  // Fase 2: entidades y estados (404/409).
  const normalized: ReconciliationLine[] = [];
  for (const line of lines) {
    const tx = await bankTxRepo.findById(tenantId, line.bankTransactionId);
    if (tx === null) {
      throw new NotFoundError();
    }
    if (tx.accountId !== accountId) {
      throw new ConflictError('Bank transaction belongs to another account');
    }
    if (tx.reconciliationId !== null && tx.reconciliationId !== allowId) {
      throw new ConflictError('Bank transaction is already reconciled');
    }

    let movementId: string | null = null;
    if (line.movementId !== undefined && line.movementId !== null) {
      const movement = await movementRepo.findById(tenantId, line.movementId);
      if (movement === null) {
        throw new NotFoundError();
      }
      if (movement.accountId !== accountId) {
        throw new ConflictError('Movement belongs to another account');
      }
      movementId = movement.id;
    }
    normalized.push({ bankTransactionId: tx.id, movementId });
  }
  return normalized;
}

/** La cuenta debe existir, estar activa y ser de tipo `bank`. */
async function assertBankAccount(tenantId: string, accountId: string): Promise<string> {
  const account = await assertAccountActive(tenantId, accountId);
  if (account.type !== 'bank') {
    throw new DomainError('Reconciliations require a bank account', {
      type: account.type,
    });
  }
  return account.id;
}

export async function createReconciliation(
  tenantId: string,
  input: CreateReconciliationInput,
): Promise<PublicReconciliation> {
  const accountId = await assertBankAccount(tenantId, input.accountId);
  const lines = await validateLines(tenantId, accountId, input.lines, null);

  // Numeración atómica por tenant+año (core/numbering).
  const number = await nextDocumentNumber(
    tenantId,
    'treasury.reconciliation',
    RECONCILIATION_PREFIX,
  );
  const recon = await reconRepo.create(tenantId, {
    number,
    accountId,
    reconciledAt: input.reconciledAt ?? new Date(),
    lines,
    notes: input.notes ?? null,
  });
  // Sincroniza flags DESPUÉS de que el documento exista (reclama solo
  // líneas libres; ventana de caída documentada — re-crear/PATCH sana).
  await bankTxRepo.markReconciled(
    tenantId,
    lines.map((line) => line.bankTransactionId),
    recon.id,
  );
  return toPublicReconciliation(recon);
}

export async function listReconciliations(
  tenantId: string,
  query: ReconciliationListQuery,
): Promise<ReconciliationPage> {
  const filter = query.accountId !== undefined ? { accountId: query.accountId } : {};
  const page = await reconRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicReconciliation), total: page.total };
}

export async function getReconciliation(
  tenantId: string,
  id: string,
): Promise<PublicReconciliation> {
  const recon = await reconRepo.findById(tenantId, id);
  if (recon === null) {
    throw new NotFoundError();
  }
  return toPublicReconciliation(recon);
}

export async function updateReconciliation(
  tenantId: string,
  id: string,
  input: PatchReconciliationInput,
): Promise<PublicReconciliation> {
  const current: Reconciliation | null = await reconRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }

  const set: Record<string, unknown> = {};
  let changedIds: readonly string[] | null = null;
  if (input.notes !== undefined) {
    set.notes = input.notes === null ? null : input.notes.trim();
  }
  if (input.lines !== undefined) {
    // Re-valida el set NUEVO completo (líneas propias siguen permitidas).
    const lines = await validateLines(tenantId, current.accountId, input.lines, current.id);
    set.lines = lines;
    changedIds = lines.map((line) => line.bankTransactionId);
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }

  // Primero el documento (fuente de verdad), después sincronizar flags:
  // desmarcar lo que salió (solo si aún apunta a ESTA) y reclamar lo que
  // quedó/entró (idempotente; sana marcas huérfanas de una caída previa).
  const updated = await reconRepo.update(tenantId, current.id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  if (changedIds !== null) {
    const ids: readonly string[] = changedIds;
    const oldIds = current.lines.map((line) => line.bankTransactionId);
    const removed = oldIds.filter((lineId) => !ids.includes(lineId));
    await bankTxRepo.unmarkReconciled(tenantId, removed, current.id);
    await bankTxRepo.markReconciled(tenantId, ids, current.id);
  }
  return toPublicReconciliation(updated);
}
