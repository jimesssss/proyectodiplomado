/**
 * Maestro de Cuenta contable (FASE 12) — vive en el módulo `accounting`.
 * Plan contable PLANO: `code` único por tenant e inmutable (mismo patrón que
 * customers/suppliers/products). La naturaleza determina el saldo normal
 * (asset/expense → débito; liability/equity/revenue → crédito) y ese valor se
 * DERIVA en el servidor — nunca llega del cliente ni se almacena.
 * Sin jerarquía `parentId` en esta fase (decisión documentada).
 */

export const ACCOUNT_NATURES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;
export type AccountNature = (typeof ACCOUNT_NATURES)[number];

export type NormalBalance = 'debit' | 'credit';

/** Saldo normal de la cuenta: se calcula, no se pide. */
export function normalBalanceFor(nature: AccountNature): NormalBalance {
  return nature === 'asset' || nature === 'expense' ? 'debit' : 'credit';
}

export interface Account {
  readonly id: string;
  readonly tenantId: string;
  /** Clave natural por tenant (mayúsculas/guiones), inmutable. */
  readonly code: string;
  readonly name: string;
  readonly nature: AccountNature;
  readonly description: string | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicAccount {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly nature: AccountNature;
  /** Derivado de `nature` en el servidor (no es un campo escrito). */
  readonly normalBalance: NormalBalance;
  readonly description: string | null;
  readonly archived: boolean;
}

export function toPublicAccount(account: Account): PublicAccount {
  return {
    id: account.id,
    code: account.code,
    name: account.name,
    nature: account.nature,
    normalBalance: normalBalanceFor(account.nature),
    description: account.description,
    archived: account.archived,
  };
}
