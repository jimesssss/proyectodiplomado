import { Types } from 'mongoose';
import type { Product } from '../../domain/entities/product.js';
import type { MovementSourceType, MovementType } from '../../domain/entities/stock.js';
import type {
  CountLine,
  CountStatus,
  TransferLine,
  TransferStatus,
} from '../../domain/entities/stock-documents.js';

/** Maestro de producto (`products`) — escrito solo por este módulo. */
export interface ProductDoc extends Omit<Product, 'id'> {
  _id: Types.ObjectId;
}

/** Saldo proyectado (`stock`) — solo cambia aplicando movimientos. */
export interface StockDoc {
  _id: Types.ObjectId;
  tenantId: string;
  productId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  qty: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Ledger append-only (`stockMovements`) — timestamps solo de creación. */
export interface MovementDoc {
  _id: Types.ObjectId;
  tenantId: string;
  productId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  type: MovementType;
  /** Con signo: + entrada, − salida. */
  qty: number;
  balanceAfter: number;
  sourceType?: MovementSourceType | null;
  sourceId?: Types.ObjectId | null;
  reason?: string | null;
  createdAt: Date;
}

/** Transferencia entre almacenes (`stockTransfers`). */
export interface TransferDoc {
  _id: Types.ObjectId;
  tenantId: string;
  number: string;
  fromWarehouseId: Types.ObjectId;
  toWarehouseId: Types.ObjectId;
  lines: TransferLine[];
  status: TransferStatus;
  notes?: string | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Conteo físico (`inventoryCounts`). */
export interface CountDoc {
  _id: Types.ObjectId;
  tenantId: string;
  number: string;
  warehouseId: Types.ObjectId;
  lines: CountLine[];
  status: CountStatus;
  notes?: string | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}
