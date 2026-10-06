import { atomic } from '../../../core/db/transaction.js';
import {
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
} from '../../../core/errors/app-error.js';
import { nextDocumentNumber } from '../../../core/numbering/numbering.js';
import { getSale } from '../../../modules/sales/index.js';
import {
  toPublicReceipt,
  type MoneyStatus,
  type PublicReceipt,
  type Receipt,
} from '../domain/entities/money-documents.js';
import {
  canArchive,
  canMoneyTransition,
  canRestore,
  isEditable,
  RECEIPT_PREFIX,
  roundMoney,
} from '../domain/rules/treasury-rules.js';
import {
  accountRepo,
  movementRepo,
  receiptRepo,
} from '../infrastructure/repositories/treasury-repository.js';
import { assertAccountActive } from './treasury-account-service.js';

/**
 * Casos de uso de Cobros (dinero IN, FASE 13). Espejo de `payment-service`
 * con las diferencias propias de la entrada de dinero: el `$inc` del saldo
 * no necesita pre-chequeo (nunca viola la guardia `balance ≥ 0`) y la FK es
 * la factura de venta (`sales.invoice`). El orden de publicación es el
 * mismo: pre-chequeo de cuenta → escritura condicionada a `draft` (puerta
 * at-most-once) → `$inc` (+ compensación si la cuenta desapareció) →
 * apunte en el ledger (ventanas sin transacciones documentadas en
 * `docs/api/treasury.md`).
 */

export interface CreateReceiptInput {
  readonly accountId: string;
  readonly amount: number;
  readonly date?: Date | undefined;
  readonly invoiceId?: string | undefined;
  readonly reference?: string | undefined;
  readonly notes?: string | undefined;
}

export interface PatchReceiptInput {
  readonly accountId?: string | undefined;
  readonly amount?: number | undefined;
  readonly date?: Date | undefined;
  readonly invoiceId?: string | null | undefined;
  readonly reference?: string | null | undefined;
  readonly notes?: string | null | undefined;
  readonly status?: MoneyStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface ReceiptListQuery {
  readonly page: number;
  readonly limit: number;
  readonly status?: MoneyStatus | undefined;
  readonly accountId?: string | undefined;
}

export interface ReceiptPage {
  readonly items: readonly PublicReceipt[];
  readonly total: number;
}

const BUSINESS_FIELDS = new Set(['accountId', 'amount', 'date', 'invoiceId', 'reference', 'notes']);

/** FK: la factura de venta debe existir para el tenant (404 uniforme). */
async function assertSalesInvoice(tenantId: string, invoiceId: string): Promise<void> {
  await getSale(tenantId, 'sales.invoice', invoiceId);
}

/** Revierte la escritura de publicación si la cuenta desapareció (raro). */
function restoreDraftPatch(
  current: Receipt,
  set: Record<string, unknown>,
): Record<string, unknown> {
  const restore: Record<string, unknown> = { status: 'draft' };
  for (const key of Object.keys(set)) {
    if (key !== 'status') {
      restore[key] = current[key as keyof Receipt];
    }
  }
  return restore;
}

export async function createReceipt(
  tenantId: string,
  input: CreateReceiptInput,
): Promise<PublicReceipt> {
  await assertAccountActive(tenantId, input.accountId);
  if (input.invoiceId !== undefined) {
    await assertSalesInvoice(tenantId, input.invoiceId);
  }
  // Numeración atómica por tenant+año (core/numbering).
  const number = await nextDocumentNumber(tenantId, 'treasury.receipt', RECEIPT_PREFIX);
  const receipt = await receiptRepo.create(tenantId, {
    number,
    accountId: input.accountId,
    amount: roundMoney(input.amount),
    date: input.date ?? new Date(),
    invoiceId: input.invoiceId ?? null,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    status: 'draft',
  });
  return toPublicReceipt(receipt);
}

export async function listReceipts(
  tenantId: string,
  query: ReceiptListQuery,
): Promise<ReceiptPage> {
  const filter = {
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.accountId !== undefined ? { accountId: query.accountId } : {}),
  };
  const page = await receiptRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicReceipt), total: page.total };
}

export async function getReceipt(tenantId: string, id: string): Promise<PublicReceipt> {
  const receipt = await receiptRepo.findById(tenantId, id);
  if (receipt === null) {
    throw new NotFoundError();
  }
  return toPublicReceipt(receipt);
}

