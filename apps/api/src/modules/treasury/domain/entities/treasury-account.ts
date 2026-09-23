/**
 * Cuenta de tesorería (FASE 13): banco o caja en UNA colección
 * (`treasuryAccounts` con `type`) porque el catálogo solo define el permiso
 * `bank.account:*` para ambas (desviación documentada de `database.md`, que
 * lista `bankAccounts` y `cashAccounts` separadas — ver
 * `docs/database/treasury.md`).
 *
 * `balance` es una PROYECCIÓN server-only (nunca del cliente): parte de
 * `openingBalance` (inmutable, ≥ 0) y solo cambia con `$inc` + guardia
 * `balance ≥ −delta` (invariante: **el saldo NUNCA queda negativo**, mismo
 * patrón que el stock de FASE 11). El ledger `cashMovements` es la fuente de
 * verdad del movimiento.
 */

export const TREASURY_ACCOUNT_TYPES = ['bank', 'cash'] as const;
export type TreasuryAccountType = (typeof TREASURY_ACCOUNT_TYPES)[number];

export interface TreasuryAccount {
  readonly id: string;
  readonly tenantId: string;
  readonly type: TreasuryAccountType;
  /** Clave natural por tenant (mayúsculas/guiones), inmutable. */
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  /** Número de cuenta/IBAN (solo bancos), inmutable. */
  readonly accountNumber: string | null;
  /** ISO-4217, inmutable. UNA moneda por cuenta (sin conversión en FASE 13). */
  readonly currency: string;
  /** Saldo de apertura (≥ 0), inmutable; se registra como movimiento `opening`. */
  readonly openingBalance: number;
  /** Proyección: `openingBalance + Σ cashMovements` (server-only). */
  readonly balance: number;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicTreasuryAccount {
  readonly id: string;
  readonly type: TreasuryAccountType;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly accountNumber: string | null;
  readonly currency: string;
  readonly openingBalance: number;
  readonly balance: number;
  readonly archived: boolean;
}

export function toPublicTreasuryAccount(account: TreasuryAccount): PublicTreasuryAccount {
  return {
    id: account.id,
    type: account.type,
    code: account.code,
    name: account.name,
    description: account.description,
    accountNumber: account.accountNumber,
    currency: account.currency,
    openingBalance: account.openingBalance,
    balance: account.balance,
    archived: account.archived,
  };
}
