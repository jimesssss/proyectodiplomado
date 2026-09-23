/**
 * Unit Reporting — FASE 15: reglas puras del dominio de reportes.
 * Fechas `YYYY-MM-DD` con roundtrip de calendario, defaults por request
 * (nunca congelados), límites de escaneo por `groupBy` (366 días / 120
 * meses), cubetas UTC, tasas a 4 decimales y CSV RFC-4180 con guarda anti
 * formula-injection (OWASP): los números salen CRUDOS (nunca encajados) y el
 * texto con prefijo `= + - @` (o tab/CR) se neutraliza con `'`.
 */
import { describe, expect, it } from 'vitest';
import {
  EXPORT_MAX_ROWS,
  MAX_RANGE_DAYS_DAY,
  MAX_RANGE_MONTHS,
  REPORT_DATE_PATTERN,
  REPORT_DEFAULT_RANGE_DAYS,
  REPORT_TOP_N,
  buildCsv,
  checkDateRange,
  csvText,
  dayEndExclusiveUtc,
  dayStartUtc,
  isoDateOnly,
  isValidReportDate,
  periodFormat,
  resolveDateRange,
  roundRate,
  utcRange,
} from './report-rules.js';

describe('report-rules: fechas de rango', () => {
  it('valida YYYY-MM-DD con roundtrip de calendario', () => {
    expect(isValidReportDate('2026-01-15')).toBe(true);
    expect(isValidReportDate('2024-02-29')).toBe(true); // bisiesto
    expect(isValidReportDate('2026-12-31')).toBe(true);
    expect(isValidReportDate('2026-02-29')).toBe(false); // rueda a marzo
    expect(isValidReportDate('2026-04-31')).toBe(false); // rueda a mayo
    expect(isValidReportDate('2026-13-01')).toBe(false); // mes 13 → NaN
    expect(isValidReportDate('2026-00-10')).toBe(false); // mes 00 → NaN
    expect(isValidReportDate('2026-1-5')).toBe(false); // patrón estricto
    expect(isValidReportDate('2026-01-15T00:00:00Z')).toBe(false); // no solo-fecha
    expect(isValidReportDate('garbage')).toBe(false);
    expect(isValidReportDate('')).toBe(false);
    expect(REPORT_DATE_PATTERN.test('2026-01-15')).toBe(true);
  });

  it('defaults por request: to = hoy (UTC) y from = to − 365 días', () => {
    const now = new Date('2026-09-22T10:30:00.000Z');
    expect(resolveDateRange(undefined, undefined, now)).toEqual({
      from: '2025-09-22',
      to: '2026-09-22',
    });
    expect(resolveDateRange(undefined, '2026-03-01', now)).toEqual({
      from: '2025-03-01',
      to: '2026-03-01',
    });
    expect(resolveDateRange('2026-01-01', undefined, now)).toEqual({
      from: '2026-01-01',
      to: '2026-09-22',
    });
    expect(resolveDateRange('2026-01-01', '2026-03-01', now)).toEqual({
      from: '2026-01-01',
      to: '2026-03-01',
    });
    expect(REPORT_DEFAULT_RANGE_DAYS).toBe(365);
  });

  it('checkDateRange: rechaza from > to y acepta igualdad', () => {
    expect(checkDateRange('2026-09-22', '2026-09-21', 'month')).toEqual({
      ok: false,
      message: 'from must not be after to',
    });
    expect(checkDateRange('2026-09-22', '2026-09-22', 'day').ok).toBe(true);
  });

  it('límite diario: 366 días pasan, 367 rechazan (con groupBy=day)', () => {
    expect(checkDateRange('2025-09-21', '2026-09-22', 'day')).toEqual({ ok: true, message: '' });
    const over = checkDateRange('2025-09-20', '2026-09-22', 'day');
    expect(over.ok).toBe(false);
    expect(over.message).toContain('366');
    expect(MAX_RANGE_DAYS_DAY).toBe(366);
  });

  it('límite mensual: 120 meses pasan, 121 rechazan (con groupBy=month)', () => {
    expect(checkDateRange('2016-09-22', '2026-09-22', 'month')).toEqual({ ok: true, message: '' });
    const over = checkDateRange('2016-08-22', '2026-09-22', 'month');
    expect(over.ok).toBe(false);
    expect(over.message).toContain('120');
    expect(MAX_RANGE_MONTHS).toBe(120);
  });

  it('día inicial/extremo superior exclusivo en UTC (cruce de mes y año)', () => {
    expect(dayStartUtc('2026-09-22').toISOString()).toBe('2026-09-22T00:00:00.000Z');
    expect(dayEndExclusiveUtc('2026-09-30').toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(dayEndExclusiveUtc('2026-12-31').toISOString()).toBe('2027-01-01T00:00:00.000Z');
    const range = utcRange('2026-09-22', '2026-09-22');
    expect(range.to.getTime() - range.from.getTime()).toBe(86_400_000); // [from, to)
    expect(isoDateOnly(range.from)).toBe('2026-09-22');
  });

  it('cubetas: %Y-%m-%d con day y %Y-%m con month', () => {
    expect(periodFormat('day')).toBe('%Y-%m-%d');
    expect(periodFormat('month')).toBe('%Y-%m');
  });

  it('roundRate redondea a 4 decimales', () => {
    expect(roundRate(1 / 3)).toBe(0.3333);
    expect(roundRate(2 / 3)).toBe(0.6667);
    expect(roundRate(0.5)).toBe(0.5);
    expect(roundRate(0)).toBe(0);
    expect(roundRate(1)).toBe(1);
  });

  it('constantes de límite del módulo', () => {
    expect(EXPORT_MAX_ROWS).toBe(5_000);
    expect(REPORT_TOP_N).toBe(5);
  });
});

describe('report-rules: CSV', () => {
  it('guarda anti formula-injection en celdas de texto (OWASP)', () => {
    expect(csvText('=SUM(1)')).toBe("'=SUM(1)");
    expect(csvText('+32')).toBe("'+32");
    expect(csvText('-cmd')).toBe("'-cmd");
    expect(csvText('@import')).toBe("'@import");
    expect(csvText('\tx')).toBe("'\tx");
    expect(csvText('safe')).toBe('safe');
    // El prefijo se aplica ANTES de las comillas: doble protección.
    expect(csvText('=HYPERLINK("u","p")')).toBe(`"'=HYPERLINK(""u"",""p"")"`);
  });

  it('comillas RFC: escapa comas y duplica comillas', () => {
    expect(csvText('a,b')).toBe('"a,b"');
    expect(csvText('say "hi"')).toBe('"say ""hi"""');
    expect(csvText('line1\nline2')).toBe('"line1\nline2"');
    expect(csvText('comma " and\nnewline')).toBe('"comma "" and\nnewline"');
  });

  it('buildCsv: cabecera + filas con CRLF final y números sin tocar', () => {
    const csv = buildCsv(
      ['amount', 'label', 'note'],
      [
        [
          { kind: 'number', value: -300 },
          { kind: 'text', value: '=evil' },
          { kind: 'text', value: 'a,b' },
        ],
        [
          { kind: 'number', value: 105.5 },
          { kind: 'text', value: 'ok' },
          { kind: 'text', value: '' },
        ],
      ],
    );
    expect(csv).toBe('amount,label,note\r\n-300,\'=evil,"a,b"\r\n105.5,ok,\r\n');
    // El número negativo NUNCA recibe la guarda (es importe del servidor).
    expect(csv).toContain('-300');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('buildCsv: número no finito → celda vacía y sin filas → solo cabecera', () => {
    const csv = buildCsv(
      ['value'],
      [[{ kind: 'number', value: Number.NaN }], [{ kind: 'number', value: Infinity }]],
    );
    expect(csv).toBe('value\r\n\r\n\r\n');
    expect(buildCsv(['only'], [])).toBe('only\r\n');
  });
});
