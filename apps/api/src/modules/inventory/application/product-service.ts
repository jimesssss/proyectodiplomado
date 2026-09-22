import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import { toPublicProduct, type PublicProduct } from '../domain/entities/product.js';
import {
  canArchive,
  canRestore,
  normalizeCode,
  roundMoney,
  validateCode,
} from '../domain/rules/inventory-rules.js';
import { productRepo } from '../infrastructure/repositories/inventory-repository.js';

/**
 * Casos de uso del maestro de Producto. `tenantId` SIEMPRE viene del JWT
 * (ADR-002). `code` único por tenant e inmutable; DELETE = soft-delete.
 */

export interface CreateProductInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly unit?: string | undefined;
  readonly cost?: number | undefined;
  readonly price?: number | undefined;
  readonly minStock?: number | undefined;
}

export interface PatchProductInput {
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly unit?: string | undefined;
  readonly cost?: number | null | undefined;
  readonly price?: number | null | undefined;
  readonly minStock?: number | null | undefined;
  readonly archived?: boolean | undefined;
}

export interface ProductListQuery {
  readonly page: number;
  readonly limit: number;
  readonly archived?: boolean | undefined;
}

export interface ProductPage {
  readonly items: readonly PublicProduct[];
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

export async function createProduct(
  tenantId: string,
  input: CreateProductInput,
): Promise<PublicProduct> {
  const payload: Record<string, unknown> = {
    code: assertCode(input.code),
    name: input.name.trim(),
    unit: (input.unit ?? 'unit').trim(),
  };
  if (input.description !== undefined) {
    payload.description = input.description.trim();
  }
  if (input.cost !== undefined) {
    payload.cost = roundMoney(input.cost);
  }
  if (input.price !== undefined) {
    payload.price = roundMoney(input.price);
  }
  if (input.minStock !== undefined) {
    payload.minStock = input.minStock;
  }
  // Duplicado (tenantId, code) → 409 por índice único (también en repo).
  const product = await productRepo.create(tenantId, payload);
  return toPublicProduct(product);
}

export async function listProducts(
  tenantId: string,
  query: ProductListQuery,
): Promise<ProductPage> {
  const filter = query.archived !== undefined ? { archived: query.archived } : {};
  const page = await productRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicProduct), total: page.total };
}

export async function getProduct(tenantId: string, id: string): Promise<PublicProduct> {
  const product = await productRepo.findById(tenantId, id);
  if (product === null) {
    throw new NotFoundError();
  }
  return toPublicProduct(product);
}

export async function updateProduct(
  tenantId: string,
  id: string,
  input: PatchProductInput,
): Promise<PublicProduct> {
  const current = await productRepo.findById(tenantId, id);
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
  if (input.unit !== undefined) {
    set.unit = input.unit.trim();
  }
  if (input.cost !== undefined) {
    set.cost = input.cost === null ? null : roundMoney(input.cost);
  }
  if (input.price !== undefined) {
    set.price = input.price === null ? null : roundMoney(input.price);
  }
  if (input.minStock !== undefined) {
    set.minStock = input.minStock;
  }
  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Product is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Product is not archived');
    }
    set.archived = input.archived;
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await productRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicProduct(updated);
}

/** DELETE = soft-delete: marca `archived` (doble archive → 409). */
export async function archiveProduct(tenantId: string, id: string): Promise<PublicProduct> {
  const current = await productRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Product is already archived');
  }
  const archived = await productRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicProduct(archived);
}

/**
 * FK de producto para otros servicios del módulo (movimientos/transferencias/
 * conteos): inexistente o de otro tenant → 404 uniforme; archivado → 409.
 */
export async function assertProductActive(
  tenantId: string,
  productId: string,
): Promise<PublicProduct> {
  const product = await getProduct(tenantId, productId);
  if (product.archived) {
    throw new ConflictError('Product is archived');
  }
  return product;
}
