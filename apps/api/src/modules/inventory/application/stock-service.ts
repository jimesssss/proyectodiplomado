import { ConflictError, DomainError, NotFoundError } from '../../../core/errors/app-error.js';
import { getOrgUnit } from '../../../modules/organization/index.js';
import {
  toPublicStockBalance,
  toPublicStockMovement,
  type ManualMovementType,
  type MovementSourceType,
  type MovementType,
  type PublicStockBalance,
  type PublicStockMovement,
} from '../domain/entities/stock.js';
import { stockRepo } from '../infrastructure/repositories/inventory-repository.js';
import { assertProductActive } from './product-service.js';

/**
 * Casos de uso de stock (FASE 11): saldos proyectados + ledger append-only.
 * `tenantId` SIEMPRE del JWT (ADR-002). El saldo solo cambia aplicando un
 * movimiento y NUNCA puede quedar negativo: la salida se aplica con guardia
 * atómica (`qty ≥ −delta` en el filtro del propio update → 422 `DOMAIN_ERROR`
 * si no alcanza). Sin transacciones Mongo (standalone): el saldo se escribe
 * ANTES que su movimiento — riesgo documentado en `docs/api/inventory.md`.
 */

export interface StockPage {
  readonly items: readonly PublicStockBalance[];
  readonly total: number;
}

export interface MovementPage {
  readonly items: readonly PublicStockMovement[];
  readonly total: number;
}

export interface BalanceListQuery {
  readonly page: number;
  readonly limit: number;
  readonly productId?: string | undefined;
  readonly warehouseId?: string | undefined;
}

export interface MovementListQuery extends BalanceListQuery {
  readonly type?: MovementType | undefined;
}

export interface CreateManualMovementInput {
  readonly productId: string;
  readonly warehouseId: string;
  readonly type: ManualMovementType;
  readonly quantity: number;
  readonly reason: string;
}

/** Input estructural del posting de recepción (desacoplado de Purchasing). */
export interface ReceiptPostingInput {
  readonly tenantId: string;
  readonly id: string;
  readonly number: string;
  readonly warehouseId: string | null;
  readonly lines: readonly { readonly productId: string | null; readonly quantity: number }[];
}

/**
 * FK de almacén (maestro de Organization): inexistente o de otro tenant →
 * 404 uniforme; archivado → 409 (no se mueve stock a un almacén fuera de uso).
 */
export async function assertWarehouseActive(tenantId: string, warehouseId: string): Promise<void> {
  const warehouse = await getOrgUnit(tenantId, 'warehouse', warehouseId);
  if (warehouse.status === 'archived') {
    throw new ConflictError('Warehouse is archived');
  }
}

export interface RecordMovementInput {
  readonly tenantId: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly type: MovementType;
  /** Cantidad CON SIGNO: positiva = entrada, negativa = salida. */
  readonly delta: number;
  readonly sourceType?: MovementSourceType | undefined;
  readonly sourceId?: string | undefined;
  readonly reason?: string | undefined;
}

/**
 * Núcleo del ledger: aplica el delta al saldo (guardia atómica) y registra el
 * movimiento con el saldo resultante. Una salida insuficiente → 422 ANTES de
 * tocar nada. Compartido por manuales, transferencias, conteos y recepciones.
 */
export async function recordMovement(input: RecordMovementInput): Promise<PublicStockMovement> {
  const qtyAfter = await stockRepo.applyDelta(
    input.tenantId,
    input.productId,
    input.warehouseId,
    input.delta,
  );
  if (qtyAfter === null) {
    const available = await stockRepo.getBalance(
      input.tenantId,
      input.productId,
      input.warehouseId,
    );
    throw new DomainError('Insufficient stock', {
      productId: input.productId,
      warehouseId: input.warehouseId,
      available,
      required: -input.delta,
    });
  }
  const movement = await stockRepo.createMovement(input.tenantId, {
    productId: input.productId,
    warehouseId: input.warehouseId,
    type: input.type,
    qty: input.delta,
    balanceAfter: qtyAfter,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    reason: input.reason ?? null,
  });
  return toPublicStockMovement(movement);
}

export async function createManualMovement(
  tenantId: string,
  input: CreateManualMovementInput,
): Promise<PublicStockMovement> {
  await assertProductActive(tenantId, input.productId);
  await assertWarehouseActive(tenantId, input.warehouseId);
  const delta = input.type === 'manual_in' ? input.quantity : -input.quantity;
  return recordMovement({
    tenantId,
    productId: input.productId,
    warehouseId: input.warehouseId,
    type: input.type,
    delta,
    reason: input.reason,
  });
}

export async function listBalances(tenantId: string, query: BalanceListQuery): Promise<StockPage> {
  const filter = {
    ...(query.productId !== undefined ? { productId: query.productId } : {}),
    ...(query.warehouseId !== undefined ? { warehouseId: query.warehouseId } : {}),
  };
  const page = await stockRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicStockBalance), total: page.total };
}

export async function listMovements(
  tenantId: string,
  query: MovementListQuery,
): Promise<MovementPage> {
  const filter = {
    ...(query.productId !== undefined ? { productId: query.productId } : {}),
    ...(query.warehouseId !== undefined ? { warehouseId: query.warehouseId } : {}),
    ...(query.type !== undefined ? { type: query.type } : {}),
  };
  const page = await stockRepo.listMovements(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicStockMovement), total: page.total };
}

export async function getMovement(tenantId: string, id: string): Promise<PublicStockMovement> {
  const movement = await stockRepo.getMovement(tenantId, id);
  if (movement === null) {
    throw new NotFoundError();
  }
  return toPublicStockMovement(movement);
}

/**
 * Posting de recepción de compra (FASE 10 → FASE 11): por cada línea con
 * `productId` vinculado registra una entrada `receipt` en el almacén de la
 * recepción. Líneas sin producto se omiten (solo trazabilidad textual).
 * Llamado desde Purchasing al pasar `goods.receipt` a `posted` — el estado
 * `posted` (terminal) es la guarda de at-most-once sin transacciones.
 */
export async function postReceiptToStock(input: ReceiptPostingInput): Promise<void> {
  if (input.warehouseId === null) {
    return; // defensivo: las recepciones siempre llevan almacén (validado en create)
  }
  for (const line of input.lines) {
    if (line.productId === null) {
      continue;
    }
    await recordMovement({
      tenantId: input.tenantId,
      productId: line.productId,
      warehouseId: input.warehouseId,
      type: 'receipt',
      delta: line.quantity,
      sourceType: 'goods.receipt',
      sourceId: input.id,
      reason: `Goods receipt ${input.number}`,
    });
  }
}
