import { nextDocumentNumber } from '../../../core/numbering/numbering.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import { getCustomer, getOpportunity } from '../../crm/index.js';
import {
  SALE_PREFIX,
  toPublicSaleDocument,
  type PublicSaleDocument,
  type SaleKind,
  type SaleLine,
  type SaleStatus,
} from '../domain/entities/sale-document.js';
import {
  canArchive,
  canRestore,
  canTransition,
  computeTotals,
  isEditable,
  normalizeCurrency,
  normalizeLines,
  validateCurrency,
  type SaleLineInput,
} from '../domain/rules/sales-rules.js';
import { saleRepo, type SaleListFilter } from '../infrastructure/repositories/sales-repository.js';

/**
 * Casos de uso de documentos de venta (FASE 9). Parametrizados por `kind`:
 * UN servicio para los 5 documentos (misma forma y ciclo de vida), con las
 * diferencias de cada tipo en `SALE_REFS`/`SALE_REQUIRES_CUSTOMER`.
 * `tenantId` SIEMPRE del JWT (ADR-002); FKs inexistentes/ajenas → 404 uniforme.
 * Solo los borradores son editables más allá de su estado; los importes se
 * recalculan SIEMPRE en el servidor (2 decimales).
 */

export interface CreateSaleInput {
  readonly lines: readonly SaleLineInput[];
  readonly customerId?: string | undefined;
  readonly currency?: string | undefined;
  readonly issueDate?: Date | undefined;
  readonly notes?: string | undefined;
  readonly opportunityId?: string | undefined;
  readonly quoteId?: string | undefined;
  readonly orderId?: string | undefined;
  readonly invoiceId?: string | undefined;
  readonly validUntil?: Date | undefined;
}

export interface PatchSaleInput {
  readonly lines?: readonly SaleLineInput[] | undefined;
  readonly customerId?: string | undefined;
  readonly currency?: string | undefined;
  readonly issueDate?: Date | undefined;
  readonly notes?: string | null | undefined;
  readonly opportunityId?: string | null | undefined;
  readonly quoteId?: string | null | undefined;
  readonly orderId?: string | null | undefined;
  readonly invoiceId?: string | null | undefined;
  readonly validUntil?: Date | null | undefined;
  readonly status?: SaleStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface SaleListQuery {
  readonly page: number;
  readonly limit: number;
  readonly archived?: boolean | undefined;
  readonly status?: SaleStatus | undefined;
  readonly customerId?: string | undefined;
  readonly orderId?: string | undefined;
  readonly quoteId?: string | undefined;
  readonly invoiceId?: string | undefined;
  readonly opportunityId?: string | undefined;
}

export interface SalePage {
  readonly items: readonly PublicSaleDocument[];
  readonly total: number;
}

function assertCurrency(currency: string): string {
  const check = validateCurrency(currency);
  if (!check.valid) {
    throw new ValidationError('Invalid currency', { issues: check.issues });
  }
  return normalizeCurrency(currency);
}

/** FK de un documento del MISMO tenant (inexistente/ajeno → 404 uniforme). */
async function assertSaleExists(
  tenantId: string,
  kind: SaleKind,
  id: string,
): Promise<PublicSaleDocument> {
  // Reutiliza el caso de uso getSale (filtra tenantId + kind).
  return getSale(tenantId, kind, id);
}

export async function createSale(
  tenantId: string,
  kind: SaleKind,
  input: CreateSaleInput,
): Promise<PublicSaleDocument> {
  // --- Cliente (el envío lo deriva del pedido) ---
  let customerId: string;
  if (kind === 'sales.delivery') {
    if (input.orderId === undefined) {
      throw new ValidationError('orderId is required for a delivery');
    }
    const order = await assertSaleExists(tenantId, 'sales.order', input.orderId);
    customerId = order.customerId;
  } else {
    if (input.customerId === undefined) {
      throw new ValidationError('customerId is required');
    }
    await getCustomer(tenantId, input.customerId); // 404 si no existe o es de otro tenant
    customerId = input.customerId;
  }

  // --- Referencias del tipo (todas del mismo tenant → 404 uniforme) ---
  if (input.opportunityId !== undefined) {
    await getOpportunity(tenantId, input.opportunityId);
  }
  if (input.quoteId !== undefined) {
    await assertSaleExists(tenantId, 'sales.quote', input.quoteId);
  }
  if (input.orderId !== undefined && kind !== 'sales.delivery') {
    await assertSaleExists(tenantId, 'sales.order', input.orderId);
  }
  if (input.invoiceId !== undefined) {
    await assertSaleExists(tenantId, 'sales.invoice', input.invoiceId);
  }
  if (kind !== 'sales.quote' && input.validUntil !== undefined) {
    throw new ValidationError('validUntil is only allowed on quotes');
  }

  const issueDate = input.issueDate ?? new Date();
  if (kind === 'sales.quote' && input.validUntil !== undefined && input.validUntil <= issueDate) {
    throw new ValidationError('validUntil must be after issueDate');
  }

  const lines = normalizeLines(input.lines);
  const totals = computeTotals(lines);
  // Numeración atómica por tenant+tipo+año (core/numbering).
  const number = await nextDocumentNumber(tenantId, kind, SALE_PREFIX[kind]);

  const payload: Record<string, unknown> = {
    kind,
    number,
    customerId,
    status: 'draft',
    currency: input.currency === undefined ? 'USD' : assertCurrency(input.currency),
    issueDate,
    lines: [...lines],
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,
    notes: input.notes ?? null,
    opportunityId: input.opportunityId ?? null,
    quoteId: input.quoteId ?? null,
    orderId: input.orderId ?? null,
    invoiceId: input.invoiceId ?? null,
    validUntil: kind === 'sales.quote' ? (input.validUntil ?? null) : null,
  };
  const sale = await saleRepo.create(tenantId, payload);
  return toPublicSaleDocument(sale);
}

export async function listSales(
  tenantId: string,
  kind: SaleKind,
  query: SaleListQuery,
): Promise<SalePage> {
  const filter: SaleListFilter = {
    kind,
    ...(query.archived !== undefined ? { archived: query.archived } : {}),
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.customerId !== undefined ? { customerId: query.customerId } : {}),
    ...(query.orderId !== undefined ? { orderId: query.orderId } : {}),
    ...(query.quoteId !== undefined ? { quoteId: query.quoteId } : {}),
    ...(query.invoiceId !== undefined ? { invoiceId: query.invoiceId } : {}),
    ...(query.opportunityId !== undefined ? { opportunityId: query.opportunityId } : {}),
  };
  const page = await saleRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicSaleDocument), total: page.total };
}

