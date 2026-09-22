/**
 * Asiento contable (FASE 12): partida doble con líneas embebidas (misma
 * decisión de diseño que las líneas de Sales/Purchasing — ver desviación
 * documentada en `docs/database/accounting.md`). Invariante DEBIT=CREDIT
 * validado SIEMPRE en el servidor (create, PATCH de líneas y al postear →
 * 422 `DOMAIN_ERROR`). La publicación usa endpoint/permiso PROPIO
 * (`POST /:id/post` con `accounting.journal:post`), como
 * `sales.quote:approve` y `stock.count:approve`.
 */

export interface JournalLine {
  readonly accountId: string;
  readonly description: string | null;
  /** Importe en DEBE (≥ 0; XOR con `credit` — exactamente uno > 0). */
  readonly debit: number;
  /** Importe en HABER (≥ 0; XOR con `debit`). */
  readonly credit: number;
}

export const JOURNAL_STATUSES = ['draft', 'posted', 'cancelled'] as const;
export type JournalStatus = (typeof JOURNAL_STATUSES)[number];

export interface JournalEntry {
  readonly id: string;
  readonly tenantId: string;
  /** Secuencial `JE-YYYY-000001` por tenant+año, inmutable. */
  readonly number: string;
  /** Fecha contable (día del período fiscal resuelto al postear). */
  readonly date: Date;
  readonly currency: string;
  readonly lines: readonly JournalLine[];
  readonly debitTotal: number;
  readonly creditTotal: number;
  readonly status: JournalStatus;
  /** Período fiscal resuelto al postear (`null` mientras es borrador). */
  readonly periodId: string | null;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`). Sin `archived`:
 * los asientos se descartan cancelándolos, no archivándolos. */
export interface PublicJournalEntry {
  readonly id: string;
  readonly number: string;
  readonly date: Date;
  readonly currency: string;
  readonly lines: readonly JournalLine[];
  readonly debitTotal: number;
  readonly creditTotal: number;
  readonly status: JournalStatus;
  readonly periodId: string | null;
  readonly reference: string | null;
  readonly notes: string | null;
}

export function toPublicJournalEntry(entry: JournalEntry): PublicJournalEntry {
  return {
    id: entry.id,
    number: entry.number,
    date: entry.date,
    currency: entry.currency,
    lines: entry.lines,
    debitTotal: entry.debitTotal,
    creditTotal: entry.creditTotal,
    status: entry.status,
    periodId: entry.periodId,
    reference: entry.reference,
    notes: entry.notes,
  };
}
