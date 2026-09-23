/**
 * Conciliación bancaria (FASE 13): documento `REC-*` que empareja líneas del
 * estado de cuenta (`bankTransactions`) con registros internos (`cashMovements`,
 * opcional). Al crear/MODIFICAR líneas el servidor marca/desmarca las
 * transacciones (`reconciliationId`) con validación previa de todo el set
 * (ya conciliada en OTRA doc → 409). Sin `:delete` y sin máquina de estados:
 * las líneas se corrigen REEMPLAZÁNDOLAS en `PATCH` (re-validadas), no
 * archivándolas.
 */

export interface ReconciliationLine {
  readonly bankTransactionId: string;
  /** Registro del ledger emparejado (opcional; debe ser de MISMA cuenta). */
  readonly movementId: string | null;
}

export interface Reconciliation {
  readonly id: string;
  readonly tenantId: string;
  /** Secuencial `REC-YYYY-000001` por tenant+año, inmutable. */
  readonly number: string;
  readonly accountId: string;
  readonly reconciledAt: Date;
  readonly lines: readonly ReconciliationLine[];
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`). */
export interface PublicReconciliation {
  readonly id: string;
  readonly number: string;
  readonly accountId: string;
  readonly reconciledAt: Date;
  readonly lines: readonly ReconciliationLine[];
  readonly notes: string | null;
}

export function toPublicReconciliation(recon: Reconciliation): PublicReconciliation {
  return {
    id: recon.id,
    number: recon.number,
    accountId: recon.accountId,
    reconciledAt: recon.reconciledAt,
    lines: recon.lines,
    notes: recon.notes,
  };
}
