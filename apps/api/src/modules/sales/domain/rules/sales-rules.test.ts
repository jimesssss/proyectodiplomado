import { describe, expect, it } from 'vitest';
import { SALE_KINDS } from '../entities/sale-document.js';
import {
  canArchive,
  canRestore,
  canTransition,
  computeLine,
  computeTotals,
  normalizeCurrency,
  roundMoney,
  SALE_TRANSITIONS,
  validateCurrency,
} from './sales-rules.js';

describe('sales rules: roundMoney', () => {
  it('redondea a 2 decimales (mitad hacia arriba)', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
    expect(roundMoney(-3.333)).toBe(-3.33);
    expect(roundMoney(1.239_999)).toBe(1.24);
  });
});

describe('sales rules: computeLine', () => {
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

describe('sales rules: computeTotals', () => {
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

describe('sales rules: transiciones', () => {
  it('cotización: draft → sent → approved (y rejected/cancelled desde sent)', () => {
    expect(canTransition('sales.quote', 'draft', 'sent')).toBe(true);
    expect(canTransition('sales.quote', 'sent', 'approved')).toBe(true);
    expect(canTransition('sales.quote', 'sent', 'rejected')).toBe(true);
    expect(canTransition('sales.quote', 'sent', 'cancelled')).toBe(true);
    expect(canTransition('sales.quote', 'draft', 'approved')).toBe(false); // solo vía approve
    expect(canTransition('sales.quote', 'approved', 'sent')).toBe(false); // terminal
    expect(canTransition('sales.quote', 'cancelled', 'draft')).toBe(false);
  });

  it('pedido: draft → confirmed → fulfilled; factura: draft → issued → paid', () => {
    expect(canTransition('sales.order', 'draft', 'confirmed')).toBe(true);
    expect(canTransition('sales.order', 'confirmed', 'fulfilled')).toBe(true);
    expect(canTransition('sales.order', 'draft', 'fulfilled')).toBe(false); // salto
    expect(canTransition('sales.invoice', 'draft', 'issued')).toBe(true);
    expect(canTransition('sales.invoice', 'issued', 'paid')).toBe(true);
    expect(canTransition('sales.invoice', 'issued', 'draft')).toBe(false);
  });

  it('envío y devolución: rama lineal hasta received/refunded', () => {
    expect(canTransition('sales.delivery', 'draft', 'shipped')).toBe(true);
    expect(canTransition('sales.delivery', 'shipped', 'received')).toBe(true);
    expect(canTransition('sales.delivery', 'draft', 'received')).toBe(false);
    expect(canTransition('sales.return', 'draft', 'received')).toBe(true);
    expect(canTransition('sales.return', 'received', 'refunded')).toBe(true);
    expect(canTransition('sales.return', 'received', 'draft')).toBe(false);
  });

  it('los estados terminales no tienen salida y cancelled es terminal', () => {
    for (const kind of SALE_KINDS) {
      expect(SALE_TRANSITIONS[kind].cancelled).toHaveLength(0);
    }
    expect(SALE_TRANSITIONS['sales.quote'].approved).toHaveLength(0);
    expect(SALE_TRANSITIONS['sales.order'].fulfilled).toHaveLength(0);
    expect(SALE_TRANSITIONS['sales.invoice'].paid).toHaveLength(0);
  });
});

describe('sales rules: archivado y moneda', () => {
  it('solo lo activo se archiva; solo lo archivado se restaura', () => {
    expect(canArchive(false)).toBe(true);
    expect(canArchive(true)).toBe(false);
    expect(canRestore(true)).toBe(true);
    expect(canRestore(false)).toBe(false);
  });

  it('moneda ISO-4217 a mayúsculas y validación', () => {
    expect(normalizeCurrency(' mxn ')).toBe('MXN');
    expect(validateCurrency('eur').valid).toBe(true);
    expect(validateCurrency('EU').valid).toBe(false);
    expect(validateCurrency('EURO').valid).toBe(false);
  });
});
