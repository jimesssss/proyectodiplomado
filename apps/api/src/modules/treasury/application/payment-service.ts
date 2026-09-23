import {
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
} from '../../../core/errors/app-error.js';
import { nextDocumentNumber } from '../../../core/numbering/numbering.js';
import { getPurchase } from '../../../modules/purchasing/index.js';
import {
  toPublicPayment,
  type MoneyStatus,
  type Payment,
  type PublicPayment,
} from '../domain/entities/money-documents.js';
import {
  canArchive,
  canMoneyTransition,
  canRestore,
  isEditable,
  PAYMENT_PREFIX,
  roundMoney,
} from '../domain/rules/treasury-rules.js';
import {
  accountRepo,
  movementRepo,
  paymentRepo,
} from '../infrastructure/repositories/treasury-repository.js';
import { assertAccountActive } from './treasury-account-service.js';

/**
 * Casos de uso de Pagos (dinero OUT, FASE 13). `tenantId` SIEMPRE del JWT
 * (ADR-002). Máquina `draft → posted|cancelled`; el catálogo NO define
 * `payment:post` → la publicación va con `PATCH {status:'posted'}` bajo
 * `payment:update` (patrón `goods.receipt`, FASE 10) y es la ÚNICA vía que
 * mueve dinero. Orden de publicación (sin transacciones Mongo — ventanas
 * documentadas en `docs/api/treasury.md`):
 *
 * 1. Pre-chequeos SOLO-lectura (cuenta activa y saldo suficiente → 422
 *    limpio, sin escrituras).
 * 2. UNA escritura CONDICIONADA a `draft` (`repo.transition`): puerta
 *    at-most-once — dos peticiones concurrentes no pueden mover el dinero
 *    dos veces (la perdedora relee → 409).
 * 3. `$inc` del saldo con guardia atómica (`balance ≥ amount`): si una
 *    carrera la pierde, se COMPENSA la escritura (estado y campos de vuelta
 *    a valores previos) y responde 422 sin efectos.
 * 4. Apunte en el ledger `cashMovements` (si esto falla tras aplicar el
 *    saldo, el documento queda `posted` SIN apunte: ventana documentada; el
 *    estado `posted` impide reintentar y duplicar dinero).
 *
 * Campos de negocio solo en `draft` (409); FK de factura de proveedor
 * (`supplier.invoice`) informacional: existe y pertenece al tenant → si no,
 * 404; NO modifica la factura (sincronización → outbox ADR-007).
 */

export interface CreatePaymentInput {
  readonly accountId: string;
  readonly amount: number;
  readonly date?: Date | undefined;
  readonly invoiceId?: string | undefined;
  readonly reference?: string | undefined;
  readonly notes?: string | undefined;
}

export interface PatchPaymentInput {
  readonly accountId?: string | undefined;
  readonly amount?: number | undefined;
  readonly date?: Date | undefined;
  readonly invoiceId?: string | null | undefined;
  readonly reference?: string | null | undefined;
  readonly notes?: string | null | undefined;
  readonly status?: MoneyStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface PaymentListQuery {
  readonly page: number;
  readonly limit: number;
  readonly status?: MoneyStatus | undefined;
  readonly accountId?: string | undefined;
}

export interface PaymentPage {
  readonly items: readonly PublicPayment[];
  readonly total: number;
}

const BUSINESS_FIELDS = new Set(['accountId', 'amount', 'date', 'invoiceId', 'reference', 'notes']);

/** FK: la factura de proveedor debe existir para el tenant (404 uniforme). */
async function assertSupplierInvoice(tenantId: string, invoiceId: string): Promise<void> {
  await getPurchase(tenantId, 'supplier.invoice', invoiceId);
}

/** Revierte la escritura de publicación si la guardia de saldo no aplicó. */
function restoreDraftPatch(
  current: Payment,
  set: Record<string, unknown>,
): Record<string, unknown> {
  const restore: Record<string, unknown> = { status: 'draft' };
  for (const key of Object.keys(set)) {
    if (key !== 'status') {
      restore[key] = current[key as keyof Payment];
    }
  }
  return restore;
}

export async function createPayment(
  tenantId: string,
  input: CreatePaymentInput,
): Promise<PublicPayment> {
  await assertAccountActive(tenantId, input.accountId);
  if (input.invoiceId !== undefined) {
    await assertSupplierInvoice(tenantId, input.invoiceId);
  }
  // Numeración atómica por tenant+año (core/numbering).
  const number = await nextDocumentNumber(tenantId, 'treasury.payment', PAYMENT_PREFIX);
  const payment = await paymentRepo.create(tenantId, {
    number,
    accountId: input.accountId,
    amount: roundMoney(input.amount),
    date: input.date ?? new Date(),
    invoiceId: input.invoiceId ?? null,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    status: 'draft',
  });
  return toPublicPayment(payment);
}

export async function listPayments(
  tenantId: string,
  query: PaymentListQuery,
): Promise<PaymentPage> {
  const filter = {
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.accountId !== undefined ? { accountId: query.accountId } : {}),
  };
  const page = await paymentRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicPayment), total: page.total };
}

