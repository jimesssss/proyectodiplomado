/**
 * Reglas de dominio Treasury — FASE 13 (unitarias, sin base de datos).
 */
import { describe, expect, it } from 'vitest';
import { toPublicBankTransaction } from '../entities/bank-transaction.js';
import { toPublicCashMovement } from '../entities/cash-movement.js';
import {
  toPublicPayment,
  toPublicReceipt,
  type Payment,
  type Receipt,
} from '../entities/money-documents.js';
import { toPublicTreasuryAccount, type TreasuryAccount } from '../entities/treasury-account.js';
import {
  MONEY_MAX,
  MONEY_TRANSITIONS,
  PAYMENT_PREFIX,
  RECEIPT_PREFIX,
  RECONCILIATION_PREFIX,
  canArchive,
  canMoneyTransition,
  canRestore,
  isEditable,
  normalizeCode,
  normalizeCurrency,
  roundMoney,
  validateCode,
  validateCurrency,
} from './treasury-rules.js';

const NOW = new Date('2026-01-15T10:00:00.000Z');
const SECRET_TENANT = 'tenant-secreto-no-expuesto';

const account: TreasuryAccount = {
  id: 'a1',
  tenantId: SECRET_TENANT,
  type: 'bank',
  code: 'BANCO-1',
  name: 'Banco',
  description: null,
  accountNumber: null,
  currency: 'MXN',
  openingBalance: 1_000,
  balance: 875,
  archived: false,
  createdAt: NOW,
  updatedAt: NOW,
};

const payment: Payment = {
  id: 'p1',
  tenantId: SECRET_TENANT,
  number: 'PAY-2026-000001',
  accountId: 'a1',
  amount: 125,
  date: NOW,
  invoiceId: null,
  reference: null,
  notes: null,
  status: 'draft',
  archived: false,
  createdAt: NOW,
  updatedAt: NOW,
};

const receipt: Receipt = {
  id: 'r1',
  tenantId: SECRET_TENANT,
  number: 'RCP-2026-000001',
  accountId: 'a1',
  amount: 350,
  date: NOW,
  invoiceId: null,
  reference: null,
  notes: null,
  status: 'posted',
  archived: false,
  createdAt: NOW,
  updatedAt: NOW,
};

describe('treasury rules: máquina de dinero', () => {
  it('draft → posted|cancelled; posted/cancelled son terminales', () => {
    expect(canMoneyTransition('draft', 'posted')).toBe(true);
    expect(canMoneyTransition('draft', 'cancelled')).toBe(true);
    expect(canMoneyTransition('posted', 'cancelled')).toBe(false);
    expect(canMoneyTransition('cancelled', 'posted')).toBe(false);
    expect(canMoneyTransition('posted', 'draft')).toBe(false);
    expect(canMoneyTransition('draft', 'draft')).toBe(false);
    expect(MONEY_TRANSITIONS.posted).toEqual([]);
    expect(MONEY_TRANSITIONS.cancelled).toEqual([]);
  });

  it('solo los borradores son editables; archivar/restore por bandera', () => {
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('posted')).toBe(false);
    expect(isEditable('cancelled')).toBe(false);
    expect(canArchive(false)).toBe(true);
    expect(canArchive(true)).toBe(false);
    expect(canRestore(true)).toBe(true);
    expect(canRestore(false)).toBe(false);
  });
});

describe('treasury rules: código y divisa', () => {
  it('normalizeCode: mayúsculas y espacios → guiones; validate 2-32 chars', () => {
    expect(normalizeCode(' banco 1 ')).toBe('BANCO-1');
    expect(normalizeCode('caja  chica')).toBe('CAJA-CHICA');
    expect(validateCode('BANCO-1').valid).toBe(true);
    expect(validateCode('ES99.0001').valid).toBe(true);
    expect(validateCode('B').valid).toBe(false); // mínimo 2
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

describe('treasury rules: dinero y numeración', () => {
  it('roundMoney re-exportado de core: 2 decimales; MONEY_MAX de line-totals', () => {
    expect(roundMoney(10.006)).toBe(10.01);
    expect(roundMoney(9.999)).toBe(10);
    expect(roundMoney(125.5)).toBe(125.5);
    expect(MONEY_MAX).toBe(1e12);
  });

  it('prefijos de numeración PAY/RCP/REC (core/numbering)', () => {
    expect(PAYMENT_PREFIX).toBe('PAY');
    expect(RECEIPT_PREFIX).toBe('RCP');
    expect(RECONCILIATION_PREFIX).toBe('REC');
  });
});

describe('treasury rules: representaciones públicas', () => {
  it('toPublic* de cuentas, pagos y cobros nunca exponen tenantId', () => {
    const publics = [
      toPublicTreasuryAccount(account),
      toPublicPayment(payment),
      toPublicReceipt(receipt),
    ];
    for (const item of publics) {
      const raw = JSON.stringify(item);
      expect(raw).not.toContain('tenantId');
      expect(raw).not.toContain(SECRET_TENANT);
    }
  });

  it('toPublicBankTransaction deriva `reconciled` desde reconciliationId', () => {
    const base = {
      id: 't1',
      tenantId: SECRET_TENANT,
      accountId: 'a1',
      date: NOW,
      amount: -40,
      externalId: null,
      description: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const pending = toPublicBankTransaction({ ...base, reconciliationId: null });
    expect(pending.reconciled).toBe(false);
    expect(pending.reconciliationId).toBeNull();
    const done = toPublicBankTransaction({ ...base, reconciliationId: 'rec1' });
    expect(done.reconciled).toBe(true);
    expect(JSON.stringify(done)).not.toContain(SECRET_TENANT);
  });

  it('toPublicCashMovement expone el ledger (append-only) sin tenantId', () => {
    const movement = toPublicCashMovement({
      id: 'm1',
      tenantId: SECRET_TENANT,
      accountId: 'a1',
      amount: -125,
      balanceAfter: 875,
      sourceType: 'payment',
      sourceId: 'p1',
      reason: 'Payment PAY-2026-000001',
      createdAt: NOW,
    });
    expect(movement.balanceAfter).toBe(875);
    expect(movement.sourceType).toBe('payment');
    expect(movement.amount).toBe(-125);
    expect(JSON.stringify(movement)).not.toContain(SECRET_TENANT);
  });
});
