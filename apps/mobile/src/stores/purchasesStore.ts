/**
 * Purchases Store — Zustand
 *
 * Datos mock para el módulo de compras.
 */
import { create } from 'zustand';

export interface Purchase {
  id: string;
  orderNumber: string;
  supplier: string;
  date: string;
  total: number;
  status: 'pending' | 'received' | 'cancelled';
  items: {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
  }[];
}

interface PurchasesState {
  purchases: Purchase[];
  isLoading: boolean;

  getPurchaseById: (id: string) => Purchase | undefined;
  addPurchase: (purchase: Omit<Purchase, 'id'>) => void;
}

const MOCK_PURCHASES: Purchase[] = [
  {
    id: '1',
    orderNumber: 'OC-0001',
    supplier: 'Tech Supplies SA',
    date: '2026-09-28',
    total: 8000,
    status: 'received',
    items: [
      { productId: '1', productName: 'Laptop HP 15', quantity: 1, price: 8000 },
    ],
  },
  {
    id: '2',
    orderNumber: 'OC-0002',
    supplier: 'Accesorios MX',
    date: '2026-09-27',
    total: 7500,
    status: 'pending',
    items: [
      { productId: '2', productName: 'Mouse Logitech', quantity: 50, price: 150 },
    ],
  },
  {
    id: '3',
    orderNumber: 'OC-0003',
    supplier: 'Electro Parts',
    date: '2026-09-26',
    total: 10000,
    status: 'received',
    items: [
      { productId: '3', productName: 'Teclado Mecánico', quantity: 25, price: 400 },
    ],
  },
  {
    id: '4',
    orderNumber: 'OC-0004',
    supplier: 'Tech Supplies SA',
    date: '2026-09-25',
    total: 6000,
    status: 'cancelled',
    items: [
      { productId: '4', productName: 'Monitor Samsung 24"', quantity: 2, price: 3000 },
    ],
  },
];

export const usePurchasesStore = create<PurchasesState>((set, get) => ({
  purchases: MOCK_PURCHASES,
  isLoading: false,

  getPurchaseById: (id: string) => {
    return get().purchases.find((p) => p.id === id);
  },

  addPurchase: (purchase: Omit<Purchase, 'id'>) => {
    const newPurchase: Purchase = {
      ...purchase,
      id: Date.now().toString(),
    };
    set((state) => ({
      purchases: [newPurchase, ...state.purchases],
    }));
  },
}));
