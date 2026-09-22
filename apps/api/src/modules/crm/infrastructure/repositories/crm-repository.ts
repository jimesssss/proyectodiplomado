import { Types, type Model } from 'mongoose';
import { ConflictError } from '../../../../core/errors/app-error.js';
import type { Activity } from '../../domain/entities/activity.js';
import type { Customer } from '../../domain/entities/customer.js';
import type { Contact } from '../../domain/entities/contact.js';
import type { Lead } from '../../domain/entities/lead.js';
import type { Opportunity } from '../../domain/entities/opportunity.js';
import {
  ActivityModel,
  ContactModel,
  CustomerModel,
  LeadModel,
  OpportunityModel,
} from '../schemas/collections.js';
import type {
  ActivityDoc,
  ContactDoc,
  CrmDocBase,
  CustomerDoc,
  LeadDoc,
  OpportunityDoc,
} from '../schemas/types.js';

/**
 * Repositorio CRM — único camino a MongoDB del módulo.
 * UNA implementación genérica parametrizada por entidad (evita duplicar la
 * lógica de 5 colecciones) + registro explícito de cada modelo.
 * TODA operación filtra por `tenantId` (nunca llega del cliente, ADR-002).
 * Único punto de casteo: el `payload`/`set` de create/update (polimórfico).
 */

export interface CrmListFilter {
  readonly archived?: boolean | undefined;
  readonly status?: string | undefined;
  readonly stage?: string | undefined;
  readonly customerId?: string | undefined;
  readonly leadId?: string | undefined;
  readonly opportunityId?: string | undefined;
}

