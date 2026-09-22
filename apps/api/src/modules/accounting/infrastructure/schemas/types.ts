import type { Types } from 'mongoose';
import type { Account } from '../../domain/entities/account.js';
import type { PeriodStatus } from '../../domain/entities/fiscal-period.js';
import type { JournalLine, JournalStatus } from '../../domain/entities/journal-entry.js';
import type { Tax } from '../../domain/entities/tax.js';

/** Maestro de cuenta contable (`accounts`) — escrito solo por este módulo.
 * `nature` se ALMACENA; el saldo normal se deriva al salir (nunca se guarda). */
export interface AccountDoc extends Omit<Account, 'id'> {
  _id: Types.ObjectId;
}

/** Maestro de impuesto (`taxes`) — escrito solo por este módulo. */
export interface TaxDoc extends Omit<Tax, 'id'> {
  _id: Types.ObjectId;
}

/**
 * Asiento contable (`journalEntries`) — líneas EMBEBIDAS (desviación
 * documentada de `database.md`, misma decisión que FASE 9 con
 * `salesOrderLines`). `periodId` se escribe solo al postear.
 */
export interface JournalEntryDoc {
  _id: Types.ObjectId;
  tenantId: string;
  /** Secuencial `JE-YYYY-000001` por tenant+año, inmutable. */
  number: string;
  date: Date;
  currency: string;
  lines: JournalLine[];
  debitTotal: number;
  creditTotal: number;
  status: JournalStatus;
  periodId?: Types.ObjectId | null;
  reference?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Período fiscal (`fiscalPeriods`) — fechas inmutables, sin `archived`. */
export interface FiscalPeriodDoc {
  _id: Types.ObjectId;
  tenantId: string;
  code: string;
  name?: string | null;
  startsAt: Date;
  endsAt: Date;
  status: PeriodStatus;
  createdAt: Date;
  updatedAt: Date;
}