export async function updateReceipt(tenantId:string,id:string,input:PatchReceiptInput):Promise<PublicReceipt> {
  if(input.status==='posted')return atomic(()=>updateReceiptInternal(tenantId,id,input),false);
  return updateReceiptInternal(tenantId,id,input);
}
async function updateReceiptInternal(
  tenantId: string,
  id: string,
  input: PatchReceiptInput,
): Promise<PublicReceipt> {
  const current = await receiptRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }

  const requested = Object.keys(input).filter(
    (key) => BUSINESS_FIELDS.has(key) && (input as Record<string, unknown>)[key] !== undefined,
  );
  if (!isEditable(current.status) && requested.length > 0) {
    throw new ConflictError('Only draft documents can be edited');
  }

  const set: Record<string, unknown> = {};
  if (input.accountId !== undefined) {
    await assertAccountActive(tenantId, input.accountId);
    set.accountId = input.accountId;
  }
  if (input.amount !== undefined) {
    set.amount = roundMoney(input.amount);
  }
  if (input.date !== undefined) {
    set.date = input.date;
  }
  if (input.invoiceId !== undefined) {
    if (input.invoiceId !== null) {
      await assertSalesInvoice(tenantId, input.invoiceId);
    }
    set.invoiceId = input.invoiceId;
  }
  if (input.reference !== undefined) {
    set.reference = input.reference === null ? null : input.reference.trim();
  }
  if (input.notes !== undefined) {
    set.notes = input.notes === null ? null : input.notes.trim();
  }
  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Receipt is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Receipt is not archived');
    }
    set.archived = input.archived;
  }

  if (input.status !== undefined) {
    if (input.status === current.status) {
      throw new ConflictError('Status is already the requested one');
    }
    if (!canMoneyTransition(current.status, input.status)) {
      throw new ConflictError('Invalid status transition');
    }
    if (input.status === 'posted') {
      return postReceipt(tenantId, current, set);
    }
    // `cancelled` (draft → cancelled): transición CONDICIONADA a `draft`.
    set.status = input.status;
    const cancelled = await receiptRepo.transition(tenantId, id, 'draft', set);
    if (cancelled === null) {
      const fresh = await receiptRepo.findById(tenantId, id);
      if (fresh === null) {
        throw new NotFoundError();
      }
      if (fresh.status === input.status) {
        throw new ConflictError('Status is already the requested one');
      }
      throw new ConflictError('Invalid status transition');
    }
    return toPublicReceipt(cancelled);
  }

  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await receiptRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicReceipt(updated);
}

/**
 * Publicación del cobro: escritura condicionada a `draft`, luego `$inc` del
 * saldo (sin guardia: la entrada solo puede subir el saldo) y apunte en el
 * ledger con `balanceAfter`. Si la cuenta desapareció entre líneas se
 * compensa la escritura y responde 404.
 */
async function postReceipt(
  tenantId: string,
  current: Receipt,
  set: Record<string, unknown>,
): Promise<PublicReceipt> {
  const accountId = (set.accountId as string | undefined) ?? current.accountId;
  const amount = (set.amount as number | undefined) ?? current.amount;

  await assertAccountActive(tenantId, accountId);

  const posted = await receiptRepo.transition(tenantId, current.id, 'draft', {
    ...set,
    status: 'posted',
  });
  if (posted === null) {
    const fresh = await receiptRepo.findById(tenantId, current.id);
    if (fresh === null) {
      throw new NotFoundError();
    }
    if (fresh.status === 'posted') {
      throw new ConflictError('Status is already the requested one');
    }
    throw new ConflictError('Invalid status transition');
  }

  const applied = await accountRepo.applyDelta(tenantId, accountId, amount);
  if (applied === null) {
    // La cuenta no existía al aplicar el `$inc`: compensar y responder 404.
    await receiptRepo.update(tenantId, current.id, restoreDraftPatch(current, set));
    const fresh = await accountRepo.findById(tenantId, accountId);
    if (fresh === null) {
      throw new NotFoundError();
    }
    // Defensivo (no debería ocurrir): cuenta presente pero `$inc` rechazado.
    throw new DomainError('Account is unavailable', { available: fresh.balance });
  }

  await movementRepo.create(tenantId, {
    accountId,
    amount,
    balanceAfter: applied,
    sourceType: 'receipt',
    sourceId: posted.id,
    reason: `Receipt ${posted.number}`,
  });
  return toPublicReceipt(posted);
}

/**
 * DELETE NO publicado (el catálogo no define `receipt:delete`): soft-delete
 * vía `PATCH {archived}`. Contrato de la fábrica CRUD (ruta no emitida → 404).
 */
export async function archiveReceipt(tenantId: string, id: string): Promise<PublicReceipt> {
  const current = await receiptRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Receipt is already archived');
  }
  const archived = await receiptRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicReceipt(archived);
}