export async function getPayment(tenantId: string, id: string): Promise<PublicPayment> {
  const payment = await paymentRepo.findById(tenantId, id);
  if (payment === null) {
    throw new NotFoundError();
  }
  return toPublicPayment(payment);
}

export async function updatePayment(
  tenantId: string,
  id: string,
  input: PatchPaymentInput,
): Promise<PublicPayment> {
  const current = await paymentRepo.findById(tenantId, id);
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
      await assertSupplierInvoice(tenantId, input.invoiceId);
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
      throw new ConflictError('Payment is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Payment is not archived');
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
      return postPayment(tenantId, current, set);
    }
    // `cancelled` (draft → cancelled): transición CONDICIONADA a `draft`.
    set.status = input.status;
    const cancelled = await paymentRepo.transition(tenantId, id, 'draft', set);
    if (cancelled === null) {
      const fresh = await paymentRepo.findById(tenantId, id);
      if (fresh === null) {
        throw new NotFoundError();
      }
      if (fresh.status === input.status) {
        throw new ConflictError('Status is already the requested one');
      }
      throw new ConflictError('Invalid status transition');
    }
    return toPublicPayment(cancelled);
  }

  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await paymentRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicPayment(updated);
}

/**
 * Publicación del pago: vea el orden documentado arriba. `set` ya contiene
 * los cambios de negocio validados (borrador actual); la escritura del
 * estado los aplica JUNTOS con `posted` en un único update.
 */
async function postPayment(
  tenantId: string,
  current: Payment,
  set: Record<string, unknown>,
): Promise<PublicPayment> {
  const accountId = (set.accountId as string | undefined) ?? current.accountId;
  const amount = (set.amount as number | undefined) ?? current.amount;

  // (1) Pre-chequeos en lectura: nada se escribe si no aplica.
  const account = await assertAccountActive(tenantId, accountId);
  if (account.balance < amount) {
    throw new DomainError('Insufficient funds', {
      available: account.balance,
      required: amount,
    });
  }

  // (2) Escritura condicionada a `draft` (puerta at-most-once).
  const posted = await paymentRepo.transition(tenantId, current.id, 'draft', {
    ...set,
    status: 'posted',
  });
  if (posted === null) {
    const fresh = await paymentRepo.findById(tenantId, current.id);
    if (fresh === null) {
      throw new NotFoundError();
    }
    if (fresh.status === 'posted') {
      throw new ConflictError('Status is already the requested one');
    }
    throw new ConflictError('Invalid status transition');
  }

  // (3) Dinero: `$inc` con guardia; carrera → compensación total del PATCH.
  const applied = await accountRepo.applyDelta(tenantId, accountId, -amount);
  if (applied === null) {
    await paymentRepo.update(tenantId, current.id, restoreDraftPatch(current, set));
    const fresh = await accountRepo.findById(tenantId, accountId);
    if (fresh === null) {
      throw new NotFoundError();
    }
    throw new DomainError('Insufficient funds', {
      available: fresh.balance,
      required: amount,
    });
  }

  // (4) Ledger (fuente de verdad del dinero).
  await movementRepo.create(tenantId, {
    accountId,
    amount: -amount,
    balanceAfter: applied,
    sourceType: 'payment',
    sourceId: posted.id,
    reason: `Payment ${posted.number}`,
  });
  return toPublicPayment(posted);
}

/**
 * DELETE NO publicado (el catálogo no define `payment:delete`): soft-delete
 * vía `PATCH {archived}`. Contrato de la fábrica CRUD (ruta no emitida → 404).
 */
export async function archivePayment(tenantId: string, id: string): Promise<PublicPayment> {
  const current = await paymentRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Payment is already archived');
  }
  const archived = await paymentRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicPayment(archived);
}
