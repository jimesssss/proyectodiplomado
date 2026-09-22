import { describe, expect, it } from 'vitest';
import {
  canArchive,
  canCountTransition,
  canRestore,
  canTransferTransition,
  COUNT_TRANSITIONS,
  normalizeCode,
  roundMoney,
  TRANSFER_TRANSITIONS,
  validateCode,
} from './inventory-rules.js';

describe('inventory rules: transferencias', () => {
  it('draft → in_transit → completed; cancelled desde draft/in_transit', () => {
    expect(canTransferTransition('draft', 'in_transit')).toBe(true);
    expect(canTransferTransition('in_transit', 'completed')).toBe(true);
    expect(canTransferTransition('draft', 'cancelled')).toBe(true);
    expect(canTransferTransition('in_transit', 'cancelled')).toBe(true);
    expect(canTransferTransition('draft', 'completed')).toBe(false); // salto
    expect(canTransferTransition('completed', 'in_transit')).toBe(false); // terminal
    expect(canTransferTransition('cancelled', 'draft')).toBe(false);
  });

  it('los estados terminales no tienen salida', () => {
    expect(TRANSFER_TRANSITIONS.completed).toHaveLength(0);
    expect(TRANSFER_TRANSITIONS.cancelled).toHaveLength(0);
  });
});

describe('inventory rules: conteos', () => {
  it('approved solo en la máquina (desde draft) y terminales sin salida', () => {
    expect(canCountTransition('draft', 'approved')).toBe(true); // vía endpoint
    expect(canCountTransition('draft', 'cancelled')).toBe(true);
    expect(canCountTransition('cancelled', 'approved')).toBe(false); // 409 al aprobar
    expect(canCountTransition('approved', 'cancelled')).toBe(false);
    expect(COUNT_TRANSITIONS.approved).toHaveLength(0);
    expect(COUNT_TRANSITIONS.cancelled).toHaveLength(0);
  });

  it('archivado: solo lo activo se archiva; solo lo archivado se restaura', () => {
    expect(canArchive(false)).toBe(true);
    expect(canArchive(true)).toBe(false);
    expect(canRestore(true)).toBe(true);
    expect(canRestore(false)).toBe(false);
  });
});

describe('inventory rules: código y redondeo', () => {
  it('código de producto: mayúsculas y espacios a guiones, con validación', () => {
    expect(normalizeCode(' tornillo m6 ')).toBe('TORNILLO-M6');
    expect(normalizeCode('lote  b')).toBe('LOTE-B');
    expect(validateCode('SKU-01').valid).toBe(true);
    expect(validateCode('A').valid).toBe(false); // mínimo 2
    expect(validateCode('con espacios').valid).toBe(false);
    expect(validateCode('x'.repeat(33)).valid).toBe(false);
  });

  it('roundMoney (re-exportado de core) redondea a 2 decimales', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(1.239_999)).toBe(1.24);
  });
});
