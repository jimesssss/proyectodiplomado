/**
 * Dominio Tenancy — entidad pura (sin Express, sin Mongoose).
 */

export type TenantStatus = 'active' | 'suspended';

export interface Tenant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: TenantStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura del tenant para respuestas de la API. */
export interface PublicTenant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: TenantStatus;
  readonly createdAt: Date;
}

export function toPublicTenant(tenant: Tenant): PublicTenant {
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    createdAt: tenant.createdAt,
  };
}
