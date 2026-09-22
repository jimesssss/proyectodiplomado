import { nextDocumentNumber } from '../../../core/numbering/numbering.js';
import {
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
} from '../../../core/errors/app-error.js';
import {
  toPublicStockTransfer,
  type PublicStockTransfer,
  type TransferLine,
  type TransferStatus,
} from '../domain/entities/stock-documents.js';
import {
  canArchive,
  canRestore,
  canTransferTransition,
  isEditable,
  TRANSFER_PREFIX,
} from '../domain/rules/inventory-rules.js';
import { stockRepo, transferRepo } from '../infrastructure/repositories/inventory-repository.js';
import { assertProductActive } from './product-service.js';
import { assertWarehouseActive, recordMovement } from './stock-service.js';

/**
 * Casos de uso de Transferencias (FASE 11). `tenantId` SIEMPRE del JWT
 * (ADR-002); FKs inexistentes/ajenas → 404 uniforme. Solo los borradores son
 * editables más allá de su estado (409). El stock se mueve SOLO al
 * `completed`: primero un pre-chequeo de saldo (422 sin escribir nada), luego
 * el estado, y por último `transfer_out`/`transfer_in` en el ledger.
 * Sin transacciones Mongo (standalone): la ventana estado↔ledger es un riesgo
 * documentado en `docs/api/inventory.md`.
 */

export interface CreateTransferInput {
  readonly fromWarehouseId: string;
  readonly toWarehouseId: string;
  readonly lines: readonly TransferLine[];
  readonly notes?: string | undefined;
}

export interface PatchTransferInput {
  readonly fromWarehouseId?: string | undefined;
  readonly toWarehouseId?: string | undefined;
  readonly lines?: readonly TransferLine[] | undefined;
  readonly notes?: string | null | undefined;
  readonly status?: TransferStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface TransferListQuery {
  readonly page: number;
  readonly limit: number;
  readonly status?: TransferStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface TransferPage {
  readonly items: readonly PublicStockTransfer[];
  readonly total: number;
}

async function assertLines(
  tenantId: string,
  lines: readonly TransferLine[],
): Promise<readonly TransferLine[]> {
  for (const line of lines) {
    await assertProductActive(tenantId, line.productId);
  }
  return lines;
}

function assertDistinctWarehouses(fromWarehouseId: string, toWarehouseId: string): void {
  if (fromWarehouseId === toWarehouseId) {
    throw new ValidationError('fromWarehouseId and toWarehouseId must differ');
  }
}

export async function createTransfer(
  tenantId: string,
  input: CreateTransferInput,
): Promise<PublicStockTransfer> {
  assertDistinctWarehouses(input.fromWarehouseId, input.toWarehouseId);
  await assertWarehouseActive(tenantId, input.fromWarehouseId);
  await assertWarehouseActive(tenantId, input.toWarehouseId);
  await assertLines(tenantId, input.lines);
  const number = await nextDocumentNumber(tenantId, 'stock.transfer', TRANSFER_PREFIX);
  const transfer = await transferRepo.create(tenantId, {
    number,
    fromWarehouseId: input.fromWarehouseId,
    toWarehouseId: input.toWarehouseId,
    lines: input.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
    })),
    status: 'draft',
    notes: input.notes ?? null,
  });
  return toPublicStockTransfer(transfer);
}

export async function listTransfers(
  tenantId: string,
  query: TransferListQuery,
): Promise<TransferPage> {
  const filter = {
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.archived !== undefined ? { archived: query.archived } : {}),
  };
  const page = await transferRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicStockTransfer), total: page.total };
}

export async function getTransfer(tenantId: string, id: string): Promise<PublicStockTransfer> {
  const transfer = await transferRepo.findById(tenantId, id);
  if (transfer === null) {
    throw new NotFoundError();
  }
  return toPublicStockTransfer(transfer);
}

/** Campos de negocio (todo salvo `status` y `archived`): solo en borrador. */
const BUSINESS_FIELDS = new Set(['fromWarehouseId', 'toWarehouseId', 'lines', 'notes']);

export async function updateTransfer(
  tenantId: string,
  id: string,
  input: PatchTransferInput,
): Promise<PublicStockTransfer> {
  const current = await transferRepo.findById(tenantId, id);
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

  if (input.fromWarehouseId !== undefined) {
    await assertWarehouseActive(tenantId, input.fromWarehouseId);
    set.fromWarehouseId = input.fromWarehouseId;
  }
  if (input.toWarehouseId !== undefined) {
    await assertWarehouseActive(tenantId, input.toWarehouseId);
    set.toWarehouseId = input.toWarehouseId;
  }
  if (
    set.fromWarehouseId !== undefined &&
    set.toWarehouseId !== undefined &&
    set.fromWarehouseId === set.toWarehouseId
  ) {
    throw new ValidationError('fromWarehouseId and toWarehouseId must differ');
  }
  if (input.lines !== undefined) {
    set.lines = (await assertLines(tenantId, input.lines)).map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
    }));
  }
  if (input.notes !== undefined) {
    set.notes = input.notes === null ? null : input.notes.trim();
  }

  if (input.status !== undefined) {
    if (input.status === current.status) {
      throw new ConflictError('Status is already the requested one');
    }
    if (!canTransferTransition(current.status, input.status)) {
      throw new ConflictError('Invalid status transition');
    }
    if (input.status === 'completed') {
      // Pre-chequeo de saldo para TODAS las líneas antes de escribir nada:
      // transferencia insuficiente → 422 sin estado ni movimientos parciales.
      for (const line of current.lines) {
        const available = await stockRepo.getBalance(
          tenantId,
          line.productId,
          current.fromWarehouseId,
        );
        if (available < line.quantity) {
          throw new DomainError('Insufficient stock', {
            productId: line.productId,
            warehouseId: current.fromWarehouseId,
            available,
            required: line.quantity,
          });
        }
      }
    }
    set.status = input.status;
  }

  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Transfer is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Transfer is not archived');
    }
    set.archived = input.archived;
  }

  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }

  const updated = await transferRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }

  // Estado `completed` confirmado → mover stock (salida origen + entrada destino).
  if (set.status === 'completed') {
    for (const line of current.lines) {
      await recordMovement({
        tenantId,
        productId: line.productId,
        warehouseId: current.fromWarehouseId,
        type: 'transfer_out',
        delta: -line.quantity,
        sourceType: 'stock.transfer',
        sourceId: id,
        reason: `Transfer ${current.number}`,
      });
      await recordMovement({
        tenantId,
        productId: line.productId,
        warehouseId: current.toWarehouseId,
        type: 'transfer_in',
        delta: line.quantity,
        sourceType: 'stock.transfer',
        sourceId: id,
        reason: `Transfer ${current.number}`,
      });
    }
  }

  return toPublicStockTransfer(updated);
}

/**
 * DELETE NO está publicado para transferencias (el catálogo no define
 * `stock.transfer:delete`): el archivado es `PATCH {archived}` con
 * `stock.transfer:update`. Esta función queda como implementación del contrato
 * de la fábrica CRUD.
 */
export async function archiveTransfer(tenantId: string, id: string): Promise<PublicStockTransfer> {
  const current = await transferRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Transfer is already archived');
  }
  const archived = await transferRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicStockTransfer(archived);
}