export interface CrmListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface CrmRepo<T> {
  create(tenantId: string, payload: Record<string, unknown>): Promise<T>;
  findById(tenantId: string, id: string): Promise<T | null>;
  findByCode(tenantId: string, code: string): Promise<T | null>;
  list(
    tenantId: string,
    filter: CrmListFilter,
    page: number,
    limit: number,
  ): Promise<CrmListPage<T>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<T | null>;
  /** Búsqueda literal (regex escapada) en los campos indicados, limitada. */
  search(tenantId: string, pattern: RegExp, limit: number): Promise<readonly T[]>;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function buildFilter(tenantId: string, filter: CrmListFilter): Record<string, unknown> {
  return {
    tenantId,
    ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
    ...(filter.status !== undefined ? { status: filter.status } : {}),
    ...(filter.stage !== undefined ? { stage: filter.stage } : {}),
    ...(filter.customerId !== undefined
      ? { customerId: new Types.ObjectId(filter.customerId) }
      : {}),
    ...(filter.leadId !== undefined ? { leadId: new Types.ObjectId(filter.leadId) } : {}),
    ...(filter.opportunityId !== undefined
      ? { opportunityId: new Types.ObjectId(filter.opportunityId) }
      : {}),
  };
}

function createRepo<TDoc extends CrmDocBase, T>(
  model: Model<TDoc>,
  map: (doc: TDoc) => T,
  searchFields: readonly string[],
): CrmRepo<T> {
  return {
    async create(tenantId, payload) {
      try {
        const doc = await model.create({
          tenantId,
          archived: false,
          ...payload,
        } as unknown as TDoc);
        return map(doc.toObject() as unknown as TDoc);
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new ConflictError('Code already in use');
        }
        throw error;
      }
    },

    async findById(tenantId, id) {
      if (!Types.ObjectId.isValid(id)) {
        return null;
      }
      const doc = await model.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
      return doc === null ? null : map(doc as unknown as TDoc);
    },

    async findByCode(tenantId, code) {
      const doc = await model.findOne({ tenantId, code }).lean();
      return doc === null ? null : map(doc as unknown as TDoc);
    },

    async list(tenantId, filter, page, limit) {
      const skip = (page - 1) * limit;
      const mongoFilter = buildFilter(tenantId, filter);
      const [docs, total] = await Promise.all([
        model.find(mongoFilter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
        model.countDocuments(mongoFilter),
      ]);
      return {
        items: docs.map((doc) => map(doc as unknown as TDoc)),
        total,
      };
    },

    async update(tenantId, id, set) {
      if (!Types.ObjectId.isValid(id)) {
        return null;
      }
      const doc = await model
        .findOneAndUpdate(
          { _id: new Types.ObjectId(id), tenantId },
          { $set: set as Record<string, never> },
          { returnDocument: 'after' },
        )
        .lean();
      return doc === null ? null : map(doc as unknown as TDoc);
    },

    async search(tenantId, pattern, limit) {
      const docs = await model
        .find({
          tenantId,
          $or: searchFields.map((field) => ({ [field]: pattern })),
        })
        .limit(limit)
        .lean();
      return docs.map((doc) => map(doc as unknown as TDoc));
    },
  };
}

// --- Mappers (doc → entidad de dominio) ---

function optional(value: string | null | undefined): string | null {
  return value ?? null;
}

function mapCustomer(doc: CustomerDoc): Customer {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    code: doc.code,
    name: doc.name,
    type: doc.type,
    email: optional(doc.email),
    phone: optional(doc.phone),
    taxId: optional(doc.taxId),
    address: doc.address ?? null,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapContact(doc: ContactDoc): Contact {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    customerId: doc.customerId.toString(),
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: optional(doc.email),
    phone: optional(doc.phone),
    jobTitle: optional(doc.jobTitle),
    isPrimary: doc.isPrimary,
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapLead(doc: LeadDoc): Lead {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    name: doc.name,
    source: doc.source,
    email: optional(doc.email),
    phone: optional(doc.phone),
    notes: optional(doc.notes),
    status: doc.status,
    customerId:
      doc.customerId === undefined || doc.customerId === null ? null : doc.customerId.toString(),
    assignedTo: optional(doc.assignedTo),
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapOpportunity(doc: OpportunityDoc): Opportunity {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    name: doc.name,
    customerId: doc.customerId.toString(),
    stage: doc.stage,
    amount: doc.amount,
    currency: doc.currency,
    expectedCloseDate: doc.expectedCloseDate ?? null,
    lostReason: optional(doc.lostReason),
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapActivity(doc: ActivityDoc): Activity {
  const link = (value: Types.ObjectId | null | undefined): string | null =>
    value === undefined || value === null ? null : value.toString();
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    type: doc.type,
    subject: doc.subject,
    notes: optional(doc.notes),
    dueAt: doc.dueAt ?? null,
    completed: doc.completed,
    completedAt: doc.completedAt ?? null,
    customerId: link(doc.customerId),
    leadId: link(doc.leadId),
    opportunityId: link(doc.opportunityId),
    assignedTo: optional(doc.assignedTo),
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// --- Registro explícito: modelo mongoose ↔ entidad de dominio ---

export const customerRepo: CrmRepo<Customer> = createRepo(CustomerModel, mapCustomer, [
  'name',
  'code',
]);
export const contactRepo: CrmRepo<Contact> = createRepo(ContactModel, mapContact, [
  'firstName',
  'lastName',
]);
export const leadRepo: CrmRepo<Lead> = createRepo(LeadModel, mapLead, ['name', 'email']);
export const opportunityRepo: CrmRepo<Opportunity> = createRepo(OpportunityModel, mapOpportunity, [
  'name',
]);
export const activityRepo: CrmRepo<Activity> = createRepo(ActivityModel, mapActivity, ['subject']);

/**
 * Regla "un principal por cliente": al marcar un contacto como principal,
 * se degradan los demás DEL MISMO cliente (nunca de otros tenants).
 */
export async function demoteOtherPrimaries(
  tenantId: string,
  customerId: string,
  excludeId: string | null,
): Promise<void> {
  await ContactModel.updateMany(
    {
      tenantId,
      customerId: new Types.ObjectId(customerId),
      isPrimary: true,
      ...(excludeId !== null ? { _id: { $ne: new Types.ObjectId(excludeId) } } : {}),
    },
    { $set: { isPrimary: false } },
  );
}
