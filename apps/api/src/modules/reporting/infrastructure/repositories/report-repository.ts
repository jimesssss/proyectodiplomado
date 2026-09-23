import type { PipelineStage } from 'mongoose';
import type { LowStockItem, ReportInvoiceStatus } from '../../domain/entities/report.js';
import type { UtcRange } from '../../domain/rules/report-rules.js';
import {
  READ_COLLECTIONS,
  ReportingCashMovementModel,
  ReportingLeadModel,
  ReportingOpportunityModel,
  ReportingProductModel,
  ReportingPurchaseDocumentModel,
  ReportingSalesDocumentModel,
} from '../schemas/read-models.js';

/**
 * Repositorio de Reporting (FASE 15): ÚNICO camino a MongoDB del módulo y SOLO
 * con `.aggregate()` sobre los read models `Reporting*` (nunca escribe ni
 * hidrata). Todo pipeline arranca con `tenantId` del JWT como primer filtro
 * (ADR-002); los `$lookup` fijan `tenantId` literal en SU sub-pipeline (sale
 * del JWT, no del cliente). Colecciones leídas: 10 (ver `reporting.md`);
 * escritas: 0.
 */

const SALES_INVOICE_KIND = 'sales.invoice';
const PURCHASE_INVOICE_KIND = 'supplier.invoice';

/** Fila de serie (ventas/compras): una por `period + currency`. */
export interface SeriesAggRow {
  readonly period: string;
  readonly currency: string;
  readonly count: number;
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
}

/** Fila de top (cliente/proveedor): ya partida por moneda. */
export interface TopAggRow {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly currency: string;
  readonly total: number;
  readonly count: number;
}

export interface CashFlowAggRow {
  readonly period: string;
  readonly currency: string;
  readonly inflow: number;
  readonly outflow: number;
  readonly count: number;
}

export interface InventorySummary {
  readonly products: number;
  readonly valued: number;
  readonly unpriced: number;
  readonly stockValue: number;
  readonly lowStock: number;
}

export interface StatusCountRow {
  readonly status: string;
  readonly count: number;
}

export interface StageCurrencyRow {
  readonly stage: string;
  readonly currency: string;
  readonly count: number;
  readonly amount: number;
}

export interface SalesExportRow {
  readonly number: string;
  readonly customerId: string;
  readonly customer: string;
  readonly issueDate: Date;
  readonly status: string;
  readonly currency: string;
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
}

export interface PurchasesExportRow {
  readonly number: string;
  readonly supplierId: string;
  readonly supplier: string;
  readonly issueDate: Date;
  readonly status: string;
  readonly currency: string;
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
}

export interface CashFlowExportRow {
  readonly createdAt: Date;
  readonly accountId: string;
  readonly currency: string;
  readonly sourceType: string;
  readonly amount: number;
  readonly balanceAfter: number;
  readonly reason: string;
}

export interface InventoryExportRow {
  readonly code: string;
  readonly name: string;
  readonly unit: string;
  readonly minStock: number | null;
  readonly qty: number;
  readonly cost: number | null;
  readonly value: number | null;
}

export interface CrmExportRow {
  readonly name: string;
  readonly stage: string;
  readonly currency: string;
  readonly amount: number;
  readonly expectedCloseDate: Date | null;
  readonly createdAt: Date;
}

interface InventoryFacetRow {
  readonly products: number;
  readonly valued: number;
  readonly unpriced: number;
  readonly stockValue: number;
}

interface LowStockFacet {
  readonly rows: readonly LowStockItem[];
  readonly total: readonly { readonly n: number }[];
}

function invoiceMatch(
  tenantId: string,
  kind: string,
  statuses: readonly ReportInvoiceStatus[],
  range: UtcRange,
): Record<string, unknown> {
  return {
    tenantId,
    kind,
    status: { $in: [...statuses] },
    archived: { $ne: true },
    issueDate: { $gte: range.from, $lt: range.to },
  };
}

/** `$lookup` 1:1 con `tenantId` fijado en el sub-pipeline (alias `party`). */
function partyLookup(
  fromCollection: string,
  refField: string,
  tenantId: string,
  project: Record<string, unknown>,
): PipelineStage {
  return {
    $lookup: {
      from: fromCollection,
      let: { ref: `$${refField}` },
      pipeline: [
        { $match: { $expr: { $eq: ['$_id', '$$ref'] }, tenantId } },
        { $project: { _id: 0, ...project } },
      ],
      as: 'party',
    },
  };
}

/** Saldo total del producto (`Σ qty` en TODOS los almacenes del tenant). */
function stockQtyLookup(tenantId: string): PipelineStage {
  return {
    $lookup: {
      from: READ_COLLECTIONS.stock,
      let: { productId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$productId', '$$productId'] }, tenantId } },
        { $group: { _id: null, qty: { $sum: '$qty' } } },
      ],
      as: 'stock',
    },
  };
}

