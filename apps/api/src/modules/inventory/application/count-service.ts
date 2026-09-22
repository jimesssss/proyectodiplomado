import { nextDocumentNumber } from '../../../core/numbering/numbering.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import {
  toPublicInventoryCount,
  type CountLine,
  type CountStatus,
  type PublicInventoryCount,
} from '../domain/entities/stock-documents.js';
import {
  canArchive,
  canCountTransition,
  canRestore,
  COUNT_PREFIX,
  isEditable,
} from '../domain/rules/inventory-rules.js';
import { countRepo, stockRepo } from '../infrastructure/repositories/inventory-repository.js';
import { assertProductActive } from './product-service.js';
import { assertWarehouseActive, recordMovement } from './stock-service.js';

/**
 * Casos de uso de Conteo físico (FASE 11). `tenantId` SIEMPRE del JWT
 * (ADR-002); FKs inexistentes/ajenas → 404 uniforme. Solo borradores
 * editables (409). La aprobación SOLO vía `POST /inventory/counts/:id/approve`
 * con `stock.count:approve` — un `PATCH {status:'approved'}` recibe 409
 * `'Approval requires the approve endpoint'`. Al aprobar, cada línea ajusta el
 * saldo al conteo contado con un movimiento `count_adjustment` (±) que guarda
 * sistema/contado en su `reason`.
 */

export interface CreateCountInput {
  readonly warehouseId: string;
  readonly lines: readonly CountLine[];
  readonly notes?: string | undefined;
}

export interface PatchCountInput {
  readonly warehouseId?: string | undefined;
  readonly lines?: readonly CountLine[] | undefined;
  readonly notes?: string | null | undefined;
  readonly status?: CountStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface CountListQuery {
  readonly page: number;
  readonly limit: number;
  readonly status?: CountStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface CountPage {
  readonly items: readonly PublicInventoryCount[];
  readonly total: number;
}

async function assertLines(tenantId: string, lines: readonly CountLine[]): Promise<void> {
  for (const line of lines) {
    await assertProductActive(tenantId, line.productId);
  }
}

export async function createCount(
  tenantId: string,
  input: CreateCountInput,
): Promise<PublicInventoryCount> {
  await assertWarehouseActive(tenantId, input.warehouseId);
  await assertLines(tenantId, input.lines);
  const number = await nextDocumentNumber(tenantId, 'stock.count', COUNT_PREFIX);
  const count = await countRepo.create(tenantId, {
    number,
    warehouseId: input.warehouseId,
    lines: input.lines.map((line) => ({
      productId: line.productId,
      countedQty: line.countedQty,
    })),
    status: 'draft',
    notes: input.notes ?? null,
  });
  return toPublicInventoryCount(count);
}

export async function listCounts(tenantId: string, query: CountListQuery): Promise<CountPage> {
  const filter = {
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.archived !== undefined ? { archived: query.archived } : {}),
  };
  const page = await countRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicInventoryCount), total: page.total };
}

export async function getCount(tenantId: string, id: string): Promise<PublicInventoryCount> {
  const count = await countRepo.findById(tenantId, id);
  if (count === null) {
    throw new NotFoundError();
  }
  return toPublicInventoryCount(count);
}

/** Campos de negocio (todo salvo `status` y `archived`): solo en borrador. */
const BUSINESS_FIELDS = new Set(['warehouseId', 'lines', 'notes']);

export async function updateCount(
  tenantId: string,
  id: string,
  input: PatchCountInput,
): Promise<PublicInventoryCount> {
  const current = await countRepo.findById(tenantId, id);
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

  if (input.warehouseId !== undefined) {
    await assertWarehouseActive(tenantId, input.warehouseId);
    set.warehouseId = input.warehouseId;
  }
  if (input.lines !== undefined) {
    await assertLines(tenantId, input.lines);
    set.lines = input.lines.map((line) => ({
      productId: line.productId,
      countedQty: line.countedQty,
    }));
  }
  if (input.notes !== undefined) {
    set.notes = input.notes === null ? null : input.notes.trim();
  }

  if (input.status !== undefined) {
    if (input.status === 'approved') {
      // La aprobación exige permiso PROPIO y endpoint PROPIO (como en Sales).
      throw new ConflictError('Approval requires the approve endpoint');
    }
    if (input.status === current.status) {
      throw new ConflictError('Status is already the requested one');
    }
    if (!canCountTransition(current.status, input.status)) {
      throw new ConflictError('Invalid status transition');
    }
    set.status = input.status;
  }

  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Count is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Count is not archived');
    }
    set.archived = input.archived;
  }

  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await countRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicInventoryCount(updated);
}

/**
 * Aprobación (`stock.count:approve`): congela el conteo (`approved`) y aplica
 * las diferencias `contado − sistema` como movimientos `count_adjustment`.
 * Diferencia 0 → sin movimiento. Orden: leer saldos → escribir estado →
 * aplicar ajustes (pre-chequeo implícito: |diff| ≤ sistema en la lectura; la
 * ventana sin transacciones es un riesgo documentado).
 */
export async function approveCount(tenantId: string, id: string): Promise<PublicInventoryCount> {
  const current = await countRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (current.status !== 'draft') {
    throw new ConflictError('Only draft counts can be approved');
  }
  if (!canCountTransition(current.status, 'approved')) {
    throw new ConflictError('Invalid status transition');
  }

  // 1) Leer sistema y planificar (sin escribir aún).
  const plan: readonly { line: CountLine; systemQty: number; diff: number }[] = await Promise.all(
    current.lines.map(async (line) => {
      const systemQty = await stockRepo.getBalance(tenantId, line.productId, current.warehouseId);
      return { line, systemQty, diff: line.countedQty - systemQty };
    }),
  );

  // 2) Congelar el estado.
  const approved = await countRepo.update(tenantId, id, { status: 'approved' });
  if (approved === null) {
    throw new NotFoundError();
  }

  // 3) Aplicar las diferencias al ledger.
  for (const entry of plan) {
    if (entry.diff === 0) {
      continue;
    }
    await recordMovement({
      tenantId,
      productId: entry.line.productId,
      warehouseId: current.warehouseId,
      type: 'count_adjustment',
      delta: entry.diff,
      sourceType: 'stock.count',
      sourceId: id,
      reason: `Count ${current.number}: system ${entry.systemQty}, counted ${entry.line.countedQty}`,
    });
  }

  return toPublicInventoryCount(approved);
}

/**
 * DELETE NO está publicado para conteos (el catálogo no define
 * `stock.count:delete`): el archivado es `PATCH {archived}` con
 * `stock.count:update`. Implementación del contrato de la fábrica CRUD.
 */
export async function archiveCount(tenantId: string, id: string): Promise<PublicInventoryCount> {
  const current = await countRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Count is already archived');
  }
  const archived = await countRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicInventoryCount(archived);
}
