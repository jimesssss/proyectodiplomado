/**
 * Reglas de dominio Manufacturing — FASE 16.
 * Puras (sin Mongo/Express): máquina de estados de la orden, archivado,
 * normalización/validación del código BOM, reglas de líneas de componente,
 * redondeo de unidades (6 decimales) y escala `línea × unidades` del
 * pre-chequeo de stock al completar.
 */
import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_TRANSITIONS,
  canArchive,
  canProductionTransition,
  canRestore,
  computeComponentRequirements,
  isEditable,
  normalizeBomCode,
  roundQuantity,
  validateBomCode,
  validateComponentLines,
} from './manufacturing-rules.js';
import { PRODUCTION_PREFIX, PRODUCTION_STATUSES } from '../entities/production-order.js';

const OUT = '64b000000000000000000001';
const COMP1 = '64b000000000000000000002';
const COMP2 = '64b000000000000000000003';

describe('manufacturing rules: máquina de estados de la orden', () => {
  it('draft → in_progress|cancelled; in_progress → completed|cancelled', () => {
    expect(PRODUCTION_TRANSITIONS.draft).toEqual(['in_progress', 'cancelled']);
    expect(PRODUCTION_TRANSITIONS.in_progress).toEqual(['completed', 'cancelled']);
    expect(canProductionTransition('draft', 'in_progress')).toBe(true);
    expect(canProductionTransition('draft', 'cancelled')).toBe(true);
    expect(canProductionTransition('in_progress', 'completed')).toBe(true);
    expect(canProductionTransition('in_progress', 'cancelled')).toBe(true);
  });

  it('sin saltos: draft → completed, in_progress → draft, y terminales sin salida', () => {
    expect(canProductionTransition('draft', 'completed')).toBe(false);
    expect(canProductionTransition('in_progress', 'draft')).toBe(false);
    expect(canProductionTransition('completed', 'in_progress')).toBe(false);
    expect(canProductionTransition('completed', 'cancelled')).toBe(false);
    expect(canProductionTransition('cancelled', 'draft')).toBe(false);
    expect(canProductionTransition('cancelled', 'completed')).toBe(false);
    expect(PRODUCTION_TRANSITIONS.completed).toEqual([]);
    expect(PRODUCTION_TRANSITIONS.cancelled).toEqual([]);
  });

  it('los 4 estados existen y el prefijo de numeración es MO', () => {
    expect([...PRODUCTION_STATUSES]).toEqual(['draft', 'in_progress', 'completed', 'cancelled']);
    expect(PRODUCTION_PREFIX).toBe('MO');
  });

  it('solo draft es editable (campos de negocio inmutables fuera de él)', () => {
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('in_progress')).toBe(false);
    expect(isEditable('completed')).toBe(false);
    expect(isEditable('cancelled')).toBe(false);
  });

  it('archivado: doble archive/restore sin efecto se rechaza en la capa de servicio', () => {
    expect(canArchive(false)).toBe(true);
    expect(canArchive(true)).toBe(false);
    expect(canRestore(true)).toBe(true);
    expect(canRestore(false)).toBe(false);
  });
});

describe('manufacturing rules: código BOM', () => {
  it('normalizeBomCode: mayúsculas y espacios → guiones', () => {
    expect(normalizeBomCode('caja kit')).toBe('CAJA-KIT');
    expect(normalizeBomCode(' tornillo  m6 ')).toBe('TORNILLO-M6'); // \s+ colapsa
    expect(normalizeBomCode('BOM-01')).toBe('BOM-01');
  });

  it('validateBomCode: 2-32 chars (letras, dígitos, punto, guion, guion bajo)', () => {
    expect(validateBomCode('CAJA-KIT').valid).toBe(true);
    expect(validateBomCode('A.B_C-1').valid).toBe(true); // el servicio valida ya normalizado
    expect(validateBomCode('A').valid).toBe(false);
    expect(validateBomCode('X'.repeat(33)).valid).toBe(false);
    expect(validateBomCode('.startsWith-dot').valid).toBe(false);
    const check = validateBomCode('A');
    expect(check.issues).toEqual([
      'Code must be 2-32 chars: letters, digits, dot, dash or underscore',
    ]);
  });
});

describe('manufacturing rules: líneas de componente', () => {
  it('≥1 línea obligatoria', () => {
    const check = validateComponentLines(OUT, []);
    expect(check.valid).toBe(false);
    expect(check.issues).toContain('At least one component line is required');
  });

  it('cantidad ≤ 0 o no finita se rechaza', () => {
    expect(validateComponentLines(OUT, [{ productId: COMP1, quantity: 0 }]).valid).toBe(false);
    expect(validateComponentLines(OUT, [{ productId: COMP1, quantity: -2 }]).valid).toBe(false);
    expect(validateComponentLines(OUT, [{ productId: COMP1, quantity: NaN }]).issues).toContain(
      'Line quantity must be greater than 0',
    );
  });

  it('productos duplicados en las líneas se rechazan', () => {
    const check = validateComponentLines(OUT, [
      { productId: COMP1, quantity: 1 },
      { productId: COMP1, quantity: 2 },
    ]);
    expect(check.valid).toBe(false);
    expect(check.issues).toContain('Duplicate component product');
  });

  it('el producto terminado NUNCA puede ser su propio componente', () => {
    const check = validateComponentLines(OUT, [
      { productId: COMP1, quantity: 1 },
      { productId: OUT, quantity: 1 },
    ]);
    expect(check.valid).toBe(false);
    expect(check.issues).toContain('Output product cannot be a component');
  });

  it('plan válido: sin issues (incluye producto terminado distinto de componentes)', () => {
    const check = validateComponentLines(OUT, [
      { productId: COMP1, quantity: 0.5 },
      { productId: COMP2, quantity: 2 },
    ]);
    expect(check.valid).toBe(true);
    expect(check.issues).toEqual([]);
  });
});

describe('manufacturing rules: escala de requerimientos al completar', () => {
  it('roundQuantity: 6 decimales (sin polvo de coma flotante)', () => {
    expect(roundQuantity(0.1 * 3)).toBe(0.3); // 0.30000000000000004 crudo
    expect(roundQuantity(1 / 3)).toBe(0.333333);
    expect(roundQuantity(2)).toBe(2);
  });

  it('computeComponentRequirements: línea POR UNIDAD × unidades', () => {
    const requirements = computeComponentRequirements(
      [
        { productId: COMP1, quantity: 0.5 },
        { productId: COMP2, quantity: 2 },
      ],
      4,
    );
    expect(requirements).toEqual([
      { productId: COMP1, quantity: 2 },
      { productId: COMP2, quantity: 8 },
    ]);
  });

  it('computeComponentRequirements: 0.1 × 30 = 3 exacto (redondeo a 6 dec.)', () => {
    expect(computeComponentRequirements([{ productId: COMP1, quantity: 0.1 }], 30)).toEqual([
      { productId: COMP1, quantity: 3 },
    ]);
  });
});
