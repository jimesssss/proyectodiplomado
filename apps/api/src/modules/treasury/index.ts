/**
 * Superficie pública del módulo Treasury (FASE 13).
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 */
export {
  createTreasuryRouters,
  TREASURY_ROUTE_PATHS,
  type TreasuryRouterDeps,
} from './presentation/routes/treasury-routes.js';
export {
  archiveTreasuryAccount,
  assertAccountActive,
  createTreasuryAccount,
  getTreasuryAccount,
  listAccountMovements,
  listTreasuryAccounts,
  updateTreasuryAccount,
} from './application/treasury-account-service.js';
export {
  archivePayment,
  createPayment,
  getPayment,
  listPayments,
  updatePayment,
} from './application/payment-service.js';
export {
  archiveReceipt,
  createReceipt,
  getReceipt,
  listReceipts,
  updateReceipt,
} from './application/receipt-service.js';
export {
  createBankTransaction,
  getBankTransaction,
  listBankTransactions,
  updateBankTransaction,
} from './application/bank-transaction-service.js';
export {
  createReconciliation,
  getReconciliation,
  listReconciliations,
  updateReconciliation,
} from './application/reconciliation-service.js';
export {
  toPublicTreasuryAccount,
  TREASURY_ACCOUNT_TYPES,
  type PublicTreasuryAccount,
  type TreasuryAccount,
  type TreasuryAccountType,
} from './domain/entities/treasury-account.js';
export {
  MONEY_STATUSES,
  toPublicPayment,
  toPublicReceipt,
  type MoneyStatus,
  type Payment,
  type PublicPayment,
  type PublicReceipt,
  type Receipt,
} from './domain/entities/money-documents.js';
export {
  toPublicBankTransaction,
  type BankTransaction,
  type PublicBankTransaction,
} from './domain/entities/bank-transaction.js';
export {
  toPublicReconciliation,
  type PublicReconciliation,
  type Reconciliation,
  type ReconciliationLine,
} from './domain/entities/reconciliation.js';
export {
  CASH_MOVEMENT_SOURCE_TYPES,
  toPublicCashMovement,
  type CashMovement,
  type CashMovementSourceType,
  type PublicCashMovement,
} from './domain/entities/cash-movement.js';
export { canMoneyTransition, MONEY_TRANSITIONS } from './domain/rules/treasury-rules.js';
