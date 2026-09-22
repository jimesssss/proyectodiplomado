/**
 * Superficie pública del módulo Accounting (FASE 12).
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 */
export {
  createAccountingRouters,
  ACCOUNTING_ROUTE_PATHS,
  type AccountingRouterDeps,
} from './presentation/routes/accounting-routes.js';
export {
  archiveAccount,
  assertAccountActive,
  createAccount,
  getAccount,
  listAccounts,
  updateAccount,
} from './application/account-service.js';
export {
  createJournalEntry,
  getJournalEntry,
  listJournalEntries,
  postJournalEntry,
  updateJournalEntry,
} from './application/journal-service.js';
export {
  createPeriod,
  getPeriod,
  listPeriods,
  updatePeriod,
} from './application/period-service.js';
export { archiveTax, createTax, getTax, listTaxes, updateTax } from './application/tax-service.js';
export {
  ACCOUNT_NATURES,
  normalBalanceFor,
  toPublicAccount,
  type Account,
  type AccountNature,
  type NormalBalance,
  type PublicAccount,
} from './domain/entities/account.js';
export {
  JOURNAL_STATUSES,
  toPublicJournalEntry,
  type JournalEntry,
  type JournalLine,
  type JournalStatus,
  type PublicJournalEntry,
} from './domain/entities/journal-entry.js';
export {
  PERIOD_STATUSES,
  toPublicFiscalPeriod,
  type FiscalPeriod,
  type PeriodStatus,
  type PublicFiscalPeriod,
} from './domain/entities/fiscal-period.js';
export { toPublicTax, type PublicTax, type Tax } from './domain/entities/tax.js';
export {
  JOURNAL_TRANSITIONS,
  PERIOD_TRANSITIONS,
  canJournalTransition,
  canPeriodTransition,
  journalTotals,
} from './domain/rules/accounting-rules.js';
