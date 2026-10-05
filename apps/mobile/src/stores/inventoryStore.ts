/**
 * Inventory Store — Zustand
 *
 * Datos mock para el módulo de inventario.
 */
import { create } from 'zustand';

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  type: 'entry' | 'exit' | 'adjustment';
  quantity: number;
  reason: string;
  date: string;
  user: string;
}

export interface InventorySummary {
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
  estimatedValue: number;
}

interface InventoryState {
  movements: InventoryMovement[];
  summary: InventorySummary;
  isLoading: boolean;

  getMovementsByProduct: (productId: string) => InventoryMovement[];
  addMovement: (movement: Omit<InventoryMovement, 'id'>) => void;
}

const MOCK_MOVEMENTS: InventoryMovement[] = [
  {
    id: '1',
    productId: '1',
    productName: 'Laptop HP 15',
    type: 'entry',
    quantity: 10,
    reason: 'Compra a proveedor',
    date: '2026-09-28',
    user: 'Admin',
  },
  {
    id: '2',
    productId: '2',
    productName: 'Mouse Logitech',
    type: 'exit',
    quantity: 5,
    reason: 'Venta #001',
    date: '2026-09-28',
    user: 'Cajero',
  },
  {
    id: '3',
    productId: '3',
    productName: 'Teclado Mecánico',
    type: 'adjustment',
    quantity: -2,
    reason: 'Ajuste por daño',
    date: '2026-09-27',
    user: 'Admin',
  },
  {
    id: '4',
    productId: '4',
    productName: 'Monitor Samsung 24"',
    type: 'exit',
    quantity: 3,
    reason: 'Venta #002',
    date: '2026-09-27',
    user: 'Cajero',
  },
  {
    id: '5',
    productId: '5',
    productName: 'Cable HDMI 2m',
    type: 'entry',
    quantity: 50,
    reason: 'Compra a proveedor',
    date: '2026-09-26',
    user: 'Admin',
  },
];

const MOCK_SUMMARY: InventorySummary = {
  totalProducts: 6,
  lowStock: 1,
  outOfStock: 1,
  estimatedValue: 485000,
};

export const useInventoryStore = create<InventoryState>((set, get) => ({
  movements: MOCK_MOVEMENTS,
  summary: MOCK_SUMMARY,
  isLoading: false,

  getMovementsByProduct: (productId: string) => {
    return get().movements.filter((m) => m.productId === productId);
  },

  addMovement: (movement: Omit<InventoryMovement, 'id'>) => {
    const newMovement: InventoryMovement = {
      ...movement,
      id: Date.now().toString(),
    };
    set((state) => ({
      movements: [newMovement, ...state.movements],
    }));
  },
}));
