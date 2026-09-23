/**
 * Dominio Manufacturing — lista de materiales (BOM) (FASE 16).
 *
 * Una BOM define, POR UNIDAD de producto terminado, los componentes que se
 * consumen al completar una orden de producción (la escala `× unidades`
 * ocurre en `computeComponentRequirements`). `code` es la clave natural
 * única por tenant (normalizada e inmutable); las líneas son embebidas
 * (patrón documento+líneas de Sales/Purchasing, ADR-003).
 */

/** Línea de componente: cantidad POR UNIDAD de producto terminado. */
export interface BomLine {
  readonly productId: string;
  readonly quantity: number;
}

export interface Bom {
  readonly id: string;
  readonly tenantId: string;
  /** Clave natural única por tenant (mayúsculas, espacios → guiones). */
  readonly code: string;
  readonly name: string;
  /** Producto terminado que produce esta lista. */
  readonly productId: string;
  readonly lines: readonly BomLine[];
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicBom {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly productId: string;
  readonly lines: readonly BomLine[];
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function toPublicBom(bom: Bom): PublicBom {
  return {
    id: bom.id,
    code: bom.code,
    name: bom.name,
    productId: bom.productId,
    lines: [...bom.lines],
    archived: bom.archived,
    createdAt: bom.createdAt,
    updatedAt: bom.updatedAt,
  };
}
