/**
 * Documentos de inventario (FASE 11): transferencia entre almacenes y conteo
 * físico. Cada uno con su máquina de estados (`inventory-rules`), su serie de
 * numeración (`core/numbering`) y sus líneas; ambos comparten forma de vida
 * con los documentos de Sales/Purchasing: solo borradores editables y
 * soft-delete (`archived`) sin ruta DELETE (el catálogo no define `:delete`
 * para `stock.transfer`/`stock.count`).
 */

/** Transferencia: mueve stock del ORIGEN al DESTINO al completarse. */
export interface TransferLine {
  readonly productId: string;
  readonly quantity: number;
}

export const TRANSFER_STATUSES = ['draft', 'in_transit', 'completed', 'cancelled'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export interface StockTransfer {
  readonly id: string;
  readonly tenantId: string;
  /** Secuencial `TR-YYYY-000001` por tenant+año, inmutable. */
  readonly number: string;
  readonly fromWarehouseId: string;
  readonly toWarehouseId: string;
  readonly lines: readonly TransferLine[];
  readonly status: TransferStatus;
  readonly notes: string | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Conteo físico: al aprobarse ajusta el saldo al conteo contado. */
export interface CountLine {
  readonly productId: string;
  /** Unidades contadas físicamente (≥ 0). */
  readonly countedQty: number;
}

export const COUNT_STATUSES = ['draft', 'approved', 'cancelled'] as const;
export type CountStatus = (typeof COUNT_STATUSES)[number];

export interface InventoryCount {
  readonly id: string;
  readonly tenantId: string;
  /** Secuencial `CT-YYYY-000001` por tenant+año, inmutable. */
  readonly number: string;
  readonly warehouseId: string;
  readonly lines: readonly CountLine[];
  readonly status: CountStatus;
  readonly notes: string | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representaciones seguras para respuestas (sin `tenantId`). */
export interface PublicStockTransfer {
  readonly id: string;
  readonly number: string;
  readonly fromWarehouseId: string;
  readonly toWarehouseId: string;
  readonly lines: readonly TransferLine[];
  readonly status: TransferStatus;
  readonly notes: string | null;
  readonly archived: boolean;
}

export interface PublicInventoryCount {
  readonly id: string;
  readonly number: string;
  readonly warehouseId: string;
  readonly lines: readonly CountLine[];
  readonly status: CountStatus;
  readonly notes: string | null;
  readonly archived: boolean;
}

export function toPublicStockTransfer(transfer: StockTransfer): PublicStockTransfer {
  return {
    id: transfer.id,
    number: transfer.number,
    fromWarehouseId: transfer.fromWarehouseId,
    toWarehouseId: transfer.toWarehouseId,
    lines: transfer.lines,
    status: transfer.status,
    notes: transfer.notes,
    archived: transfer.archived,
  };
}

export function toPublicInventoryCount(count: InventoryCount): PublicInventoryCount {
  return {
    id: count.id,
    number: count.number,
    warehouseId: count.warehouseId,
    lines: count.lines,
    status: count.status,
    notes: count.notes,
    archived: count.archived,
  };
}
