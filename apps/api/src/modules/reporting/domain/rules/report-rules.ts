import type { ReportGroupBy } from '../entities/report.js';

/**
 * Reglas puras de Reporting (FASE 15): fechas de rango (`YYYY-MM-DD` con
 * roundtrip de calendario, defaults por request y límites de escaneo por
 * `groupBy`), tasas y construcción de CSV con guarda anti formula-injection
 * (OWASP). Sin Mongoose, sin Express, sin I/O.
 */

export const REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** Rango máximo con `groupBy=day` (366 días ≈ 1 año de cubetas diarias). */
export const MAX_RANGE_DAYS_DAY = 366;
/** Rango máximo con `groupBy=month` o sin agrupación (10 años). */
export const MAX_RANGE_MONTHS = 120;
/** `from` por defecto cuando no viene: `to` − 365 días. */
export const REPORT_DEFAULT_RANGE_DAYS = 365;
/** Filas "top" por moneda en ventas/compras. */
export const REPORT_TOP_N = 5;
/** Filas máximo por exportación (`limit` no puede superarlo). */
export const EXPORT_MAX_ROWS = 5_000;

/**
 * `YYYY-MM-DD` estricto con roundtrip de calendario: `2026-02-31` rueda a
 * marzo en `Date` y por tanto NO roundtripa → inválida.
 */
export function isValidReportDate(value: string): boolean {
  if (!REPORT_DATE_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return date.toISOString().slice(0, 10) === value;
}

export function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dayStartUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Inicio del DÍA SIGUIENTE (extremo superior exclusivo del día `value`). */
export function dayEndExclusiveUtc(value: string): Date {
  const date = dayStartUtc(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export interface ResolvedDateRange {
  readonly from: string;
  readonly to: string;
}

/**
 * Defaults por request (nunca congelados en el esquema): `to` = hoy (UTC) y
 * `from` = `to` − 365 días; el par completo se respeta tal cual.
 */
export function resolveDateRange(
  from: string | undefined,
  to: string | undefined,
  now: Date = new Date(),
): ResolvedDateRange {
  const resolvedTo = to ?? isoDateOnly(now);
  const floor = dayStartUtc(resolvedTo);
  floor.setUTCDate(floor.getUTCDate() - REPORT_DEFAULT_RANGE_DAYS);
  return { from: from ?? isoDateOnly(floor), to: resolvedTo };
}

export interface UtcRange {
  readonly from: Date;
  readonly to: Date;
}

/** Rango [from, to) en UTC a partir de las dos fechas ya resueltas. */
export function utcRange(from: string, to: string): UtcRange {
  return { from: dayStartUtc(from), to: dayEndExclusiveUtc(to) };
}

export interface RangeCheck {
  readonly ok: boolean;
  readonly message: string;
}

/**
 * Chequeo sobre el rango YA resuelto: `from ≤ to` y límites de escaneo —
 * 366 días con `day`, 120 meses con `month` (y con snapshots/rutas sin
 * `groupBy`, que usan el límite mensual).
 */
export function checkDateRange(from: string, to: string, groupBy: ReportGroupBy): RangeCheck {
  const start = dayStartUtc(from);
  const end = dayStartUtc(to);
  if (end.getTime() < start.getTime()) {
    return { ok: false, message: 'from must not be after to' };
  }
  if (groupBy === 'day') {
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    if (days > MAX_RANGE_DAYS_DAY) {
      return { ok: false, message: `day grouping allows at most ${MAX_RANGE_DAYS_DAY} days` };
    }
    return { ok: true, message: '' };
  }
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  if (months > MAX_RANGE_MONTHS) {
    return { ok: false, message: `range allows at most ${MAX_RANGE_MONTHS} months` };
  }
  return { ok: true, message: '' };
}

/** Formato `$dateToString` (UTC) de las cubetas de serie. */
export function periodFormat(groupBy: ReportGroupBy): string {
  return groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m';
}

/** Redondeo a 4 decimales para tasas (`leadRate`/`winRate`). */
export function roundRate(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

/** Celda CSV tipada: los números salen CRUDOS; el texto pasa por la guarda. */
export type CsvCell =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number };

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\n\r]/;

/**
 * Celda de texto con guarda anti formula-injection: un prefijo `= + - @`
 * (o tab/CR) se neutraliza con `'` antes de comillas/quote-doubling.
 */
export function csvText(value: string): string {
  const guarded = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  if (NEEDS_QUOTES.test(guarded)) {
    return `"${guarded.split('"').join('""')}"`;
  }
  return guarded;
}

function csvNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

/**
 * CSV RFC-4180: cabecera + filas separadas por CRLF (incluido el final).
 * Los números NUNCA reciben la guarda (son importes/cantidades del
 * servidor); el no finito se emite como celda vacía.
 */
export function buildCsv(
  headers: readonly string[],
  rows: readonly (readonly CsvCell[])[],
): string {
  const lines: string[] = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      row
        .map((cell) => (cell.kind === 'number' ? csvNumber(cell.value) : csvText(cell.value)))
        .join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}