function seriesProjectStage(): PipelineStage {
  return {
    $project: {
      _id: 0,
      period: '$_id.period',
      currency: '$_id.currency',
      count: 1,
      subtotal: 1,
      tax: 1,
      total: 1,
    },
  };
}

// --- Ventas ---

export async function aggregateSalesSeries(
  tenantId: string,
  range: UtcRange,
  dateFormat: string,
  statuses: readonly ReportInvoiceStatus[],
): Promise<readonly SeriesAggRow[]> {
  return ReportingSalesDocumentModel.aggregate<SeriesAggRow>([
    { $match: invoiceMatch(tenantId, SALES_INVOICE_KIND, statuses, range) },
    {
      $group: {
        _id: {
          period: { $dateToString: { format: dateFormat, date: '$issueDate', timezone: 'UTC' } },
          currency: '$currency',
        },
        count: { $sum: 1 },
        subtotal: { $sum: '$subtotal' },
        tax: { $sum: '$tax' },
        total: { $sum: '$total' },
      },
    },
    seriesProjectStage(),
    { $sort: { period: 1, currency: 1 } },
  ]);
}

/**
 * Top de clientes (sin FX): agrupado por `customerId + currency` y ordenado
 * `currency` asc / `total` desc — el corte "top N por moneda" lo hace el
 * servicio (nunca se compara EUR con USD).
 */
export async function aggregateTopCustomers(
  tenantId: string,
  range: UtcRange,
  statuses: readonly ReportInvoiceStatus[],
): Promise<readonly TopAggRow[]> {
  return ReportingSalesDocumentModel.aggregate<TopAggRow>([
    { $match: invoiceMatch(tenantId, SALES_INVOICE_KIND, statuses, range) },
    {
      $group: {
        _id: { id: '$customerId', currency: '$currency' },
        total: { $sum: '$total' },
        count: { $sum: 1 },
      },
    },
    partyLookup(READ_COLLECTIONS.customers, '_id.id', tenantId, { name: 1, code: 1 }),
    { $unwind: { path: '$party' } },
    {
      $project: {
        _id: 0,
        id: { $toString: '$_id.id' },
        name: '$party.name',
        code: '$party.code',
        currency: '$_id.currency',
        total: 1,
        count: 1,
      },
    },
    { $sort: { currency: 1, total: -1, id: 1 } },
  ]);
}

// --- Compras ---

export async function aggregatePurchasesSeries(
  tenantId: string,
  range: UtcRange,
  dateFormat: string,
  statuses: readonly ReportInvoiceStatus[],
): Promise<readonly SeriesAggRow[]> {
  return ReportingPurchaseDocumentModel.aggregate<SeriesAggRow>([
    { $match: invoiceMatch(tenantId, PURCHASE_INVOICE_KIND, statuses, range) },
    {
      $group: {
        _id: {
          period: { $dateToString: { format: dateFormat, date: '$issueDate', timezone: 'UTC' } },
          currency: '$currency',
        },
        count: { $sum: 1 },
        subtotal: { $sum: '$subtotal' },
        tax: { $sum: '$tax' },
        total: { $sum: '$total' },
      },
    },
    seriesProjectStage(),
    { $sort: { period: 1, currency: 1 } },
  ]);
}

export async function aggregateTopSuppliers(
  tenantId: string,
  range: UtcRange,
  statuses: readonly ReportInvoiceStatus[],
): Promise<readonly TopAggRow[]> {
  return ReportingPurchaseDocumentModel.aggregate<TopAggRow>([
    { $match: invoiceMatch(tenantId, PURCHASE_INVOICE_KIND, statuses, range) },
    {
      $group: {
        _id: { id: '$supplierId', currency: '$currency' },
        total: { $sum: '$total' },
        count: { $sum: 1 },
      },
    },
    partyLookup(READ_COLLECTIONS.suppliers, '_id.id', tenantId, { name: 1, code: 1 }),
    { $unwind: { path: '$party' } },
    {
      $project: {
        _id: 0,
        id: { $toString: '$_id.id' },
        name: '$party.name',
        code: '$party.code',
        currency: '$_id.currency',
        total: 1,
        count: 1,
      },
    },
    { $sort: { currency: 1, total: -1, id: 1 } },
  ]);
}

// --- Flujo de caja ---

/**
 * Ingresos/egresos del ledger por `period + currency`. La moneda sale de un
 * `$lookup` a `treasuryAccounts` con `tenantId` fijado en su sub-pipeline;
 * sin cuenta (defensivo) → `UNKNOWN`. `inflow` = `Σ amount>0`,
 * `outflow` = `Σ |amount|<0` (ambos positivos; `net` lo calcula el servicio).
 */
