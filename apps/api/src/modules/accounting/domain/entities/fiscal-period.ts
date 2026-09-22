/**
 * Período fiscal (FASE 12): ventanas de fechas SIN solape (revisado en el
 * servidor al crear) que gobernán el posting de asientos: al postear, el
 * servidor resuelve el período que cubre la fecha del asiento — sin período
 * → 422; período `closed` → 409. Máquina: `open → closed` (terminal; no hay
 * re-apertura en esta fase, decisión documentada). Códigos únicos por tenant
 * (`2026-01`), fechas inmutables.
 */

export const PERIOD_STATUSES = ['open', 'closed'] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export interface FiscalPeriod {
  readonly id: string;
  readonly tenantId: string;
  /** Clave natural por tenant (p. ej. `2026-01`), inmutable. */
  readonly code: string;
  readonly name: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: PeriodStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`). Sin `archived`:
 * los períodos se cierran (`closed`), no se archivan. */
export interface PublicFiscalPeriod {
  readonly id: string;
  readonly code: string;
  readonly name: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: PeriodStatus;
}

export function toPublicFiscalPeriod(period: FiscalPeriod): PublicFiscalPeriod {
  return {
    id: period.id,
    code: period.code,
    name: period.name,
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    status: period.status,
  };
}
