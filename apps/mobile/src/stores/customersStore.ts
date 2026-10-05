/**
 * Customers Store — Zustand
 *
 * Datos mock para el módulo de clientes.
 */
import { create } from 'zustand';

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

interface CustomersState {
  customers: Customer[];
  isLoading: boolean;

  getCustomerById: (id: string) => Customer | undefined;
  addCustomer: (customer: Omit<Customer, 'id'>) => void;
  updateCustomer: (id: string, customer: Partial<Customer>) => void;
}

const MOCK_CUSTOMERS: Customer[] = [
  {
    id: '1',
    name: 'Juan Pérez',
    phone: '555-111-2222',
    email: 'juan.perez@email.com',
    totalPurchases: 15,
    totalSpent: 25000,
    lastPurchase: '2026-09-29',
    status: 'active',
  },
  {
    id: '2',
    name: 'María García',
    phone: '555-333-4444',
    email: 'maria.garcia@email.com',
    totalPurchases: 8,
    totalSpent: 12000,
    lastPurchase: '2026-09-28',
    status: 'active',
  },
  {
    id: '3',
    name: 'Carlos López',
    phone: '555-555-6666',
    email: 'carlos.lopez@email.com',
    totalPurchases: 22,
    totalSpent: 45000,
    lastPurchase: '2026-09-27',
    status: 'active',
  },
  {
    id: '4',
    name: 'Ana Martínez',
    phone: '555-777-8888',
    email: 'ana.martinez@email.com',
    totalPurchases: 3,
    totalSpent: 3500,
    lastPurchase: '2026-09-20',
    status: 'inactive',
  },
  {
    id: '5',
    name: 'Roberto Sánchez',
    phone: '555-999-0000',
    email: 'roberto.sanchez@email.com',
    totalPurchases: 12,
    totalSpent: 18000,
    lastPurchase: '2026-09-25',
    status: 'active',
  },
];

export const useCustomersStore = create<CustomersState>((set, get) => ({
  customers: MOCK_CUSTOMERS,
  isLoading: false,

  getCustomerById: (id: string) => {
    return get().customers.find((c) => c.id === id);
  },

  addCustomer: (customer: Omit<Customer, 'id'>) => {
    const newCustomer: Customer = {
      ...customer,
      id: Date.now().toString(),
    };
    set((state) => ({
      customers: [...state.customers, newCustomer],
    }));
  },

  updateCustomer: (id: string, updates: Partial<Customer>) => {
    set((state) => ({
      customers: state.customers.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
  },
}));