export async function aggregateCashFlowSeries(
  tenantId: string,
  range: UtcRange,
  dateFormat: string,
): Promise<readonly CashFlowAggRow[]> {
  return ReportingCashMovementModel.aggregate<CashFlowAggRow>([
    { $match: { tenantId, createdAt: { $gte: range.from, $lt: range.to } } },
    partyLookup(READ_COLLECTIONS.treasuryAccounts, 'accountId', tenantId, { currency: 1 }),
    { $unwind: { path: '$party', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: {
          period: { $dateToString: { format: dateFormat, date: '$createdAt', timezone: 'UTC' } },
          currency: { $ifNull: ['$party.currency', 'UNKNOWN'] },
        },
        inflow: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
        outflow: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        period: '$_id.period',
        currency: '$_id.currency',
        inflow: 1,
        outflow: 1,
        count: 1,
      },
    },
    { $sort: { period: 1, currency: 1 } },
  ]);
}

// --- Inventario ---

interface InventorySummaryAgg {
  readonly summary: readonly InventoryFacetRow[];
  readonly lowStock: readonly { readonly n: number }[];
}

/**
 * Snapshot valorizado en UNA pasada ($facet sobre productos no archivados):
 * `Σ qty × cost` (sin coste → aporta 0 y cuenta en `unpriced`) + cuántos
 * productos están por debajo de `minStock`. Sin filas → `null` (vacío).
 */
export async function aggregateInventory(tenantId: string): Promise<InventorySummary | null> {
  const [facet] = await ReportingProductModel.aggregate<InventorySummaryAgg>([
    { $match: { tenantId, archived: { $ne: true } } },
    stockQtyLookup(tenantId),
    { $addFields: { qty: { $ifNull: [{ $arrayElemAt: ['$stock.qty', 0] }, 0] } } },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              products: { $sum: 1 },
              valued: { $sum: { $cond: [{ $ne: ['$cost', null] }, 1, 0] } },
              unpriced: { $sum: { $cond: [{ $eq: ['$cost', null] }, 1, 0] } },
              stockValue: {
                $sum: { $cond: [{ $ne: ['$cost', null] }, { $multiply: ['$qty', '$cost'] }, 0] },
              },
            },
          },
        ],
        lowStock: [
          { $match: { minStock: { $ne: null }, $expr: { $lt: ['$qty', '$minStock'] } } },
          { $count: 'n' },
        ],
      },
    },
  ]);
  const summary = facet?.summary[0];
  if (summary === undefined) {
    return null;
  }
  return {
    products: summary.products,
    valued: summary.valued,
    unpriced: summary.unpriced,
    stockValue: summary.stockValue,
    lowStock: facet?.lowStock[0]?.n ?? 0,
  };
}

