import { describe, expect, it } from 'vitest';
import { buildCounterKey, formatNumber } from './numbering.js';

describe('numbering: formatNumber', () => {
  it('genera PREFIX-YYYY-secuencia con 6 dígitos', () => {
    expect(formatNumber('QT', 2026, 1)).toBe('QT-2026-000001');
    expect(formatNumber('IV', 2026, 123_456)).toBe('IV-2026-123456');
    expect(formatNumber('SO', 2027, 999_999)).toBe('SO-2027-999999');
  });

  it('rechaza secuencias no enteras o no positivas', () => {
    expect(() => formatNumber('QT', 2026, 0)).toThrow();
    expect(() => formatNumber('QT', 2026, 1.5)).toThrow();
    expect(() => formatNumber('QT', 2026, -3)).toThrow();
  });
});

describe('numbering: buildCounterKey', () => {
  it('aisla por tenant, serie y año', () => {
    expect(buildCounterKey('t1', 'sales.quote', 2026)).toBe('t1:sales.quote:2026');
    expect(buildCounterKey('t1', 'sales.quote', 2026)).not.toBe(
      buildCounterKey('t2', 'sales.quote', 2026),
    );
    expect(buildCounterKey('t1', 'sales.quote', 2026)).not.toBe(
      buildCounterKey('t1', 'sales.order', 2026),
    );
    expect(buildCounterKey('t1', 'sales.quote', 2026)).not.toBe(
      buildCounterKey('t1', 'sales.quote', 2027),
    );
  });
});
