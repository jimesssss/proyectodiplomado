import type { ApiDocument } from './business-api';
export function customerMetrics(id: string, documents: readonly ApiDocument[]) {
  const history = documents
    .filter((d) => d.customerId === id && !d.archived && ['issued', 'paid'].includes(d.status))
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  return {
    history,
    totalPurchases: history.length,
    totalSpent: history
      .filter((d) => d.status === 'paid' && d.currency === 'MXN')
      .reduce((n, d) => n + d.total, 0),
    lastPurchase: history[0]?.issueDate.slice(0, 10),
  };
}
