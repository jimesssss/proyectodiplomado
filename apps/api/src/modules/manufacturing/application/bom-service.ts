import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
// FK de producto (composición FASE 11): Manufacturing → Inventory, nunca al revés.
import { assertProductActive } from '../../inventory/index.js';
import { toPublicBom, type BomLine, type PublicBom } from '../domain/entities/bom.js';
import {
  canArchive,
  canRestore,
  normalizeBomCode,
  validateBomCode,
  validateComponentLines,
} from '../domain/rules/manufacturing-rules.js';
import {
  bomRepo,
  type BomListFilter,
} from '../infrastructure/repositories/manufacturing-repository.js';

/**
 * Casos de uso del maestro de BOM (FASE 16). `tenantId` SIEMPRE del JWT
 * (ADR-002); FKs inexistentes/ajenas → 404 uniforme y archivadas → 409.
 * `code` es la clave natural: normalizada, inmutable (no aparece en el PATCH
 * → cualquier intento → 400 por esquema estricto) y única por tenant (409).
 */

export interface CreateBomInput {
  readonly code: string;
  readonly name: string;
  readonly productId: string;
  readonly lines: readonly BomLine[];
}

export interface PatchBomInput {
  readonly name?: string | undefined;
  readonly productId?: string | undefined;
  readonly lines?: readonly BomLine[] | undefined;
  readonly archived?: boolean | undefined;
}

export interface BomListQuery {
  readonly page: number;
  readonly limit: number;
  readonly archived?: boolean | undefined;
}

export interface BomPage {
  readonly items: readonly PublicBom[];
  readonly total: number;
}

function assertCode(code: string): string {
  const normalized = normalizeBomCode(code);
  const check = validateBomCode(normalized);
  if (!check.valid) {
    throw new ValidationError('Invalid code', { issues: check.issues });
  }
  return normalized;
}

function toLinePayload(lines: readonly BomLine[]): Array<{ productId: string; quantity: number }> {
  return lines.map((line) => ({ productId: line.productId, quantity: line.quantity }));
}

export async function createBom(tenantId: string, input: CreateBomInput): Promise<PublicBom> {
  const payload: Record<string, unknown> = {
    code: assertCode(input.code),
    name: input.name.trim(),
  };
  // FK del producto terminado (inexistente/ajeno → 404; archivado → 409).
  await assertProductActive(tenantId, input.productId);
  payload.productId = input.productId;
  const check = validateComponentLines(input.productId, input.lines);
  if (!check.valid) {
    throw new ValidationError('Invalid component lines', { issues: check.issues });
  }
  for (const line of input.lines) {
    await assertProductActive(tenantId, line.productId);
  }
  payload.lines = toLinePayload(input.lines);
  // Duplicado (tenantId, code) → 409 por índice único (también en repo).
  const bom = await bomRepo.create(tenantId, payload);
  return toPublicBom(bom);
}

export async function listBoms(tenantId: string, query: BomListQuery): Promise<BomPage> {
  const filter: BomListFilter = { archived: query.archived };
  const page = await bomRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicBom), total: page.total };
}

export async function getBom(tenantId: string, id: string): Promise<PublicBom> {
  const bom = await bomRepo.findById(tenantId, id);
  if (bom === null) {
    throw new NotFoundError();
  }
  return toPublicBom(bom);
}

export async function updateBom(
  tenantId: string,
  id: string,
  input: PatchBomInput,
): Promise<PublicBom> {
  const current = await bomRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  const set: Record<string, unknown> = {};

  if (input.name !== undefined) {
    set.name = input.name.trim();
  }
  if (input.productId !== undefined) {
    await assertProductActive(tenantId, input.productId);
    set.productId = input.productId;
  }
  if (input.lines !== undefined) {
    for (const line of input.lines) {
      // La actualización explícita re-valida TODOS sus componentes.
      await assertProductActive(tenantId, line.productId);
    }
    set.lines = toLinePayload(input.lines);
  }
  if (input.productId !== undefined || input.lines !== undefined) {
    // Las reglas necesitan el par EFECTIVO (producto + líneas): el patch puede
    // cambiar ambos a la vez (p. ej. el nuevo producto no debe ser componente).
    const effectiveOutput = input.productId !== undefined ? input.productId : current.productId;
    const effectiveLines = input.lines ?? current.lines;
    const check = validateComponentLines(effectiveOutput, effectiveLines);
    if (!check.valid) {
      throw new ValidationError('Invalid component lines', { issues: check.issues });
    }
  }
  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('BOM is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('BOM is not archived');
    }
    set.archived = input.archived;
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await bomRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicBom(updated);
}

/**
 * DELETE NO está publicado para BOMs (el catálogo no define `bom:delete`):
 * el archivado es `PATCH {archived}` con `bom:update`. Esta función queda como
 * implementación del contrato de la fábrica CRUD.
 */
export async function archiveBom(tenantId: string, id: string): Promise<PublicBom> {
  const current = await bomRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('BOM is already archived');
  }
  const archived = await bomRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicBom(archived);
}
