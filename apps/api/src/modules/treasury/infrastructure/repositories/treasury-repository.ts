import { Types, type Model } from 'mongoose';
import { ConflictError } from '../../../../core/errors/app-error.js';
import type { CashMovement } from '../../domain/entities/cash-movement.js';
import type { BankTransaction } from '../../domain/entities/bank-transaction.js';
import type { Payment, Receipt } from '../../domain/entities/money-documents.js';
import type { Reconciliation, ReconciliationLine } from '../../domain/entities/reconciliation.js';
import type {
  TreasuryAccount,
  TreasuryAccountType,
} from '../../domain/entities/treasury-account.js';
import type { MoneyStatus } from '../../domain/entities/money-documents.js';
import {
  BankTransactionModel,
  CashMovementModel,
  PaymentModel,
  ReconciliationModel,
  ReceiptModel,
  TreasuryAccountModel,
} from '../schemas/collections.js';
import type {
  BankTransactionDoc,
  CashMovementDoc,
  PaymentDoc,
  ReceiptDoc,
  ReconciliationDoc,
  TreasuryAccountDoc,
} from '../schemas/types.js';

/**
 * Repositorio Treasury — único camino a MongoDB del módulo (6 colecciones).
 * TODA operación filtra por `tenantId` (nunca llega del cliente, ADR-002).
 * Único punto de casteo: payload/$set de create/update y ObjectId en filtros.
 *
 * El saldo (`treasuryAccounts.balance`) solo se modifica vía `applyDelta`
 * con guardia atómica (`balance ≥ −delta` en el propio filtro): un pago
 * nunca puede dejar saldo negativo aunque haya escrituras concurrentes.
 */

export interface AccountListFilter {
  readonly type?: TreasuryAccountType | undefined;
  readonly archived?: boolean | undefined;
}

export interface PaymentListFilter {
  readonly status?: MoneyStatus | undefined;
  readonly accountId?: string | undefined;
}

export interface ReceiptListFilter {
  readonly status?: MoneyStatus | undefined;
  readonly accountId?: string | undefined;
}

export interface BankTxListFilter {
  readonly accountId?: string | undefined;
  readonly reconciled?: boolean | undefined;
}

export interface ReconListFilter {
  readonly accountId?: string | undefined;
}

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface AccountRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<TreasuryAccount>;
  findById(tenantId: string, id: string): Promise<TreasuryAccount | null>;
  list(
    tenantId: string,
    filter: AccountListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<TreasuryAccount>>;
  update(
    tenantId: string,
    id: string,
    set: Record<string, unknown>,
  ): Promise<TreasuryAccount | null>;
  /**
   * Aplica `delta` (con signo) al saldo. Si `delta < 0` la guardia
   * `balance ≥ −delta` va en el filtro: saldo insuficiente → `null` (el
   * servicio compensa el estado y responde 422). Si `delta ≥ 0` y la cuenta
   * desapareció entre líneas → `null` (sin upsert: toda cuenta nace con su
   * saldo). Devuelve el saldo resultante.
   */
  applyDelta(tenantId: string, accountId: string, delta: number): Promise<number | null>;
}

export interface MovementRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<CashMovement>;
  findById(tenantId: string, id: string): Promise<CashMovement | null>;
  listByAccount(
    tenantId: string,
    accountId: string,
    page: number,
    limit: number,
  ): Promise<ListPage<CashMovement>>;
}

export interface PaymentRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Payment>;
  findById(tenantId: string, id: string): Promise<Payment | null>;
  list(
    tenantId: string,
    filter: PaymentListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<Payment>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<Payment | null>;
  /**
   * Transición de estado CONDICIONADA: solo escribe si el documento sigue en
   * `expectedStatus` (`draft`); si otro request ya lo cambió → `null` (el
   * servicio relee para distinguir 404 de 409). Puerta at-most-once: dos
   * `PATCH {status:'posted'}` concurrentes no pueden mover el dinero dos veces.
   */
  transition(
    tenantId: string,
    id: string,
    expectedStatus: MoneyStatus,
    set: Record<string, unknown>,
  ): Promise<Payment | null>;
}

export interface ReceiptRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Receipt>;
  findById(tenantId: string, id: string): Promise<Receipt | null>;
  list(
    tenantId: string,
    filter: ReceiptListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<Receipt>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<Receipt | null>;
  /** Igual que `PaymentRepo.transition`: puerta at-most-once del cobro. */
  transition(
    tenantId: string,
    id: string,
    expectedStatus: MoneyStatus,
    set: Record<string, unknown>,
  ): Promise<Receipt | null>;
}

export interface BankTxRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<BankTransaction>;
  findById(tenantId: string, id: string): Promise<BankTransaction | null>;
  list(
    tenantId: string,
    filter: BankTxListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<BankTransaction>>;
  update(
    tenantId: string,
    id: string,
    set: Record<string, unknown>,
  ): Promise<BankTransaction | null>;
  /** Marca transacciones como incluidas en una conciliación (idempotente). */
  markReconciled(tenantId: string, ids: readonly string[], reconciliationId: string): Promise<void>;
  /** Desmarca solo si siguen en ESTA conciliación (guardia defensiva). */
  unmarkReconciled(
    tenantId: string,
    ids: readonly string[],
    reconciliationId: string,
  ): Promise<void>;
}

