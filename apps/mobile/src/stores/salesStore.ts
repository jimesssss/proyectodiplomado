/**
 * Sales Store — Zustand
 *
 * Datos mock para el módulo de ventas.
 */
import { create } from 'zustand';

export interface Sale {
  id: string;
  folio: string;
  date: string;
  time?: string;
  customer: string;
  total: number;
  discount?: number;
  paymentMethod: 'cash' | 'card' | 'transfer';
  status: 'completed' | 'pending' | 'cancelled';
  items: {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
  }[];
}

export interface SalesSummary {
  todaySales: number;
  todayCount: number;
  averageTicket: number;
}

interface SalesState {
  sales: Sale[];
  summary: SalesSummary;
  isLoading: boolean;
  error: string | null;

  getSaleById: (id: string) => Sale | undefined;
  addSale: (sale: Omit<Sale, 'id'>) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

const MOCK_SALES: Sale[] = [
  {
    id: '25',
    folio: 'V-00025',
    date: '2026-10-01',
    time: '12:35',
    customer: 'Juan Pérez',
    total: 13000,
    discount: 300,
    paymentMethod: 'card',
    status: 'completed',
    items: [
      { productId: '1', productName: 'Laptop Lenovo', quantity: 1, price: 12500 },
      { productId: '2', productName: 'Mouse Logitech', quantity: 2, price: 400 },
    ],
  },
  {
    id: '24',
    folio: 'V-00024',
    date: '2026-10-01',
    time: '11:20',
    customer: 'María López',
    total: 1280,
    discount: 0,
    paymentMethod: 'cash',
    status: 'completed',
    items: [
      { productId: '3', productName: 'Teclado Logitech K380', quantity: 1, price: 880 },
      { productId: '4', productName: 'Mouse Logitech M170', quantity: 1, price: 400 },
    ],
  },
  {
    id: '23',
    folio: 'V-00023',
    date: '2026-09-30',
    time: '16:42',
    customer: 'Carlos López',
    total: 7499,
    discount: 0,
    paymentMethod: 'transfer',
    status: 'pending',
    items: [
      { productId: '5', productName: 'Monitor Dell 27 pulgadas', quantity: 1, price: 7499 },
    ],
  },
  {
    id: '22',
    folio: 'V-00022',
    date: '2026-09-30',
    time: '13:08',
    customer: 'Ana Torres',
    total: 1890,
    discount: 0,
    paymentMethod: 'card',
    status: 'completed',
    items: [
      { productId: '6', productName: 'SSD Kingston 1 TB', quantity: 1, price: 1890 },
    ],
  },
  {
    id: '21',
    folio: 'V-00021',
    date: '2026-09-29',
    time: '10:16',
    customer: 'Roberto Díaz',
    total: 3650,
    discount: 0,
    paymentMethod: 'cash',
    status: 'cancelled',
    items: [
      { productId: '7', productName: 'Impresora Epson EcoTank', quantity: 1, price: 3650 },
    ],
  },
];

const MOCK_SUMMARY: SalesSummary = {
  todaySales: 14280,
  todayCount: 2,
  averageTicket: 7140,
};

export const useSalesStore = create<SalesState>((set, get) => ({
  sales: MOCK_SALES,
  summary: MOCK_SUMMARY,
  isLoading: false,
  error: null,

  getSaleById: (id: string) => {
    return get().sales.find((s) => s.id === id);
  },

  addSale: (sale: Omit<Sale, 'id'>) => {
    const newSale: Sale = {
      ...sale,
      id: Date.now().toString(),
    };
    set((state) => ({
      sales: [newSale, ...state.sales],
      error: null,
    }));
  },

  setLoading: (isLoading: boolean) => set({ isLoading }),
  setError: (error: string | null) => set({ error }),
}));
