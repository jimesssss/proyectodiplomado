/**
 * Dominio Inventory — saldo actual y ledger de movimientos (FASE 11).
 *
 * - `stock` es la PROYECCIÓN del saldo por (tenant, producto, almacén).
 * - `stockMovements` es el LEDGER append-only: cada movimiento guarda el saldo
 *   resultante (`balanceAfter`) y de dónde vino (`sourceType`/`sourceId`).
 * El saldo NUNCA se edita a mano: solo cambia aplicando un movimiento.
 */

/** Tipos de movimiento. El cliente solo puede crear los MANUALES. */
export const MOVEMENT_TYPES = [
  'receipt', // recepción de compra (posting de goods.receipt, FASE 10/11)
  'manual_in', // entrada manual explícita
  'manual_out', // salida manual explícita
  'transfer_in', // transferencia: llegada al destino
  'transfer_out', // transferencia: salida del origen
  'count_adjustment', // diferencia de conteo físico (±)
  'production_in', // producción: producto terminado (completar orden, FASE 16)
  'production_out', // producción: consumo de componentes (completar orden, FASE 16)
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Subconjunto admisible en `POST /inventory/movements` (validador estricto). */
export const MANUAL_MOVEMENT_TYPES = ['manual_in', 'manual_out'] as const;
export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

/** Sistema de origen de un movimiento (trazabilidad). */
export type MovementSourceType =
  'goods.receipt' | 'stock.transfer' | 'stock.count' | 'production.order';

export interface StockBalance {
  readonly id: string;
  readonly tenantId: string;
  readonly productId: string;
  readonly warehouseId: string;
  /** Saldo actual (puede ser 0; nunca negativo — invariante del módulo). */
  readonly qty: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface StockMovement {
  readonly id: string;
  readonly tenantId: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly type: MovementType;
  /** Cantidad con SIGNO: positiva = entrada, negativa = salida. */
  readonly qty: number;
  /** Saldo del (producto, almacén) DESPUÉS de aplicar este movimiento. */
  readonly balanceAfter: number;
  /** Documento de origen (receipt/transfer/count) — null en manuales. */
  readonly sourceType: MovementSourceType | null;
  readonly sourceId: string | null;
  readonly reason: string | null;
  readonly createdAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicStockBalance {
  readonly id: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly qty: number;
}

export interface PublicStockMovement {
  readonly id: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly type: MovementType;
  readonly qty: number;
  readonly balanceAfter: number;
  readonly sourceType: MovementSourceType | null;
  readonly sourceId: string | null;
  readonly reason: string | null;
  readonly createdAt: Date;
}

export function toPublicStockBalance(balance: StockBalance): PublicStockBalance {
  return {
    id: balance.id,
    productId: balance.productId,
    warehouseId: balance.warehouseId,
    qty: balance.qty,
  };
}

export function toPublicStockMovement(movement: StockMovement): PublicStockMovement {
  return {
    id: movement.id,
    productId: movement.productId,
    warehouseId: movement.warehouseId,
    type: movement.type,
    qty: movement.qty,
    balanceAfter: movement.balanceAfter,
    sourceType: movement.sourceType,
    sourceId: movement.sourceId,
    reason: movement.reason,
    createdAt: movement.createdAt,
  };
}