export interface ReconRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Reconciliation>;
  findById(tenantId: string, id: string): Promise<Reconciliation | null>;
  list(
    tenantId: string,
    filter: ReconListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<Reconciliation>>;
  update(
    tenantId: string,
    id: string,
    set: Record<string, unknown>,
  ): Promise<Reconciliation | null>;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

const oid = (value: string): Types.ObjectId => new Types.ObjectId(value);

function optionalRef(value: Types.ObjectId | string | null | undefined): string | null {
  return value === undefined || value === null ? null : value.toString();
}

function toRef(value: Types.ObjectId | string): string {
  return value.toString();
}

// --- Mappers (doc → entidad de dominio; única salida sin tenantId-oculto) ---

function mapAccount(doc: TreasuryAccountDoc): TreasuryAccount {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    type: doc.type,
    code: doc.code,
    name: doc.name,
    description: doc.description ?? null,
    accountNumber: doc.accountNumber ?? null,
    currency: doc.currency,
    openingBalance: doc.openingBalance,
    balance: doc.balance,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapPayment(doc: PaymentDoc): Payment {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    number: doc.number,
    accountId: doc.accountId.toString(),
    amount: doc.amount,
    date: doc.date,
    invoiceId: optionalRef(doc.invoiceId),
    reference: doc.reference ?? null,
    notes: doc.notes ?? null,
    status: doc.status,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapReceipt(doc: ReceiptDoc): Receipt {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    number: doc.number,
    accountId: doc.accountId.toString(),
    amount: doc.amount,
    date: doc.date,
    invoiceId: optionalRef(doc.invoiceId),
    reference: doc.reference ?? null,
    notes: doc.notes ?? null,
    status: doc.status,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapBankTransaction(doc: BankTransactionDoc): BankTransaction {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    accountId: doc.accountId.toString(),
    date: doc.date,
    amount: doc.amount,
    externalId: doc.externalId ?? null,
    description: doc.description ?? null,
    reconciliationId: optionalRef(doc.reconciliationId),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapReconciliation(doc: ReconciliationDoc): Reconciliation {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    number: doc.number,
    accountId: doc.accountId.toString(),
    reconciledAt: doc.reconciledAt,
    lines: (doc.lines ?? []).map((line): ReconciliationLine => ({
      bankTransactionId: toRef(line.bankTransactionId),
      movementId: optionalRef(line.movementId),
    })),
    notes: doc.notes ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapMovement(doc: CashMovementDoc): CashMovement {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    accountId: doc.accountId.toString(),
    amount: doc.amount,
    balanceAfter: doc.balanceAfter,
    sourceType: doc.sourceType,
    sourceId: doc.sourceId.toString(),
    reason: doc.reason,
    createdAt: doc.createdAt,
  };
}

const accountModel: Model<TreasuryAccountDoc> = TreasuryAccountModel;
const paymentModel: Model<PaymentDoc> = PaymentModel;
const receiptModel: Model<ReceiptDoc> = ReceiptModel;
const bankTxModel: Model<BankTransactionDoc> = BankTransactionModel;
const reconModel: Model<ReconciliationDoc> = ReconciliationModel;
const movementModel: Model<CashMovementDoc> = CashMovementModel;

async function listWithCount<TDoc, TEntity>(
  model: Model<TDoc>,
  filter: Record<string, unknown>,
  page: number,
  limit: number,
  map: (doc: TDoc) => TEntity,
): Promise<ListPage<TEntity>> {
  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    model.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(filter),
  ]);
  return {
    items: docs.map((doc) => map(doc as TDoc)),
    total,
  };
}

export const accountRepo: AccountRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await accountModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as TreasuryAccountDoc);
      return mapAccount(doc.toObject() as unknown as TreasuryAccountDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('Code already exists');
      }
      throw error;
    }
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await accountModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapAccount(doc as unknown as TreasuryAccountDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.type !== undefined ? { type: filter.type } : {}),
      ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
    };
    return listWithCount(accountModel, mongoFilter, page, limit, mapAccount);
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await accountModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapAccount(doc as unknown as TreasuryAccountDoc);
  },

  async applyDelta(tenantId, accountId, delta) {
    if (!Types.ObjectId.isValid(accountId)) {
      return null;
    }
    const base = { _id: new Types.ObjectId(accountId), tenantId };
    if (delta < 0) {
      // Guardia atómica: el filtro exige saldo suficiente para la salida.
      const doc = await accountModel
        .findOneAndUpdate(
          { ...base, balance: { $gte: -delta } },
          { $inc: { balance: delta } },
          { returnDocument: 'after' },
        )
        .lean();
      return doc === null ? null : (doc as unknown as TreasuryAccountDoc).balance;
    }
    const doc = await accountModel
      .findOneAndUpdate(base, { $inc: { balance: delta } }, { returnDocument: 'after' })
      .lean();
    return doc === null ? null : (doc as unknown as TreasuryAccountDoc).balance;
  },
};

