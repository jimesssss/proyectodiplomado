/**
 * Maestro de Impuesto (FASE 12): catálogo de tasas (VAT, IVA, ISR…) con
 * `code` único por tenant e inmutable y `rate` en porcentaje (0–100).
 * Esta fase lo publica como maestro de solo-lectura-para-el-resto: los
 * documentos de venta/compra siguen llevando su `taxRate` por línea (FASE
 * 9/10) — la vinculación automática de tasas a facturas queda pendiente de
 * eventos (ADR-007) y se documenta como RISK.
 */

export interface Tax {
  readonly id: string;
  readonly tenantId: string;
  /** Clave natural por tenant (p. ej. `VAT16`), inmutable. */
  readonly code: string;
  readonly name: string;
  /** Porcentaje 0–100 (16 = 16%). */
  readonly rate: number;
  readonly description: string | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`). */
export interface PublicTax {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly rate: number;
  readonly description: string | null;
  readonly archived: boolean;
}

export function toPublicTax(tax: Tax): PublicTax {
  return {
    id: tax.id,
    code: tax.code,
    name: tax.name,
    rate: tax.rate,
    description: tax.description,
    archived: tax.archived,
  };
}
