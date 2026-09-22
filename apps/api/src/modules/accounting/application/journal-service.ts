import { nextDocumentNumber } from '../../../core/numbering/numbering.js';
import {
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
} from '../../../core/errors/app-error.js';
import {
  toPublicJournalEntry,
  type JournalLine,
  type JournalStatus,
  type PublicJournalEntry,
} from '../domain/entities/journal-entry.js';
import {
  canJournalTransition,
  isEditable,
  journalTotals,
  JOURNAL_PREFIX,
  normalizeCurrency,
  normalizeJournalLines,
  validateCurrency,
  type JournalLineInput,
} from '../domain/rules/accounting-rules.js';
import { journalRepo, periodRepo } from '../infrastructure/repositories/accounting-repository.js';
import { assertAccountActive } from './account-service.js';

/**
 * Casos de uso de Asientos contables (FASE 12). `tenantId` SIEMPRE del JWT
 * (ADR-002); FKs de cuenta inexistentes/ajenas → 404 uniforme, archivadas
 * → 409. Invariante DEBIT=CREDIT validado SIEMPRE en el servidor — al
 * crear, al reemplazar líneas y DEFENSIVAMENTE al postear (422 `DOMAIN_ERROR`
 * con ambos totales en `details`). Solo borradores editables (409). La
 * publicación SOLO vía `POST /accounting/journal-entries/:id/post` con el
 * permiso PROPIO `accounting.journal:post` — un `PATCH {status:'posted'}`
 * recibe 409 `'Posting requires the post endpoint'`. Al postear se resuelve
 * el período fiscal que CUBRE la fecha del asiento: sin período → 422;
 * período cerrado → 409 (la ventana estado↔período es at-most-once, como
 * el posting de recepciones — riesgo documentado).
 */

export interface CreateJournalEntryInput {
  readonly lines: readonly JournalLineInput[];
  readonly currency?: string | undefined;
  readonly date?: Date | undefined;
  readonly reference?: string | undefined;
  readonly notes?: string | undefined;
}

export interface PatchJournalEntryInput {
  readonly lines?: readonly JournalLineInput[] | undefined;
  readonly currency?: string | undefined;
  readonly date?: Date | undefined;
  readonly reference?: string | null | undefined;
  readonly notes?: string | null | undefined;
  readonly status?: JournalStatus | undefined;
}

export interface JournalListQuery {
  readonly page: number;
  readonly limit: number;
  readonly status?: JournalStatus | undefined;
  readonly accountId?: string | undefined;
  readonly periodId?: string | undefined;
}

export interface JournalPage {
  readonly items: readonly PublicJournalEntry[];
  readonly total: number;
}

function assertCurrency(currency: string): string {
  const normalized = normalizeCurrency(currency);
  const check = validateCurrency(normalized);
  if (!check.valid) {
    throw new ValidationError('Invalid currency', { issues: check.issues });
  }
  return normalized;
}

/** FK de cada línea de cuenta (404 ajeno/inexistente, 409 archivada). */
async function assertLines(tenantId: string, lines: readonly JournalLine[]): Promise<void> {
  for (const line of lines) {
    await assertAccountActive(tenantId, line.accountId);
  }
}

/**
 * Invariante de partida doble: totales redondeados iguales. Si no, 422
 * `DOMAIN_ERROR` ANTES de escribir nada (el cliente ve ambos totales).
 */
function assertBalanced(totals: { readonly debits: number; readonly credits: number }): void {
  if (totals.debits !== totals.credits) {
    throw new DomainError('Debits and credits must balance', {
      debits: totals.debits,
      credits: totals.credits,
    });
  }
}

