import { atomic } from '../../../core/db/transaction.js';
import { nextDocumentNumber } from '../../../core/numbering/numbering.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import {
  PURCHASE_PREFIX,
  toPublicPurchaseDocument,
  type PublicPurchaseDocument,
  type PurchaseKind,
  type PurchaseLine,
  type PurchaseStatus,
} from '../domain/entities/purchase-document.js';
import {
  canArchive,
  canRestore,
  canTransition,
  computeTotals,
  isEditable,
  normalizeCurrency,
  normalizePurchaseLines,
  validateCurrency,
  type PurchaseLineInput,
} from '../domain/rules/purchase-rules.js';
import {
  purchaseRepo,
  type PurchaseListFilter,
} from '../infrastructure/repositories/purchase-repository.js';
// FKs de Organization/Inventory + posting a stock (composición FASE 11).
// Purchasing → Inventory, pero NUNCA al revés: sin ciclos de módulos.
import {
  assertProductActive,
  assertWarehouseActive,
  postReceiptToStock,
} from '../../inventory/index.js';
import { getSupplier } from './supplier-service.js';

/**
 * Casos de uso de documentos de compra (FASE 10). Parametrizados por `kind`:
 * UN servicio para los 5 documentos (misma forma y ciclo de vida), con las
 * diferencias de cada tipo en `PURCHASE_REFS`/`PURCHASE_REQUIRES_SUPPLIER`.
 * `tenantId` SIEMPRE del JWT (ADR-002); FKs inexistentes/ajenas → 404 uniforme.
 * Solo los borradores son editables más allá de su estado; los importes se
 * recalculan SIEMPRE en el servidor (2 decimales). Aprobar una solicitud es
 * un PATCH de estado (`purchase.request:update`): el catálogo no define
 * permiso `:approve` para compras.
 */

export interface CreatePurchaseInput {
  readonly lines: readonly PurchaseLineInput[];
  readonly supplierId?: string | undefined;
  readonly currency?: string | undefined;
  readonly issueDate?: Date | undefined;
  readonly notes?: string | undefined;
  readonly requestId?: string | undefined;
  readonly orderId?: string | undefined;
  readonly invoiceId?: string | undefined;
  /** Almacén destino — obligatorio SOLO en recepciones (FK Organization). */
  readonly warehouseId?: string | undefined;
}

export interface PatchPurchaseInput {
  readonly lines?: readonly PurchaseLineInput[] | undefined;
  readonly supplierId?: string | undefined;
  readonly currency?: string | undefined;
  readonly issueDate?: Date | undefined;
  readonly notes?: string | null | undefined;
  readonly requestId?: string | null | undefined;
  readonly orderId?: string | null | undefined;
  readonly invoiceId?: string | null | undefined;
  readonly warehouseId?: string | undefined;
  readonly status?: PurchaseStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface PurchaseListQuery {
  readonly page: number;
  readonly limit: number;
  readonly archived?: boolean | undefined;
  readonly status?: PurchaseStatus | undefined;
  readonly supplierId?: string | undefined;
  readonly orderId?: string | undefined;
  readonly requestId?: string | undefined;
  readonly invoiceId?: string | undefined;
}

export interface PurchasePage {
  readonly items: readonly PublicPurchaseDocument[];
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
async function assertPurchaseExists(
  tenantId: string,
  kind: PurchaseKind,
  id: string,
): Promise<PublicPurchaseDocument> {
  return getPurchase(tenantId, kind, id);
}

/** Vínculos `productId` de líneas de recepción (404 ajeno / 409 archivado). */
async function assertReceiptProducts(
  tenantId: string,
  lines: readonly PurchaseLine[],
): Promise<void> {
  for (const line of lines) {
    if (line.productId !== null) {
      await assertProductActive(tenantId, line.productId);
    }
  }
}

export async function createPurchase(
  tenantId: string,
  kind: PurchaseKind,
  input: CreatePurchaseInput,
): Promise<PublicPurchaseDocument> {
  // --- Proveedor (la recepción lo deriva de la orden) ---
  let supplierId: string;
  if (kind === 'goods.receipt') {
    if (input.orderId === undefined) {
      throw new ValidationError('orderId is required for a goods receipt');
    }
    const order = await assertPurchaseExists(tenantId, 'purchase.order', input.orderId);
    supplierId = order.supplierId;
  } else {
    if (input.supplierId === undefined) {
      throw new ValidationError('supplierId is required');
    }
    await getSupplier(tenantId, input.supplierId); // 404 si no existe o es de otro tenant
    supplierId = input.supplierId;
  }

  // --- Almacén destino (SOLO recepción; inexistente/ajeno → 404, archivado → 409) ---
  let warehouseId: string | null = null;
  if (kind === 'goods.receipt') {
    if (input.warehouseId === undefined) {
      throw new ValidationError('warehouseId is required for a goods receipt');
    }
    await assertWarehouseActive(tenantId, input.warehouseId);
    warehouseId = input.warehouseId;
  }

  // --- Referencias del tipo (todas del mismo tenant → 404 uniforme) ---
  if (input.requestId !== undefined) {
    await assertPurchaseExists(tenantId, 'purchase.request', input.requestId);
  }
  if (input.orderId !== undefined && kind !== 'goods.receipt') {
    await assertPurchaseExists(tenantId, 'purchase.order', input.orderId);
  }
  if (input.invoiceId !== undefined) {
    await assertPurchaseExists(tenantId, 'supplier.invoice', input.invoiceId);
  }

  const issueDate = input.issueDate ?? new Date();
  const lines = normalizePurchaseLines(input.lines);
  if (kind === 'goods.receipt') {
    await assertReceiptProducts(tenantId, lines);
  }
  const totals = computeTotals(lines);
  // Numeración atómica por tenant+tipo+año (core/numbering).
  const number = await nextDocumentNumber(tenantId, kind, PURCHASE_PREFIX[kind]);

  const payload: Record<string, unknown> = {
    kind,
    number,
    supplierId,
    status: 'draft',
    currency: input.currency === undefined ? 'USD' : assertCurrency(input.currency),
    issueDate,
    lines: [...lines],
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,
    notes: input.notes ?? null,
    requestId: input.requestId ?? null,
    orderId: input.orderId ?? null,
    invoiceId: input.invoiceId ?? null,
    warehouseId,
  };
  const purchase = await purchaseRepo.create(tenantId, payload);
  return toPublicPurchaseDocument(purchase);
}

export async function listPurchases(
  tenantId: string,
  kind: PurchaseKind,
  query: PurchaseListQuery,
): Promise<PurchasePage> {
  const filter: PurchaseListFilter = {
    kind,
    ...(query.archived !== undefined ? { archived: query.archived } : {}),
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.supplierId !== undefined ? { supplierId: query.supplierId } : {}),
    ...(query.orderId !== undefined ? { orderId: query.orderId } : {}),
    ...(query.requestId !== undefined ? { requestId: query.requestId } : {}),
    ...(query.invoiceId !== undefined ? { invoiceId: query.invoiceId } : {}),
  };
  const page = await purchaseRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicPurchaseDocument), total: page.total };
}

