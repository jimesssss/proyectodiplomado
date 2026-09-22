/**
 * Dominio CRM — Contacto (persona dentro de un cliente).
 * FK: `customerId` SIEMPRE dentro del mismo tenant (404 uniforme si no).
 * Regla: como máximo UN principal por cliente (`isPrimary`).
 */

export interface Contact {
  readonly id: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly jobTitle: string | null;
  readonly isPrimary: boolean;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicContact {
  readonly id: string;
  readonly customerId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly jobTitle: string | null;
  readonly isPrimary: boolean;
  readonly archived: boolean;
}

export function toPublicContact(contact: Contact): PublicContact {
  return {
    id: contact.id,
    customerId: contact.customerId,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    jobTitle: contact.jobTitle,
    isPrimary: contact.isPrimary,
    archived: contact.archived,
  };
}
