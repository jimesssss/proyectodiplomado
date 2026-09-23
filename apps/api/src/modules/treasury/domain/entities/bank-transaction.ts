/**
 * Línea de estado de cuenta bancario (FASE 13): registro EXTERNO del banco
 * (depósitos/retiros con importe con signo). NO mueve el saldo interno — el
 * dinero interno solo se mueve con `payment`/`receipt`; estas líneas existen
 * para RECONCILIARLAS contra el ledger (`cashMovements`). Sin máquina de
 * estados ni `archived`: `reconciliationId` lo pone SOLO el servidor al
 * incluirla en una conciliación (intentar escribirlo → 400).
 */

export interface BankTransaction {
  readonly id: string;
  readonly tenantId: string;
  readonly accountId: string;
  readonly date: Date;
  /** Con signo: + depósito, − retiro (≠ 0). */
  readonly amount: number;
  /** Referencia del banco (externalId), opcional. */
  readonly externalId: string | null;
  readonly description: string | null;
  /** Conciliación que la incluye (`null` = pendiente). Server-only. */
  readonly reconciliationId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`). */
export interface PublicBankTransaction {
  readonly id: string;
  readonly accountId: string;
  readonly date: Date;
  readonly amount: number;
  readonly externalId: string | null;
  readonly description: string | null;
  readonly reconciliationId: string | null;
  /** Derivado: ya está en alguna conciliación. */
  readonly reconciled: boolean;
}

export function toPublicBankTransaction(tx: BankTransaction): PublicBankTransaction {
  return {
    id: tx.id,
    accountId: tx.accountId,
    date: tx.date,
    amount: tx.amount,
    externalId: tx.externalId,
    description: tx.description,
    reconciliationId: tx.reconciliationId,
    reconciled: tx.reconciliationId !== null,
  };
}
