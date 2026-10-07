import { create } from 'zustand';
import { businessApi, type ApiParty } from '../services/business-api';
import { useAuthStore } from './authStore';
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  totalPurchases: number;
  totalSpent: number;
  lastPurchase?: string;
  status: 'active' | 'inactive';
}


function mapCustomer(c: ApiParty): Customer { return { id: c.id, name: c.name, phone: c.phone ?? '', email: c.email ?? '', status: c.archived ? 'inactive' : 'active', totalPurchases: 0, totalSpent: 0 }; }
interface CustomersState {
  customers: Customer[]; isLoading: boolean; error: string | null;
  load(): Promise<void>; getCustomerById(id: string): Customer | undefined;
  addCustomer(input: Omit<Customer, 'id'> & { code?: string }): Promise<Customer | false>;
  updateCustomer(id: string, input: Partial<Customer>): Promise<boolean>;
}
export const useCustomersStore = create<CustomersState>((set,get)=>({
  customers: [], isLoading: false, error: null,
  load: async () => {
    set({ isLoading: true, error: null });
    try { const data=await businessApi.listCustomers(); set({ customers: data.map(mapCustomer) }); }
    catch(error) { set({ error: error instanceof Error ? error.message : 'No se pudo completar la operación.', customers: [] }); } finally { set({ isLoading: false }); }
  },
  getCustomerById: id => get().customers.find(c=>c.id===id),
  addCustomer: async input => {
    if(!useAuthStore.getState().can('customer:create')) { set({ error: 'No tienes permiso para crear clientes.' }); return false; }
    set({ isLoading: true, error: null });
    try {
      const c=await businessApi.create<ApiParty>('/customers', { code: input.code?.trim() || 'CLI-' + Date.now(), name: input.name.trim(), type: 'person',
        ...(input.phone.trim() ? { phone: input.phone.trim() } : {}), ...(input.email.trim() ? { email: input.email.trim() } : {}) });
      const customer = mapCustomer(c);
      set({ customers: [...get().customers,customer] }); return customer;
    } catch(error) { set({ error: error instanceof Error ? error.message : 'No se pudo completar la operación.' }); return false; } finally { set({ isLoading:false }); }
  },
  updateCustomer: async (id,input) => {
    if(!useAuthStore.getState().can('customer:update')) { set({ error: 'No tienes permiso para editar clientes.' }); return false; }
    try {
      const c=await businessApi.update<ApiParty>('/customers/'+id, {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.email !== undefined ? { email: input.email.trim() || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone.trim() || null } : {}),
        ...(input.status !== undefined ? { archived: input.status === 'inactive' } : {}) });
      set({ customers: get().customers.map(x=>x.id===id?mapCustomer(c):x), error:null }); return true;
    } catch(error) { set({ error: error instanceof Error ? error.message : 'No se pudo completar la operación.' }); return false; }
  },
}));