export const movementRepo: MovementRepo = {
  async create(tenantId, payload) {
    const doc = await movementModel.create({
      tenantId,
      ...payload,
    } as unknown as CashMovementDoc);
    return mapMovement(doc.toObject() as unknown as CashMovementDoc);
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await movementModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapMovement(doc as unknown as CashMovementDoc);
  },

  listByAccount(tenantId, accountId, page, limit) {
    if (!Types.ObjectId.isValid(accountId)) {
      return Promise.resolve({ items: [], total: 0 });
    }
    return listWithCount(
      movementModel,
      { tenantId, accountId: oid(accountId) },
      page,
      limit,
      mapMovement,
    );
  },
};

export const paymentRepo: PaymentRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await paymentModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as PaymentDoc);
      return mapPayment(doc.toObject() as unknown as PaymentDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('Number already in use');
      }
      throw error;
    }
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await paymentModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapPayment(doc as unknown as PaymentDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.status !== undefined ? { status: filter.status } : {}),
      ...(filter.accountId !== undefined && Types.ObjectId.isValid(filter.accountId)
        ? { accountId: oid(filter.accountId) }
        : {}),
    };
    return listWithCount(paymentModel, mongoFilter, page, limit, mapPayment);
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await paymentModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapPayment(doc as unknown as PaymentDoc);
  },

  async transition(tenantId, id, expectedStatus, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await paymentModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId, status: expectedStatus },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapPayment(doc as unknown as PaymentDoc);
  },
};

export const receiptRepo: ReceiptRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await receiptModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as ReceiptDoc);
      return mapReceipt(doc.toObject() as unknown as ReceiptDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('Number already in use');
      }
      throw error;
    }
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await receiptModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapReceipt(doc as unknown as ReceiptDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.status !== undefined ? { status: filter.status } : {}),
      ...(filter.accountId !== undefined && Types.ObjectId.isValid(filter.accountId)
        ? { accountId: oid(filter.accountId) }
        : {}),
    };
    return listWithCount(receiptModel, mongoFilter, page, limit, mapReceipt);
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await receiptModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapReceipt(doc as unknown as ReceiptDoc);
  },

  async transition(tenantId, id, expectedStatus, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await receiptModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId, status: expectedStatus },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapReceipt(doc as unknown as ReceiptDoc);
  },
};

export const bankTxRepo: BankTxRepo = {
  async create(tenantId, payload) {
    const doc = await bankTxModel.create({
      tenantId,
      ...payload,
    } as unknown as BankTransactionDoc);
    return mapBankTransaction(doc.toObject() as unknown as BankTransactionDoc);
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await bankTxModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapBankTransaction(doc as unknown as BankTransactionDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.accountId !== undefined && Types.ObjectId.isValid(filter.accountId)
        ? { accountId: oid(filter.accountId) }
        : {}),
      ...(filter.reconciled !== undefined
        ? filter.reconciled
          ? { reconciliationId: { $ne: null } }
          : { reconciliationId: null }
        : {}),
    };
    return listWithCount(bankTxModel, mongoFilter, page, limit, mapBankTransaction);
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await bankTxModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapBankTransaction(doc as unknown as BankTransactionDoc);
  },

  async markReconciled(tenantId, ids, reconciliationId) {
    const valid = ids.filter((id) => Types.ObjectId.isValid(id));
    if (valid.length === 0) {
      return;
    }
    await bankTxModel.updateMany(
      {
        tenantId,
        _id: { $in: valid.map(oid) },
        // Reclama solo líneas LIBRES o ya nuestras: nunca pisa la marca de
        // OTRA conciliación concurrente (sin doble asignación silenciosa).
        $or: [{ reconciliationId: null }, { reconciliationId: oid(reconciliationId) }],
      },
      { $set: { reconciliationId: oid(reconciliationId) } },
    );
  },

  async unmarkReconciled(tenantId, ids, reconciliationId) {
    const valid = ids.filter((id) => Types.ObjectId.isValid(id));
    if (valid.length === 0) {
      return;
    }
    await bankTxModel.updateMany(
      { tenantId, _id: { $in: valid.map(oid) }, reconciliationId: oid(reconciliationId) },
      { $set: { reconciliationId: null } },
    );
  },
};

export const reconRepo: ReconRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await reconModel.create({
        tenantId,
        ...payload,
      } as unknown as ReconciliationDoc);
      return mapReconciliation(doc.toObject() as unknown as ReconciliationDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('Number already in use');
      }
      throw error;
    }
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await reconModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapReconciliation(doc as unknown as ReconciliationDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.accountId !== undefined && Types.ObjectId.isValid(filter.accountId)
        ? { accountId: oid(filter.accountId) }
        : {}),
    };
    return listWithCount(reconModel, mongoFilter, page, limit, mapReconciliation);
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await reconModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapReconciliation(doc as unknown as ReconciliationDoc);
  },
};