export async function getSale(
  tenantId: string,
  kind: SaleKind,
  id: string,
): Promise<PublicSaleDocument> {
  const sale = await saleRepo.findById(tenantId, kind, id);
  if (sale === null) {
    throw new NotFoundError();
  }
  return toPublicSaleDocument(sale);
}

/** Campos de negocio (todo salvo `status` y `archived`): solo en borrador. */
const BUSINESS_FIELDS = new Set([
  'lines',
  'customerId',
  'currency',
  'issueDate',
  'notes',
  'opportunityId',
  'quoteId',
  'orderId',
  'invoiceId',
  'validUntil',
]);

export async function updateSale(
  tenantId: string,
  kind: SaleKind,
  id: string,
  input: PatchSaleInput,
): Promise<PublicSaleDocument> {
  const current = await saleRepo.findById(tenantId, kind, id);
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
    const lines: SaleLine[] = [...normalizeLines(input.lines)];
    const totals = computeTotals(lines);
    set.lines = [...lines];
    set.subtotal = totals.subtotal;
    set.tax = totals.tax;
    set.total = totals.total;
  }
  if (input.customerId !== undefined) {
    await getCustomer(tenantId, input.customerId);
    set.customerId = input.customerId;
  }
  if (input.currency !== undefined) {
    set.currency = assertCurrency(input.currency);
  }
  if (input.issueDate !== undefined) {
    set.issueDate = input.issueDate;
  }
  if (input.notes !== undefined) {
    set.notes = input.notes === null ? null : input.notes.trim();
  }
  if (input.opportunityId !== undefined) {
    if (input.opportunityId !== null) {
      await getOpportunity(tenantId, input.opportunityId);
    }
    set.opportunityId = input.opportunityId;
  }
  if (input.quoteId !== undefined) {
    if (input.quoteId !== null) {
      await assertSaleExists(tenantId, 'sales.quote', input.quoteId);
    }
    set.quoteId = input.quoteId;
  }
  if (input.orderId !== undefined) {
    if (input.orderId !== null) {
      await assertSaleExists(tenantId, 'sales.order', input.orderId);
      // El pedido fija el cliente del envío.
      if (kind === 'sales.delivery') {
        const order = await assertSaleExists(tenantId, 'sales.order', input.orderId);
        set.customerId = order.customerId;
      }
    }
    set.orderId = input.orderId;
  }
  if (input.invoiceId !== undefined) {
    if (input.invoiceId !== null) {
      await assertSaleExists(tenantId, 'sales.invoice', input.invoiceId);
    }
    set.invoiceId = input.invoiceId;
  }
  if (input.validUntil !== undefined) {
    if (kind !== 'sales.quote') {
      throw new ValidationError('validUntil is only allowed on quotes');
    }
    if (input.validUntil !== null) {
      const issueDate = (set.issueDate as Date | undefined) ?? current.issueDate;
      if (input.validUntil <= issueDate) {
        throw new ValidationError('validUntil must be after issueDate');
      }
    }
    set.validUntil = input.validUntil;
  }

  if (input.status !== undefined) {
    if (input.status === current.status) {
      throw new ConflictError('Status is already the requested one');
    }
    if (input.status === 'approved') {
      // La aprobación exige el endpoint y el permiso `sales.quote:approve`.
      throw new ConflictError('Approval requires the approve endpoint');
    }
    if (!canTransition(kind, current.status, input.status)) {
      throw new ConflictError('Invalid status transition');
    }
    set.status = input.status;
  }

  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Document is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Document is not archived');
    }
    set.archived = input.archived;
  }

  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await saleRepo.update(tenantId, kind, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicSaleDocument(updated);
}

/** DELETE = soft-delete: marca `archived` (doble archive → 409). */
export async function archiveSale(
  tenantId: string,
  kind: SaleKind,
  id: string,
): Promise<PublicSaleDocument> {
  const current = await saleRepo.findById(tenantId, kind, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Document is already archived');
  }
  const archived = await saleRepo.update(tenantId, kind, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicSaleDocument(archived);
}

/**
 * Aprobación de cotización (solo `sent`; graba `approvedBy`/`approvedAt`).
 * Se expone en `POST /sales/quotes/:id/approve` con `sales.quote:approve`.
 */
export async function approveQuote(
  tenantId: string,
  id: string,
  approverUserId: string,
): Promise<PublicSaleDocument> {
  const current = await saleRepo.findById(tenantId, 'sales.quote', id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (current.status !== 'sent') {
    throw new ConflictError('Only sent quotes can be approved');
  }
  const updated = await saleRepo.update(tenantId, 'sales.quote', id, {
    status: 'approved',
    approvedBy: approverUserId,
    approvedAt: new Date(),
  });
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicSaleDocument(updated);
}
