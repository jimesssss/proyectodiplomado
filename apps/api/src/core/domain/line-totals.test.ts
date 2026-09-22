import { describe, expect, it } from 'vitest';
import { computeLine, computeTotals, normalizeLines, roundMoney } from './line-totals.js';

describe('core line-totals: roundMoney', () => {
  it('redondea a 2 decimales (mitad hacia arriba)', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
    expect(roundMoney(-3.333)).toBe(-3.33);
    expect(roundMoney(1.239_999)).toBe(1.24);
  });
});

describe('core line-totals: computeLine', () => {
  it('calcula subtotal, impuesto y total con 2 decimales', () => {
    const line = computeLine({
      description: 'Servicio',
      quantity: 3,
      unitPrice: 33.333,
      taxRate: 21,
      discountPct: 0,
    });
    expect(line.subtotal).toBe(100); // 99.999 → 100
    expect(line.tax).toBe(21);
    expect(line.total).toBe(121);
  });

  it('aplica el descuento ANTES del impuesto', () => {
    const line = computeLine({
      description: 'Producto',
      quantity: 2,
      unitPrice: 100,
      taxRate: 10,
      discountPct: 15,
    });
    expect(line.subtotal).toBe(170); // 200 − 15%
    expect(line.tax).toBe(17);
    expect(line.total).toBe(187);
  });

  it('sin impuesto ni descuento', () => {
    const line = computeLine({
      description: 'Manual',
      quantity: 1,
      unitPrice: 49.99,
      taxRate: 0,
      discountPct: 0,
    });
    expect(line.subtotal).toBe(49.99);
    expect(line.tax).toBe(0);
    expect(line.total).toBe(49.99);
  });
});

describe('core line-totals: computeTotals', () => {
  it('suma las líneas YA redondeadas', () => {
    const lines = [
      computeLine({ description: 'a', quantity: 1, unitPrice: 10.005, taxRate: 0, discountPct: 0 }),
      computeLine({ description: 'b', quantity: 1, unitPrice: 20.005, taxRate: 0, discountPct: 0 }),
    ];
    const totals = computeTotals(lines);
    expect(totals.subtotal).toBe(30.02); // 10.01 + 20.01 (el crudo daría 30.01)
    expect(totals.total).toBe(30.02);
  });

  it('acumula impuestos por línea', () => {
    const lines = [
      computeLine({ description: 'a', quantity: 1, unitPrice: 100, taxRate: 21, discountPct: 0 }),
      computeLine({ description: 'b', quantity: 1, unitPrice: 50, taxRate: 10, discountPct: 0 }),
    ];
    const totals = computeTotals(lines);
    expect(totals.subtotal).toBe(150);
    expect(totals.tax).toBe(26); // 21 + 5
    expect(totals.total).toBe(176);
  });
});

describe('core line-totals: normalizeLines', () => {
  it('calcula cada línea de la entrada', () => {
    const lines = normalizeLines([
      { description: 'x', quantity: 2, unitPrice: 10, taxRate: 16, discountPct: 50 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.subtotal).toBe(10); // 20 − 50%
    expect(lines[0]?.tax).toBe(1.6);
    expect(lines[0]?.total).toBe(11.6);
  });
});