export async function createJournalEntry(
  tenantId: string,
  input: CreateJournalEntryInput,
): Promise<PublicJournalEntry> {
  const lines = normalizeJournalLines(input.lines);
  await assertLines(tenantId, lines);
  const totals = journalTotals(lines);
  assertBalanced(totals);
  // Numeración atómica por tenant+año (core/numbering).
  const number = await nextDocumentNumber(tenantId, 'journal.entry', JOURNAL_PREFIX);
  const entry = await journalRepo.create(tenantId, {
    number,
    date: input.date ?? new Date(),
    currency: input.currency === undefined ? 'USD' : assertCurrency(input.currency),
    lines: [...lines],
    debitTotal: totals.debits,
    creditTotal: totals.credits,
    status: 'draft',
    periodId: null,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
  });
  return toPublicJournalEntry(entry);
}

export async function listJournalEntries(
  tenantId: string,
  query: JournalListQuery,
): Promise<JournalPage> {
  const filter = {
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.accountId !== undefined ? { accountId: query.accountId } : {}),
    ...(query.periodId !== undefined ? { periodId: query.periodId } : {}),
  };
  const page = await journalRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicJournalEntry), total: page.total };
}

export async function getJournalEntry(tenantId: string, id: string): Promise<PublicJournalEntry> {
  const entry = await journalRepo.findById(tenantId, id);
  if (entry === null) {
    throw new NotFoundError();
  }
  return toPublicJournalEntry(entry);
}

/** Campos de negocio (todo salvo `status`): solo en borrador. */
const BUSINESS_FIELDS = new Set(['lines', 'currency', 'date', 'reference', 'notes']);

export async function updateJournalEntry(
  tenantId: string,
  id: string,
  input: PatchJournalEntryInput,
): Promise<PublicJournalEntry> {
  const current = await journalRepo.findById(tenantId, id);
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

  if (input.lines !== undefined) {
    const lines: JournalLine[] = [...normalizeJournalLines(input.lines)];
    await assertLines(tenantId, lines);
    const totals = journalTotals(lines);
    assertBalanced(totals);
    set.lines = [...lines];
    set.debitTotal = totals.debits;
    set.creditTotal = totals.credits;
  }
  if (input.currency !== undefined) {
    set.currency = assertCurrency(input.currency);
  }
  if (input.date !== undefined) {
    set.date = input.date;
  }
  if (input.reference !== undefined) {
    set.reference = input.reference === null ? null : input.reference.trim();
  }
  if (input.notes !== undefined) {
    set.notes = input.notes === null ? null : input.notes.trim();
  }

  if (input.status !== undefined) {
    if (input.status === 'posted') {
      // La publicación exige permiso PROPIO y endpoint PROPIO (como en
      // Sales/Inventory): el cliente ve un error accionable, no un 400.
      throw new ConflictError('Posting requires the post endpoint');
    }
    if (input.status === current.status) {
      throw new ConflictError('Status is already the requested one');
    }
    if (!canJournalTransition(current.status, input.status)) {
      throw new ConflictError('Invalid status transition');
    }
    set.status = input.status;
  }

  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await journalRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicJournalEntry(updated);
}

/**
 * Publicación (`accounting.journal:post`): congela el asiento (`posted`) y
 * le asigna el período fiscal que CUBRE su fecha. Pre-chequeos ANTES de
 * escribir: sigue en borrador, totales balanceados (defensivo), período
 * existente y abierto. `posted` es terminal (guarda de at-most-once).
 */
export async function postJournalEntry(tenantId: string, id: string): Promise<PublicJournalEntry> {
  const current = await journalRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (current.status !== 'draft') {
    throw new ConflictError('Only draft journal entries can be posted');
  }
  // Defensivo: el invariante ya se validó al crear/editar, pero el servidor
  // es el único dueño del balance y lo re-verifica en todo punto de escritura.
  assertBalanced(journalTotals(current.lines));

  const period = await periodRepo.findCovering(tenantId, current.date);
  if (period === null) {
    throw new DomainError('No fiscal period covers the entry date', {
      date: current.date.toISOString(),
    });
  }
  if (period.status === 'closed') {
    throw new ConflictError('Fiscal period is closed', { period: period.code });
  }

  const posted = await journalRepo.update(tenantId, id, {
    status: 'posted',
    periodId: period.id,
  });
  if (posted === null) {
    throw new NotFoundError();
  }
  return toPublicJournalEntry(posted);
}
