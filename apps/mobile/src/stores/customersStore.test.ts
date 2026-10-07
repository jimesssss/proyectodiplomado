import { beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ allowed: true }));
vi.mock('./authStore', () => ({ useAuthStore: { getState: () => ({ can: () => auth.allowed }) } }));
vi.mock('../services/business-api', () => ({ businessApi: { create: vi.fn(), listCustomers: vi.fn() } }));
import { businessApi } from '../services/business-api';
import { useCustomersStore } from './customersStore';
import { usePOSStore } from './posStore';

describe('create a registered customer from POS', () => {
  beforeEach(() => {
    vi.resetAllMocks(); auth.allowed = true;
    useCustomersStore.setState(useCustomersStore.getInitialState());
    usePOSStore.setState(usePOSStore.getInitialState());
  });
  it('returns the persisted ID for selection without losing the existing cart', async () => {
    usePOSStore.getState().addToCart({ id: 'product', name: 'Dulce', price: 10, stock: 25, category: '' });
    expect(usePOSStore.getState().customerId).toBe('');
    vi.mocked(businessApi.create).mockResolvedValue({ id: 'saved-id', name: 'María González', phone: '5551234567', email: 'maria@example.com', archived: false });
    const saved = await useCustomersStore.getState().addCustomer({ name: 'María González', phone: '5551234567', email: 'maria@example.com', totalPurchases: 0, totalSpent: 0, status: 'active' });
    expect(saved).not.toBe(false);
    if (!saved) throw new Error('Expected saved customer');
    usePOSStore.getState().selectCustomer(saved.id);
    expect(usePOSStore.getState().customerId).toBe('saved-id');
    expect(usePOSStore.getState().getCartTotal()).toBe(10);
    expect(useCustomersStore.getState().getCustomerById('saved-id')).toEqual(saved);
  });
  it('does not create or change the selection without permission', async () => {
    auth.allowed = false;
    const saved = await useCustomersStore.getState().addCustomer({ name: 'María', phone: '555', email: 'maria@example.com', totalPurchases: 0, totalSpent: 0, status: 'active' });
    expect(saved).toBe(false);
    expect(businessApi.create).not.toHaveBeenCalled();
    expect(usePOSStore.getState().customerId).toBe('');
  });
});
