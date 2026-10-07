import { apiList, apiRequest } from './api-client';
export interface ApiParty { id: string; code: string; name: string; type?: 'company' | 'person'; email: string | null; phone: string | null;
  taxId: string | null; address: { street?: string; city?: string; region?: string; country?: string } | null; archived: boolean; }
export interface ApiLine { description: string; quantity: number; unitPrice: number; taxRate: number; discountPct: number; productId?: string | null; total?: number; }
export interface ApiDocument { id: string; number: string; customerId?: string; supplierId?: string; status: string;
  currency: string; issueDate: string; lines: ApiLine[]; subtotal: number; tax: number; total: number; archived: boolean; }
export interface ApiUser { id: string; displayName: string; email: string; roles: string[]; status: 'active' | 'disabled'; }
export interface ApiAccount { id: string; name: string; code: string; type: 'bank' | 'cash'; currency: string; balance: number; openingBalance: number; archived: boolean; }
export interface ApiMoney { id: string; number: string; accountId: string; amount: number; date: string; notes: string | null; reference: string | null; status: 'draft' | 'posted' | 'cancelled'; }
export const businessApi = {
  listCustomers: () => apiList<ApiParty>('/customers'), listSuppliers: () => apiList<ApiParty>('/suppliers'),
  listInvoices: () => apiList<ApiDocument>('/sales/invoices?archived=false'),
  listOrders: () => apiList<ApiDocument>('/purchasing/orders?archived=false'),
  listUsers: () => apiList<ApiUser>('/users'), listAccounts: () => apiList<ApiAccount>('/treasury/accounts?archived=false'),
  create: async <T>(path: string, body: unknown): Promise<T> => (await apiRequest<T>(path, { method: 'POST', body })).data,
  update: async <T>(path: string, body: unknown): Promise<T> => (await apiRequest<T>(path, { method: 'PATCH', body })).data,
};
