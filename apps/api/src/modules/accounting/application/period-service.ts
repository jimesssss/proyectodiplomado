import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import {
  toPublicFiscalPeriod,
  type PeriodStatus,
  type PublicFiscalPeriod,
} from '../domain/entities/fiscal-period.js';
import {
  canPeriodTransition,
  normalizeCode,
  validateCode,
} from '../domain/rules/accounting-rules.js';
import { periodRepo } from '../infrastructure/repositories/accounting-repository.js';

/**
 * Casos de uso de Períodos fiscales (FASE 12). `tenantId` SIEMPRE del JWT
 * (ADR-002). Reglas: `code` único por tenant e inmutable, fechas
 * INMUTABLES y sin solape entre períodos del mismo tenant (409 al crear),
 * máquina `open → closed` (terminal — sin re-apertura en FASE 12). Al
 * postear un asiento, el servidor resuelve el período que cubre su fecha
 * (`journal-service`): cerrado → 409.
 */

export interface CreatePeriodInput {
  readonly code: string;
  readonly name?: string | undefined;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface PatchPeriodInput {
  readonly name?: string | null | undefined;
  readonly status?: PeriodStatus | undefined;
}

export interface PeriodListQuery {
  readonly page: number;
  readonly limit: number;
  readonly status?: PeriodStatus | undefined;
}

export interface PeriodPage {
  readonly items: readonly PublicFiscalPeriod[];
  readonly total: number;
}

function assertCode(code: string): string {
  const normalized = normalizeCode(code);
  const check = validateCode(normalized);
  if (!check.valid) {
    throw new ValidationError('Invalid code', { issues: check.issues });
  }
  return normalized;
}

export async function createPeriod(
  tenantId: string,
  input: CreatePeriodInput,
): Promise<PublicFiscalPeriod> {
  const code = assertCode(input.code);
  // Sin solape: dos ventanas del mismo tenant nunca pueden cruzarse (la
  // resolución "período que cubre la fecha" exige unicidad temporal).
  if (await periodRepo.hasOverlap(tenantId, input.startsAt, input.endsAt)) {
    throw new ConflictError('Fiscal period overlaps an existing period');
  }
  const period = await periodRepo.create(tenantId, {
    code,
    name: input.name === undefined ? null : input.name.trim(),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    status: 'open',
  });
  return toPublicFiscalPeriod(period);
}

export async function listPeriods(tenantId: string, query: PeriodListQuery): Promise<PeriodPage> {
  const filter = query.status !== undefined ? { status: query.status } : {};
  const page = await periodRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicFiscalPeriod), total: page.total };
}

export async function getPeriod(tenantId: string, id: string): Promise<PublicFiscalPeriod> {
  const period = await periodRepo.findById(tenantId, id);
  if (period === null) {
    throw new NotFoundError();
  }
  return toPublicFiscalPeriod(period);
}

export async function updatePeriod(
  tenantId: string,
  id: string,
  input: PatchPeriodInput,
): Promise<PublicFiscalPeriod> {
  const current = await periodRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) {
    set.name = input.name === null ? null : input.name.trim();
  }
  if (input.status !== undefined) {
    if (input.status === current.status) {
      throw new ConflictError('Status is already the requested one');
    }
    if (!canPeriodTransition(current.status, input.status)) {
      throw new ConflictError('Invalid status transition');
    }
    set.status = input.status;
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await periodRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }
  return toPublicFiscalPeriod(updated);
}
