import { describe, expect, it } from 'vitest';
import {
  canArchive,
  canRestore,
  canTransitionLead,
  canTransitionOpportunity,
  escapeRegExp,
  LEAD_TRANSITIONS,
  normalizeCode,
  normalizeCurrency,
  normalizeEmail,
  OPPORTUNITY_TRANSITIONS,
  sanitizeSearchTerm,
  validateCode,
  validateName,
  validateSubject,
} from './crm-rules.js';

describe('crm rules: normalizeCode/validateCode', () => {
  it('normaliza a mayúsculas y guiones (idempotente)', () => {
    expect(normalizeCode('  cliente uno  ')).toBe('CLIENTE-UNO');
    const once = normalizeCode('CLI 01');
    expect(normalizeCode(once)).toBe(once);
  });

  it('valida longitud y caracteres', () => {
    expect(validateCode('CLI-01').valid).toBe(true);
    expect(validateCode('A').valid).toBe(false);
    expect(validateCode('A'.repeat(25)).valid).toBe(false);
    expect(validateCode('cli-01').valid).toBe(false);
    expect(validateCode('CLI--01').valid).toBe(false);
    expect(validateCode('-CLI-').valid).toBe(false);
  });
});

describe('crm rules: nombres y asunto', () => {
  it('recorta y limita longitud', () => {
    const ok = validateName('  Acme Corporation  ');
    expect(ok.valid).toBe(true);
    expect(ok.value).toBe('Acme Corporation');
    expect(validateName('   ').valid).toBe(false);
    expect(validateName('x'.repeat(121)).valid).toBe(false);
  });

  it('asunto de actividad: 1-200', () => {
    expect(validateSubject('  Llamada de seguimiento ').value).toBe('Llamada de seguimiento');
    expect(validateSubject('').valid).toBe(false);
    expect(validateSubject('x'.repeat(201)).valid).toBe(false);
  });
});

describe('crm rules: normalizaciones', () => {
  it('email a minúsculas', () => {
    expect(normalizeEmail('  Cliente@Ejemplo.COM ')).toBe('cliente@ejemplo.com');
  });

  it('moneda ISO-4217 a mayúsculas', () => {
    expect(normalizeCurrency(' eur ')).toBe('EUR');
  });

  it('término de búsqueda: 2-100', () => {
    expect(sanitizeSearchTerm(' acme ').valid).toBe(true);
    expect(sanitizeSearchTerm(' a ').valid).toBe(false);
    expect(sanitizeSearchTerm('x'.repeat(101)).valid).toBe(false);
  });

  it('escape de regex impide metacaracteres', () => {
    expect(new RegExp(escapeRegExp('c++ (x)')).test('c++ (x)')).toBe(true);
    expect(new RegExp(escapeRegExp('c++ (x)')).test('cccxy')).toBe(false);
  });
});

describe('crm rules: archivado', () => {
  it('solo lo activo se archiva; solo lo archivado se restaura', () => {
    expect(canArchive(false)).toBe(true);
    expect(canArchive(true)).toBe(false);
    expect(canRestore(true)).toBe(true);
    expect(canRestore(false)).toBe(false);
  });
});

describe('crm rules: transiciones de lead', () => {
  it('permite el camino feliz y las bajadas a lost', () => {
    expect(canTransitionLead('new', 'contacted')).toBe(true);
    expect(canTransitionLead('contacted', 'qualified')).toBe(true);
    expect(canTransitionLead('qualified', 'converted')).toBe(true);
    expect(canTransitionLead('new', 'lost')).toBe(true);
    expect(canTransitionLead('contacted', 'lost')).toBe(true);
    expect(canTransitionLead('qualified', 'lost')).toBe(true);
  });

  it('prohíbe saltos y estados terminales', () => {
    expect(canTransitionLead('new', 'qualified')).toBe(false);
    expect(canTransitionLead('new', 'converted')).toBe(false);
    expect(canTransitionLead('converted', 'contacted')).toBe(false);
    expect(canTransitionLead('lost', 'new')).toBe(false);
  });

  it('converted y lost no tienen salida', () => {
    expect(LEAD_TRANSITIONS.converted).toHaveLength(0);
    expect(LEAD_TRANSITIONS.lost).toHaveLength(0);
  });
});

describe('crm rules: transiciones de oportunidad', () => {
  it('camino feliz hasta won y bajada a lost desde etapas abiertas', () => {
    expect(canTransitionOpportunity('prospecting', 'qualification')).toBe(true);
    expect(canTransitionOpportunity('qualification', 'proposal')).toBe(true);
    expect(canTransitionOpportunity('proposal', 'negotiation')).toBe(true);
    expect(canTransitionOpportunity('negotiation', 'won')).toBe(true);
    expect(canTransitionOpportunity('prospecting', 'lost')).toBe(true);
    expect(canTransitionOpportunity('negotiation', 'lost')).toBe(true);
  });

  it('prohíbe saltos y estados terminales', () => {
    expect(canTransitionOpportunity('prospecting', 'proposal')).toBe(false);
    expect(canTransitionOpportunity('prospecting', 'won')).toBe(false);
    expect(canTransitionOpportunity('won', 'prospecting')).toBe(false);
    expect(canTransitionOpportunity('lost', 'qualification')).toBe(false);
  });

  it('won y lost no tienen salida', () => {
    expect(OPPORTUNITY_TRANSITIONS.won).toHaveLength(0);
    expect(OPPORTUNITY_TRANSITIONS.lost).toHaveLength(0);
  });
});
