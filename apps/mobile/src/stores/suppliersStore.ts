/**
 * Suppliers Store — Zustand
 *
 * Datos mock para el módulo de proveedores.
 */
import { create } from 'zustand';

export interface Supplier {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive';
  address?: string;
  rfc?: string;
}

interface SuppliersState {
  suppliers: Supplier[];
  isLoading: boolean;

  getSupplierById: (id: string) => Supplier | undefined;
  addSupplier: (supplier: Omit<Supplier, 'id'>) => void;
  updateSupplier: (id: string, supplier: Partial<Supplier>) => void;
}

const MOCK_SUPPLIERS: Supplier[] = [
  {
    id: '1',
    name: 'Tech Supplies SA',
    company: 'Tech Supplies SA de CV',
    phone: '555-123-4567',
    email: 'ventas@techsupplies.com',
    status: 'active',
    address: 'Av. Reforma 123, CDMX',
    rfc: 'TSU123456ABC',
  },
  {
    id: '2',
    name: 'Accesorios MX',
    company: 'Accesorios Mexicanos SA',
    phone: '555-987-6543',
    email: 'contacto@accesoriosmx.com',
    status: 'active',
    address: 'Calle 5 de Mayo 456, Guadalajara',
    rfc: 'AMX789012DEF',
  },
  {
    id: '3',
    name: 'Electro Parts',
    company: 'Electro Parts Internacional',
    phone: '555-456-7890',
    email: 'info@electroparts.com',
    status: 'active',
    address: 'Blvd. Díaz Ordaz 789, Monterrey',
    rfc: 'EPI345678GHI',
  },
  {
    id: '4',
    name: 'Distribuidora Central',
    company: 'Distribuidora Central SA',
    phone: '555-234-5678',
    email: 'ventas@distcentral.com',
    status: 'inactive',
    address: 'Av. Insurgentes 321, CDMX',
    rfc: 'DCI901234JKL',
  },
];

export const useSuppliersStore = create<SuppliersState>((set, get) => ({
  suppliers: MOCK_SUPPLIERS,
  isLoading: false,

  getSupplierById: (id: string) => {
    return get().suppliers.find((s) => s.id === id);
  },

  addSupplier: (supplier: Omit<Supplier, 'id'>) => {
    const newSupplier: Supplier = {
      ...supplier,
      id: Date.now().toString(),
    };
    set((state) => ({
      suppliers: [...state.suppliers, newSupplier],
    }));
  },

  updateSupplier: (id: string, updates: Partial<Supplier>) => {
    set((state) => ({
      suppliers: state.suppliers.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    }));
  },
}));
