import { Types, type Model } from 'mongoose';
import { ConflictError } from '../../../../core/errors/app-error.js';
import type { Account } from '../../domain/entities/account.js';
import type { FiscalPeriod, PeriodStatus } from '../../domain/entities/fiscal-period.js';
import type { JournalEntry, JournalStatus } from '../../domain/entities/journal-entry.js';
import type { Tax } from '../../domain/entities/tax.js';
import {
  AccountModel,
  FiscalPeriodModel,
  JournalEntryModel,
  TaxModel,
} from '../schemas/collections.js';
import type { AccountDoc, FiscalPeriodDoc, JournalEntryDoc, TaxDoc } from '../schemas/types.js';

/**
 * Repositorio Accounting — único camino a MongoDB del módulo (4 colecciones).
 * TODA operación filtra por `tenantId` (nunca llega del cliente, ADR-002).
 * Único punto de casteo: payload/$set de create/update y ObjectId en filtros.
 */

export interface AccountListFilter {
  readonly archived?: boolean | undefined;
}

export interface TaxListFilter {
  readonly archived?: boolean | undefined;
}

export interface PeriodListFilter {
  readonly status?: PeriodStatus | undefined;
}

export interface JournalListFilter {
  readonly status?: JournalStatus | undefined;
  readonly accountId?: string | undefined;
  readonly periodId?: string | undefined;
}

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface AccountRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Account>;
  findById(tenantId: string, id: string): Promise<Account | null>;
  list(
    tenantId: string,
    filter: AccountListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<Account>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<Account | null>;
}

export interface TaxRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Tax>;
  findById(tenantId: string, id: string): Promise<Tax | null>;
  list(
    tenantId: string,
    filter: TaxListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<Tax>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<Tax | null>;
}

export interface PeriodRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<FiscalPeriod>;
  findById(tenantId: string, id: string): Promise<FiscalPeriod | null>;
  list(
    tenantId: string,
    filter: PeriodListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<FiscalPeriod>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<FiscalPeriod | null>;
  /** ¿Existe un período que se solape con [startsAt, endsAt]? (alta → 409). */
  hasOverlap(tenantId: string, startsAt: Date, endsAt: Date): Promise<boolean>;
  /** Período que CUBRE la fecha (startsAt ≤ date ≤ endsAt); null si no hay. */
  findCovering(tenantId: string, date: Date): Promise<FiscalPeriod | null>;
}

export interface JournalRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<JournalEntry>;
  findById(tenantId: string, id: string): Promise<JournalEntry | null>;
  list(
    tenantId: string,
    filter: JournalListFilter,
    page: number,
    limit: number,
  ): Promise<ListPage<JournalEntry>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<JournalEntry | null>;
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

function mapAccount(doc: AccountDoc): Account {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    code: doc.code,
    name: doc.name,
    nature: doc.nature,
    description: doc.description ?? null,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapTax(doc: TaxDoc): Tax {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    code: doc.code,
    name: doc.name,
    rate: doc.rate,
    description: doc.description ?? null,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapPeriod(doc: FiscalPeriodDoc): FiscalPeriod {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    code: doc.code,
    name: doc.name ?? null,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapJournalEntry(doc: JournalEntryDoc): JournalEntry {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    number: doc.number,
    date: doc.date,
    currency: doc.currency,
    lines: (doc.lines ?? []).map((line) => ({
      accountId: toRef(line.accountId),
      description: line.description ?? null,
      debit: line.debit,
      credit: line.credit,
    })),
    debitTotal: doc.debitTotal,
    creditTotal: doc.creditTotal,
    status: doc.status,
    periodId: optionalRef(doc.periodId),
    reference: doc.reference ?? null,
    notes: doc.notes ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const accountModel: Model<AccountDoc> = AccountModel;
const taxModel: Model<TaxDoc> = TaxModel;
const periodModel: Model<FiscalPeriodDoc> = FiscalPeriodModel;
const journalModel: Model<JournalEntryDoc> = JournalEntryModel;

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
      } as unknown as AccountDoc);
      return mapAccount(doc.toObject() as unknown as AccountDoc);
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
    return doc === null ? null : mapAccount(doc as unknown as AccountDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
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
    return doc === null ? null : mapAccount(doc as unknown as AccountDoc);
  },
};

export const taxRepo: TaxRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await taxModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as TaxDoc);
      return mapTax(doc.toObject() as unknown as TaxDoc);
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
    const doc = await taxModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapTax(doc as unknown as TaxDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
    };
    return listWithCount(taxModel, mongoFilter, page, limit, mapTax);
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await taxModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapTax(doc as unknown as TaxDoc);
  },
};

export const periodRepo: PeriodRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await periodModel.create({ tenantId, ...payload } as unknown as FiscalPeriodDoc);
      return mapPeriod(doc.toObject() as unknown as FiscalPeriodDoc);
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
    const doc = await periodModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapPeriod(doc as unknown as FiscalPeriodDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.status !== undefined ? { status: filter.status } : {}),
    };
    return listWithCount(periodModel, mongoFilter, page, limit, mapPeriod);
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await periodModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapPeriod(doc as unknown as FiscalPeriodDoc);
  },

  async hasOverlap(tenantId, startsAt, endsAt) {
    // Solape clásico: existente.startsAt < nuevo.endsAt Y
    // existente.endsAt > nuevo.startsAt (toques de borde NO solapan).
    const doc = await periodModel
      .findOne({ tenantId, startsAt: { $lt: endsAt }, endsAt: { $gt: startsAt } })
      .select('_id')
      .lean();
    return doc !== null;
  },

  async findCovering(tenantId, date) {
    const doc = await periodModel
      .findOne({ tenantId, startsAt: { $lte: date }, endsAt: { $gte: date } })
      .sort({ startsAt: -1 })
      .lean();
    return doc === null ? null : mapPeriod(doc as unknown as FiscalPeriodDoc);
  },
};

export const journalRepo: JournalRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await journalModel.create({ tenantId, ...payload } as unknown as JournalEntryDoc);
      return mapJournalEntry(doc.toObject() as unknown as JournalEntryDoc);
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
    const doc = await journalModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapJournalEntry(doc as unknown as JournalEntryDoc);
  },

  list(tenantId, filter, page, limit) {
    const mongoFilter: Record<string, unknown> = {
      tenantId,
      ...(filter.status !== undefined ? { status: filter.status } : {}),
      ...(filter.accountId !== undefined ? { 'lines.accountId': oid(filter.accountId) } : {}),
      ...(filter.periodId !== undefined ? { periodId: oid(filter.periodId) } : {}),
    };
    return listWithCount(journalModel, mongoFilter, page, limit, mapJournalEntry);
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await journalModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId },
        { $set: set as Record<string, never> },
        { returnDocument: 'after' },
      )
      .lean();
    return doc === null ? null : mapJournalEntry(doc as unknown as JournalEntryDoc);
  },
};
