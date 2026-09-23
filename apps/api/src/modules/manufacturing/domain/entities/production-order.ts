/**
 * Dominio Manufacturing — orden de producción (FASE 16).
 *
 * Máquina de estados: `draft → in_progress → completed`; `cancelled` desde
 * `draft`/`in_progress`. El stock SOLO se mueve al `completed`
 * (pre-chequeo → estado → movimientos, patrón de transferencias FASE 11):
 * `production_out` por componente (−) y `production_in` del producto
 * terminado (+), ambos con `sourceType: 'production.order'`.
 *
 * `number` es secuencial `MO-YYYY-000001` (core/numbering) e inmutable;
 * `lines` es el plan POR UNIDAD (snapshot de la BOM o líneas explícitas) y
 * se fija al crear: en `draft` solo se editan `productId`/`quantity`/
 * `warehouseId`/`notes` (la escala final es `lines × quantity`).
 */
import type { BomLine } from './bom.js';

export const PRODUCTION_STATUSES = ['draft', 'in_progress', 'completed', 'cancelled'] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

/** Prefijo de numeración (`MO-YYYY-000001`, core/numbering). */
export const PRODUCTION_PREFIX = 'MO';

export interface ProductionOrder {
  readonly id: string;
  readonly tenantId: string;
  /** Secuencial `MO-YYYY-000001` por tenant+año, inmutable. */
  readonly number: string;
  /** Producto terminado a producir. */
  readonly productId: string;
  /** Unidades a producir (entero ≥ 1). */
  readonly quantity: number;
  /** Almacén donde entra el producto y salen los componentes. */
  readonly warehouseId: string;
  readonly bomId: string | null;
  /** Plan POR UNIDAD copiado de la BOM (o líneas explícitas). */
  readonly lines: readonly BomLine[];
  readonly status: ProductionStatus;
  readonly notes: string | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicProductionOrder {
  readonly id: string;
  readonly number: string;
  readonly productId: string;
  readonly quantity: number;
  readonly warehouseId: string;
  readonly bomId: string | null;
  readonly lines: readonly BomLine[];
  readonly status: ProductionStatus;
  readonly notes: string | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function toPublicProductionOrder(order: ProductionOrder): PublicProductionOrder {
  return {
    id: order.id,
    number: order.number,
    productId: order.productId,
    quantity: order.quantity,
    warehouseId: order.warehouseId,
    bomId: order.bomId,
    lines: [...order.lines],
    status: order.status,
    notes: order.notes,
    archived: order.archived,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
