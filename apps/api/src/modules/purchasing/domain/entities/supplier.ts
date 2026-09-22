/**
 * Maestro de Proveedor (FASE 10) — vive en el módulo `purchasing` (datos
 * maestros de COMPRAS; los clientes son de venta y siguen en CRM).
 * `code` único por tenant, normalizado e inmutable.
 */

export interface SupplierAddress {
  readonly street?: string | undefined;
  readonly city?: string | undefined;
  readonly region?: string | undefined;
  readonly postalCode?: string | undefined;
  readonly country?: string | undefined;
}

export interface Supplier {
  readonly id: string;
  readonly tenantId: string;
  /** Clave natural por tenant (mayúsculas/guiones), inmutable. */
  readonly code: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly taxId: string | null;
  readonly address: SupplierAddress | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicSupplier {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly taxId: string | null;
  readonly address: SupplierAddress | null;
  readonly archived: boolean;
}

export function toPublicSupplier(supplier: Supplier): PublicSupplier {
  return {
    id: supplier.id,
    code: supplier.code,
    name: supplier.name,
    email: supplier.email,
    phone: supplier.phone,
    taxId: supplier.taxId,
    address: supplier.address,
    archived: supplier.archived,
  };
}
