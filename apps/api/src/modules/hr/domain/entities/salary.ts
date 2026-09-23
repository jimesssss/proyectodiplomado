/**
 * Entidad Salary (FASE 19 — módulo HR). Registro de nómina de UN empleado
 * por PERÍODO `YYYY-MM` (único por empleado+período: un solo renglón de
 * sueldo al mes). `netAmount` NO se almacena: se deriva al exponer =
 * `base + bonus - deduction` con `roundMoney` (2 decimales) — imposible que
 * el neto guarde un valor desincronizado de sus componentes.
 */
import { computeNetPay } from '../rules/hr-rules.js';

export interface Salary {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeId: string;
  readonly period: string;
  readonly baseAmount: number;
  readonly bonusAmount: number;
  readonly deductionAmount: number;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PublicSalary extends Omit<Salary, 'tenantId'> {
  /** Derivado (no persistido): `roundMoney(base + bonus − deduction)`. */
  readonly netAmount: number;
}

export function toPublicSalary(salary: Salary): PublicSalary {
  return {
    id: salary.id,
    employeeId: salary.employeeId,
    period: salary.period,
    baseAmount: salary.baseAmount,
    bonusAmount: salary.bonusAmount,
    deductionAmount: salary.deductionAmount,
    archived: salary.archived,
    createdAt: salary.createdAt,
    updatedAt: salary.updatedAt,
    netAmount: computeNetPay(salary.baseAmount, salary.bonusAmount, salary.deductionAmount),
  };
}
