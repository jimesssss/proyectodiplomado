/**
 * Ledger de tesorería (FASE 13): `cashMovements` APPEND-ONLY — la única
 * fuente de verdad del movimiento de dinero, espejo de `stockMovements`
 * (FASE 11). `balanceAfter` es el saldo de la cuenta TRAS aplicar este
 * movimiento; `sourceType/sourceId` enlazan el documento que lo originó
 * (único por tenant → la BD garantiza 1 movimiento por origen). Solo
 * CRECE: no existen PATCH/DELETE (rutas ausentes → 404).
 */

export const CASH_MOVEMENT_SOURCE_TYPES = ['opening', 'payment', 'receipt'] as const;
export type CashMovementSourceType = (typeof CASH_MOVEMENT_SOURCE_TYPES)[number];

export interface CashMovement {
  readonly id: string;
  readonly tenantId: string;
  readonly accountId: string;
  /** Con signo: + entrada (receipt/opening), − salida (payment). */
  readonly amount: number;
  /** Saldo de la cuenta tras aplicar este movimiento. */
  readonly balanceAfter: number;
  readonly sourceType: CashMovementSourceType;
  readonly sourceId: string;
  readonly reason: string;
  /** Sin `updatedAt`: nada se reescribe. */
  readonly createdAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`). */
export interface PublicCashMovement {
  readonly id: string;
  readonly accountId: string;
  readonly amount: number;
  readonly balanceAfter: number;
  readonly sourceType: CashMovementSourceType;
  readonly sourceId: string;
  readonly reason: string;
  readonly createdAt: Date;
}

export function toPublicCashMovement(movement: CashMovement): PublicCashMovement {
  return {
    id: movement.id,
    accountId: movement.accountId,
    amount: movement.amount,
    balanceAfter: movement.balanceAfter,
    sourceType: movement.sourceType,
    sourceId: movement.sourceId,
    reason: movement.reason,
    createdAt: movement.createdAt,
  };
}
