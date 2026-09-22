import { describe, expect, it } from 'vitest';
import { SALE_KINDS } from '../entities/sale-document.js';
import {
  canArchive,
  canRestore,
  canTransition,
  normalizeCurrency,
  SALE_TRANSITIONS,
  validateCurrency,
} from './sales-rules.js';

// El cálculo de importes (roundMoney/computeLine/computeTotals) vive ahora en
// `core/domain/line-totals.test.ts` (compartido con Purchasing, FASE 10).

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