/** Faltante mayor primero (desempate por `code`); paginado por `$facet`. */
export async function listLowStock(
  tenantId: string,
  page: number,
  limit: number,
): Promise<{ readonly items: readonly LowStockItem[]; readonly total: number }> {
  const [facet] = await ReportingProductModel.aggregate<LowStockFacet>([
    { $match: { tenantId, archived: { $ne: true }, minStock: { $ne: null } } },
    stockQtyLookup(tenantId),
    { $addFields: { qty: { $ifNull: [{ $arrayElemAt: ['$stock.qty', 0] }, 0] } } },
    { $match: { $expr: { $lt: ['$qty', '$minStock'] } } },
    { $addFields: { deficit: { $subtract: ['$minStock', '$qty'] } } },
    { $sort: { deficit: -1, code: 1 } },
    {
      $facet: {
        rows: [
          {
            $project: {
              _id: 0,
              productId: { $toString: '$_id' },
              code: 1,
              name: 1,
              unit: 1,
              minStock: 1,
              qty: 1,
              deficit: 1,
            },
          },
          { $skip: (page - 1) * limit },
          { $limit: limit },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]);
  return { items: facet?.rows ?? [], total: facet?.total[0]?.n ?? 0 };
}

// --- CRM ---

export async function aggregateLeadStatus(
  tenantId: string,
  range: UtcRange,
): Promise<readonly StatusCountRow[]> {
  return ReportingLeadModel.aggregate<StatusCountRow>([
    {
      $match: { tenantId, archived: { $ne: true }, createdAt: { $gte: range.from, $lt: range.to } },
    },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $project: { _id: 0, status: '$_id', count: 1 } },
    { $sort: { status: 1 } },
  ]);
}

export async function aggregateOpportunityStages(
  tenantId: string,
  range: UtcRange,
): Promise<readonly StageCurrencyRow[]> {
  return ReportingOpportunityModel.aggregate<StageCurrencyRow>([
    {
      $match: { tenantId, archived: { $ne: true }, createdAt: { $gte: range.from, $lt: range.to } },
    },
    {
      $group: {
        _id: { stage: '$stage', currency: '$currency' },
        count: { $sum: 1 },
        amount: { $sum: '$amount' },
      },
    },
    {
      $project: {
        _id: 0,
        stage: '$_id.stage',
        currency: '$_id.currency',
        count: 1,
        amount: 1,
      },
    },
    { $sort: { stage: 1, currency: 1 } },
  ]);
}

// --- Exportaciones CSV (filas, mismo filtro que su reporte) ---

export async function fetchSalesExport(
  tenantId: string,
  range: UtcRange,
  statuses: readonly ReportInvoiceStatus[],
  limit: number,
): Promise<readonly SalesExportRow[]> {
  return ReportingSalesDocumentModel.aggregate<SalesExportRow>([
    { $match: invoiceMatch(tenantId, SALES_INVOICE_KIND, statuses, range) },
    partyLookup(READ_COLLECTIONS.customers, 'customerId', tenantId, { name: 1 }),
    { $unwind: { path: '$party' } },
    {
      $project: {
        _id: 0,
        number: 1,
        customerId: { $toString: '$customerId' },
        customer: '$party.name',
        issueDate: 1,
        status: 1,
        currency: 1,
        subtotal: 1,
        tax: 1,
        total: 1,
      },
    },
    { $sort: { issueDate: 1, number: 1 } },
    { $limit: limit },
  ]);
}

export async function fetchPurchasesExport(
  tenantId: string,
  range: UtcRange,
  statuses: readonly ReportInvoiceStatus[],
  limit: number,
): Promise<readonly PurchasesExportRow[]> {
  return ReportingPurchaseDocumentModel.aggregate<PurchasesExportRow>([
    { $match: invoiceMatch(tenantId, PURCHASE_INVOICE_KIND, statuses, range) },
    partyLookup(READ_COLLECTIONS.suppliers, 'supplierId', tenantId, { name: 1 }),
    { $unwind: { path: '$party' } },
    {
      $project: {
        _id: 0,
        number: 1,
        supplierId: { $toString: '$supplierId' },
        supplier: '$party.name',
        issueDate: 1,
        status: 1,
        currency: 1,
        subtotal: 1,
        tax: 1,
        total: 1,
      },
    },
    { $sort: { issueDate: 1, number: 1 } },
    { $limit: limit },
  ]);
}

export async function fetchCashFlowExport(
  tenantId: string,
  range: UtcRange,
  limit: number,
): Promise<readonly CashFlowExportRow[]> {
  return ReportingCashMovementModel.aggregate<CashFlowExportRow>([
    { $match: { tenantId, createdAt: { $gte: range.from, $lt: range.to } } },
    partyLookup(READ_COLLECTIONS.treasuryAccounts, 'accountId', tenantId, { currency: 1 }),
    { $unwind: { path: '$party', preserveNullAndEmptyArrays: true } },
    { $sort: { createdAt: 1, _id: 1 } },
    {
      $project: {
        _id: 0,
        createdAt: 1,
        accountId: { $toString: '$accountId' },
        currency: { $ifNull: ['$party.currency', 'UNKNOWN'] },
        sourceType: 1,
        amount: 1,
        balanceAfter: 1,
        reason: 1,
      },
    },
    { $limit: limit },
  ]);
}

export async function fetchInventoryExport(
  tenantId: string,
  limit: number,
): Promise<readonly InventoryExportRow[]> {
  return ReportingProductModel.aggregate<InventoryExportRow>([
    { $match: { tenantId, archived: { $ne: true } } },
    stockQtyLookup(tenantId),
    { $addFields: { qty: { $ifNull: [{ $arrayElemAt: ['$stock.qty', 0] }, 0] } } },
    { $sort: { code: 1 } },
    {
      $project: {
        _id: 0,
        code: 1,
        name: 1,
        unit: 1,
        minStock: 1,
        qty: 1,
        cost: 1,
        value: {
          $cond: [{ $ne: ['$cost', null] }, { $multiply: ['$qty', '$cost'] }, null],
        },
      },
    },
    { $limit: limit },
  ]);
}

export async function fetchCrmExport(
  tenantId: string,
  range: UtcRange,
  limit: number,
): Promise<readonly CrmExportRow[]> {
  return ReportingOpportunityModel.aggregate<CrmExportRow>([
    {
      $match: { tenantId, archived: { $ne: true }, createdAt: { $gte: range.from, $lt: range.to } },
    },
    { $sort: { createdAt: 1, _id: 1 } },
    {
      $project: {
        _id: 0,
        name: 1,
        stage: 1,
        currency: 1,
        amount: 1,
        expectedCloseDate: 1,
        createdAt: 1,
      },
    },
    { $limit: limit },
  ]);
}
