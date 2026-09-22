import { describe, expect, it } from 'vitest';
import { PURCHASE_KINDS } from '../entities/purchase-document.js';
import {
  canArchive,
  canRestore,
  canTransition,
  normalizeCode,
  normalizeCurrency,
  PURCHASE_TRANSITIONS,
  validateCode,
  validateCurrency,
} from './purchase-rules.js';

// El cálculo de importes (roundMoney/computeLine/computeTotals) vive en
// `core/domain/line-totals.test.ts` (compartido con Sales, FASE 10).

describe('purchasing rules: transiciones', () => {
  it('solicitud: draft → submitted → approved/rejected (y cancelled)', () => {
    expect(canTransition('purchase.request', 'draft', 'submitted')).toBe(true);
    expect(canTransition('purchase.request', 'submitted', 'approved')).toBe(true);
    expect(canTransition('purchase.request', 'submitted', 'rejected')).toBe(true);
    expect(canTransition('purchase.request', 'draft', 'approved')).toBe(false); // salto
    expect(canTransition('purchase.request', 'approved', 'submitted')).toBe(false); // terminal
  });

  it('orden: draft → confirmed → completed; factura: draft → issued → paid', () => {
    expect(canTransition('purchase.order', 'draft', 'confirmed')).toBe(true);
    expect(canTransition('purchase.order', 'confirmed', 'completed')).toBe(true);
    expect(canTransition('purchase.order', 'draft', 'completed')).toBe(false); // salto
    expect(canTransition('supplier.invoice', 'draft', 'issued')).toBe(true);
    expect(canTransition('supplier.invoice', 'issued', 'paid')).toBe(true);
    expect(canTransition('supplier.invoice', 'issued', 'draft')).toBe(false);
  });

  it('recepción: draft → received → posted (entrada de stock FASE 11)', () => {
    expect(canTransition('goods.receipt', 'draft', 'received')).toBe(true);
    expect(canTransition('goods.receipt', 'received', 'posted')).toBe(true);
    expect(canTransition('goods.receipt', 'draft', 'posted')).toBe(false);
    expect(canTransition('goods.receipt', 'posted', 'received')).toBe(false);
  });

  it('devolución: rama lineal hasta refunded', () => {
    expect(canTransition('purchase.return', 'draft', 'received')).toBe(true);
    expect(canTransition('purchase.return', 'received', 'refunded')).toBe(true);
    expect(canTransition('purchase.return', 'draft', 'refunded')).toBe(false);
    expect(canTransition('purchase.return', 'received', 'draft')).toBe(false);
  });

  it('los estados terminales no tienen salida y cancelled es terminal', () => {
    for (const kind of PURCHASE_KINDS) {
      expect(PURCHASE_TRANSITIONS[kind].cancelled).toHaveLength(0);
    }
    expect(PURCHASE_TRANSITIONS['purchase.request'].approved).toHaveLength(0);
    expect(PURCHASE_TRANSITIONS['purchase.order'].completed).toHaveLength(0);
    expect(PURCHASE_TRANSITIONS['goods.receipt'].posted).toHaveLength(0);
    expect(PURCHASE_TRANSITIONS['supplier.invoice'].paid).toHaveLength(0);
    expect(PURCHASE_TRANSITIONS['purchase.return'].refunded).toHaveLength(0);
  });
});

describe('purchasing rules: archivado, código y moneda', () => {
  it('solo lo activo se archiva; solo lo archivado se restaura', () => {
    expect(canArchive(false)).toBe(true);
    expect(canArchive(true)).toBe(false);
    expect(canRestore(true)).toBe(true);
    expect(canRestore(false)).toBe(false);
  });

  it('código de proveedor: mayúsculas y espacios a guiones, con validación', () => {
    expect(normalizeCode(' proveedor sa ')).toBe('PROVEEDOR-SA');
    expect(normalizeCode('acme  corp')).toBe('ACME-CORP');
    expect(validateCode('ACME-01').valid).toBe(true);
    expect(validateCode('A').valid).toBe(false); // mínimo 2
    expect(validateCode('con espacios').valid).toBe(false);
    expect(validateCode('x'.repeat(33)).valid).toBe(false);
  });

  it('moneda ISO-4217 a mayúsculas y validación', () => {
    expect(normalizeCurrency(' mxn ')).toBe('MXN');
    expect(validateCurrency('eur').valid).toBe(true);
    expect(validateCurrency('EURO').valid).toBe(false);
  });
});
