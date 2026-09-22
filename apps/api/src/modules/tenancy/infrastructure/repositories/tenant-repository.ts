import { Types } from 'mongoose';
import { ConflictError, NotFoundError } from '../../../../core/errors/app-error.js';
import type { Tenant, TenantStatus } from '../../domain/entities/tenant.js';
import { TenantModel } from '../schemas/collections.js';
import type { TenantDoc } from '../schemas/types.js';

/**
 * Repositorio de tenancy — único camino a MongoDB del módulo.
 * Esta colección es global (la raíz): NO filtra por `tenantId`; en su lugar,
 * su `_id` es el `tenantId` que sí usan todos los demás módulos.
 */

function toTenant(doc: TenantDoc): Tenant {
  return {
    id: doc._id.toString(),
    slug: doc.slug,
    name: doc.name,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function findTenantById(id: string): Promise<Tenant | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  const doc = await TenantModel.findById(id).lean();
  return doc === null ? null : toTenant(doc as unknown as TenantDoc);
}

export async function findTenantBySlug(slug: string): Promise<Tenant | null> {
  const doc = await TenantModel.findOne({ slug: slug.toLowerCase().trim() }).lean();
  return doc === null ? null : toTenant(doc as unknown as TenantDoc);
}

export async function insertTenant(input: { slug: string; name: string }): Promise<Tenant> {
  try {
    const doc = await TenantModel.create({ slug: input.slug, name: input.name });
    return toTenant(doc.toObject() as unknown as TenantDoc);
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new ConflictError('Slug already in use');
    }
    throw error;
  }
}

/** Borrado físico: solo como compensación del provisioning sin transacción. */
export async function deleteTenantById(id: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Tenant not found');
  }
  await TenantModel.deleteOne({ _id: new Types.ObjectId(id) });
}

export async function updateTenantName(id: string, name: string): Promise<Tenant | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  const doc = await TenantModel.findOneAndUpdate(
    { _id: new Types.ObjectId(id) },
    { $set: { name } },
    { returnDocument: 'after' },
  ).lean();
  return doc === null ? null : toTenant(doc as unknown as TenantDoc);
}

export async function setTenantStatus(id: string, status: TenantStatus): Promise<Tenant | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  const doc = await TenantModel.findOneAndUpdate(
    { _id: new Types.ObjectId(id) },
    { $set: { status } },
    { returnDocument: 'after' },
  ).lean();
  return doc === null ? null : toTenant(doc as unknown as TenantDoc);
}

export interface TenantPage {
  readonly items: readonly Tenant[];
  readonly total: number;
}

export async function listTenants(page: number, limit: number): Promise<TenantPage> {
  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    TenantModel.find().sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    TenantModel.countDocuments(),
  ]);
  return {
    items: docs.map((doc) => toTenant(doc as unknown as TenantDoc)),
    total,
  };
}
