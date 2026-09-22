/**
 * Maestro de Producto (FASE 11) — vive en el módulo `inventory`.
 * `code` único por tenant, normalizado e inmutable (mismo patrón que
 * customers/suppliers). `unit` describe la unidad de medida física; `minStock`
 * habilita alertas de stock bajo (eventos `StockLow`, fases de reporting).
 */

export interface Product {
  readonly id: string;
  readonly tenantId: string;
  /** Clave natural por tenant (mayúsculas/guiones), inmutable. */
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  /** Unidad de medida libre ('unit', 'kg', 'm', …). */
  readonly unit: string;
  /** Costo/unitario a 2 decimales (dinero, redondeo comercial). */
  readonly cost: number | null;
  /** Precio de venta unitario a 2 decimales. */
  readonly price: number | null;
  /** Punto de reorden (cantidad ≥ 0) para alertas futuras. */
  readonly minStock: number | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicProduct {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly unit: string;
  readonly cost: number | null;
  readonly price: number | null;
  readonly minStock: number | null;
  readonly archived: boolean;
}

export function toPublicProduct(product: Product): PublicProduct {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    unit: product.unit,
    cost: product.cost,
    price: product.price,
    minStock: product.minStock,
    archived: product.archived,
  };
}
