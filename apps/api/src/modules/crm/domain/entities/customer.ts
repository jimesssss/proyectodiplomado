/**
 * Dominio CRM — Cliente.
 * Clave natural: `code` único por tenant (normalizado, inmutable tras crear).
 */

export const CUSTOMER_TYPES = ['company', 'person'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export interface CustomerAddress {
  readonly street?: string | undefined;
  readonly city?: string | undefined;
  readonly region?: string | undefined;
  readonly postalCode?: string | undefined;
  /** ISO-3166 alpha-2 en mayúsculas (validado y normalizado en servicio). */
  readonly country?: string | undefined;
}

export interface Customer {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly type: CustomerType;
  readonly email: string | null;
  readonly phone: string | null;
  readonly taxId: string | null;
  readonly address: CustomerAddress | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicCustomer {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: CustomerType;
  readonly email: string | null;
  readonly phone: string | null;
  readonly taxId: string | null;
  readonly address: CustomerAddress | null;
  readonly archived: boolean;
}

export function toPublicCustomer(customer: Customer): PublicCustomer {
  return {
    id: customer.id,
    code: customer.code,
    name: customer.name,
    type: customer.type,
    email: customer.email,
    phone: customer.phone,
    taxId: customer.taxId,
    address: customer.address,
    archived: customer.archived,
  };
}
