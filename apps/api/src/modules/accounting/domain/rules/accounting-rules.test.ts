/**
 * Reglas de dominio Accounting — FASE 12 (unitarias, sin base de datos).
 */
import { describe, expect, it } from 'vitest';
import { normalBalanceFor } from '../entities/account.js';
import {
  JOURNAL_TRANSITIONS,
  PERIOD_TRANSITIONS,
  canArchive,
  canJournalTransition,
  canPeriodTransition,
  canRestore,
  isEditable,
  journalTotals,
  normalizeCode,
  normalizeCurrency,
  normalizeJournalLines,
  validateCode,
  validateCurrency,
} from './accounting-rules.js';

describe('accounting rules: máquina del asiento', () => {
  it('draft → posted|cancelled; posted/cancelled son terminales', () => {
    expect(canJournalTransition('draft', 'posted')).toBe(true);
    expect(canJournalTransition('draft', 'cancelled')).toBe(true);
    expect(canJournalTransition('posted', 'cancelled')).toBe(false);
    expect(canJournalTransition('cancelled', 'posted')).toBe(false);
    expect(canJournalTransition('posted', 'draft')).toBe(false);
    expect(canJournalTransition('draft', 'draft')).toBe(false);
    expect(JOURNAL_TRANSITIONS.posted).toEqual([]);
    expect(JOURNAL_TRANSITIONS.cancelled).toEqual([]);
  });
});

describe('accounting rules: máquina del período fiscal', () => {
  it('open → closed; closed es terminal (sin re-apertura en FASE 12)', () => {
    expect(canPeriodTransition('open', 'closed')).toBe(true);
    expect(canPeriodTransition('closed', 'open')).toBe(false);
    expect(canPeriodTransition('closed', 'closed')).toBe(false);
    expect(canPeriodTransition('open', 'open')).toBe(false);
    expect(PERIOD_TRANSITIONS.closed).toEqual([]);
  });

  it('solo los borradores son editables; archivar/restore por bandera', () => {
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('posted')).toBe(false);
    expect(isEditable('cancelled')).toBe(false);
    expect(isEditable('closed')).toBe(false);
    expect(canArchive(false)).toBe(true);
    expect(canArchive(true)).toBe(false);
    expect(canRestore(true)).toBe(true);
    expect(canRestore(false)).toBe(false);
  });
});

describe('accounting rules: código y divisa', () => {
  it('normalizeCode: mayúsculas y espacios → guiones; validate 2-32 chars', () => {
    expect(normalizeCode(' caja 5 ')).toBe('CAJA-5');
    expect(normalizeCode('ingresos  operación')).toBe('INGRESOS-OPERACIÓN');
    expect(validateCode('1000').valid).toBe(true); // plan contable numérico
    expect(validateCode('VAT-16').valid).toBe(true);
    expect(validateCode('A').valid).toBe(false); // mínimo 2
    expect(validateCode('con espacios').valid).toBe(false);
    expect(validateCode('x'.repeat(33)).valid).toBe(false);
  });

  it('normalizeCurrency/validateCurrency: ISO-4217 de 3 letras', () => {
    expect(normalizeCurrency(' mxn ')).toBe('MXN');
    expect(validateCurrency('USD').valid).toBe(true);
    expect(validateCurrency('PESO').valid).toBe(false);
    expect(validateCurrency('EU').valid).toBe(false);
  });
});

describe('accounting rules: saldo normal derivado', () => {
  it('asset/expense → debit; liability/equity/revenue → credit', () => {
    expect(normalBalanceFor('asset')).toBe('debit');
    expect(normalBalanceFor('expense')).toBe('debit');
    expect(normalBalanceFor('liability')).toBe('credit');
    expect(normalBalanceFor('equity')).toBe('credit');
    expect(normalBalanceFor('revenue')).toBe('credit');
  });
});

describe('accounting rules: líneas y totales del asiento', () => {
  const acc = 'aaaaaaaaaaaaaaaaaaaaaaaa';

  it('normalizeJournalLines: importes a 2 decimales y descripción default null', () => {
    const [line] = normalizeJournalLines([{ accountId: acc, debit: 10.006, credit: 0 }]);
    expect(line?.debit).toBe(10.01);
    expect(line?.credit).toBe(0);
    expect(line?.description).toBeNull();
    const [withDescription] = normalizeJournalLines([
      { accountId: acc, description: 'Nota', debit: 0, credit: 5 },
    ]);
    expect(withDescription?.description).toBe('Nota');
    expect(withDescription?.credit).toBe(5);
  });

  it('journalTotals: sumas redondeadas (DEBIT=CREDIT es una igualdad exacta)', () => {
    const lines = normalizeJournalLines([
      { accountId: acc, debit: 0.1, credit: 0 },
      { accountId: acc, debit: 0.2, credit: 0 },
      { accountId: acc, debit: 0, credit: 0.1 },
      { accountId: acc, debit: 0, credit: 0.2 },
    ]);
    const totals = journalTotals(lines);
    expect(totals.debits).toBe(0.3); // sin residuo de float (0.1+0.2)
    expect(totals.credits).toBe(0.3);
    expect(totals.debits).toBe(totals.credits);
    expect(journalTotals([])).toEqual({ debits: 0, credits: 0 });
  });
});