export async function getPurchase(
  tenantId: string,
  kind: PurchaseKind,
  id: string,
): Promise<PublicPurchaseDocument> {
  const purchase = await purchaseRepo.findById(tenantId, kind, id);
  if (purchase === null) {
    throw new NotFoundError();
  }
  return toPublicPurchaseDocument(purchase);
}

/** Campos de negocio (todo salvo `status` y `archived`): solo en borrador. */
const BUSINESS_FIELDS = new Set([
  'lines',
  'supplierId',
  'currency',
  'issueDate',
  'notes',
  'requestId',
  'orderId',
  'invoiceId',
  'warehouseId',
]);

export async function updatePurchase(tenantId:string,kind:PurchaseKind,id:string,input:PatchPurchaseInput):Promise<PublicPurchaseDocument> {
  if(kind==='goods.receipt'&&input.status==='posted') return atomic(()=>updatePurchaseInternal(tenantId,kind,id,input),false);
  return updatePurchaseInternal(tenantId,kind,id,input);
}
async function updatePurchaseInternal(
  tenantId: string,
  kind: PurchaseKind,
  id: string,
  input: PatchPurchaseInput,
): Promise<PublicPurchaseDocument> {
  const current = await purchaseRepo.findById(tenantId, kind, id);
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
    const lines: PurchaseLine[] = [...normalizePurchaseLines(input.lines)];
    if (kind === 'goods.receipt') {
      await assertReceiptProducts(tenantId, lines);
    }
    const totals = computeTotals(lines);
    set.lines = [...lines];
    set.subtotal = totals.subtotal;
    set.tax = totals.tax;
    set.total = totals.total;
  }
  if (input.warehouseId !== undefined) {
    // Solo recepciones admiten el campo (esquestricto por tipo) — borrador.
    await assertWarehouseActive(tenantId, input.warehouseId);
    set.warehouseId = input.warehouseId;
  }
  if (input.supplierId !== undefined) {
    await getSupplier(tenantId, input.supplierId);
    set.supplierId = input.supplierId;
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
  if (input.requestId !== undefined) {
    if (input.requestId !== null) {
      await assertPurchaseExists(tenantId, 'purchase.request', input.requestId);
    }
    set.requestId = input.requestId;
  }
  if (input.orderId !== undefined) {
    if (input.orderId !== null) {
      const order = await assertPurchaseExists(tenantId, 'purchase.order', input.orderId);
      // La orden fija el proveedor de la recepción.
      if (kind === 'goods.receipt') {
        set.supplierId = order.supplierId;
      }
    }
    set.orderId = input.orderId;
  }
  if (input.invoiceId !== undefined) {
    if (input.invoiceId !== null) {
      await assertPurchaseExists(tenantId, 'supplier.invoice', input.invoiceId);
    }
    set.invoiceId = input.invoiceId;
  }

  if (input.status !== undefined) {
    if (input.status === current.status) {
      throw new ConflictError('Status is already the requested one');
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
  const updated = await purchaseRepo.update(tenantId, kind, id, set, current.status);
  if (updated === null) {
    throw new NotFoundError();
  }
  // Recepción a `posted` (terminal) → alimenta el stock en Inventory (FASE 11).
  // El estado terminal es la guarda de at-most-once sin transacciones: solo las
  // líneas con `productId` vinculado crean movimiento; el resto se omiten.
  if (kind === 'goods.receipt' && set.status === 'posted') {
    await postReceiptToStock({
      tenantId,
      id: updated.id,
      number: updated.number,
      warehouseId: updated.warehouseId,
      lines: updated.lines,
    });
  }
  return toPublicPurchaseDocument(updated);
}

/** DELETE = soft-delete: marca `archived` (doble archive → 409). */
export async function archivePurchase(
  tenantId: string,
  kind: PurchaseKind,
  id: string,
): Promise<PublicPurchaseDocument> {
  const current = await purchaseRepo.findById(tenantId, kind, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Document is already archived');
  }
  const archived = await purchaseRepo.update(tenantId, kind, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicPurchaseDocument(archived);
}
