/**
 * Inventory Store — Zustand
 *
 * Saldos y movimientos proceden del ledger de inventario de la API.
 */
import { create } from 'zustand';
import {
  createMovement as createMovementWithApi,
  getMovement as getMovementFromApi,
  InventoryApiError,
  listMovements,
  listStock,
  type ApiMovementType,
  type ApiStockBalance,
  type CreateApiMovement,
} from '../services/inventory-api';
import { useProductStore, type Product } from './productStore';

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  type: 'entry' | 'exit' | 'adjustment';
  quantity: number;
  reason: string;
  date: string;
}

export interface InventorySummary {
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
  estimatedValue: number | null;
}

interface InventoryState {
  movements: InventoryMovement[];
  stockBalances: ApiStockBalance[];
  summary: InventorySummary;
  isLoading: boolean;
  stockLoading: boolean;
  movementsLoading: boolean;
  error: string | null;
  stockError: string | null;
  movementsError: string | null;

  getMovementsByProduct: (productId: string) => InventoryMovement[];
  getStockForProduct: (productId: string) => number;
  loadStock: () => Promise<void>;
  loadMovements: () => Promise<void>;
  loadMovementById: (id: string) => Promise<InventoryMovement | null>;
  addMovement: (movement: CreateApiMovement) => Promise<InventoryMovement | null>;
  refreshSummary: (products: readonly Product[]) => void;
  refreshMovementNames: (products: readonly Product[]) => void;
  clearError: () => void;
}

const EMPTY_SUMMARY: InventorySummary = {
  totalProducts: 0,
  lowStock: 0,
  outOfStock: 0,
  estimatedValue: null,
};

function inventoryErrorMessage(error: unknown): string {
  return error instanceof InventoryApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : 'No se pudo completar la operación de inventario.';
}

function toMovement(
  movement: {
    readonly id: string;
    readonly productId: string;
    readonly type: ApiMovementType;
    readonly qty: number;
    readonly reason: string | null;
    readonly createdAt: string;
  },
  products: readonly Product[],
): InventoryMovement {
  const productName =
    products.find((product) => product.id === movement.productId)?.name ?? movement.productId;
  const type =
    movement.type === 'count_adjustment'
      ? 'adjustment'
      : movement.type === 'manual_out' ||
          movement.type === 'transfer_out' ||
          movement.type === 'production_out'
        ? 'exit'
        : 'entry';
  return {
    id: movement.id,
    productId: movement.productId,
    productName,
    type,
    quantity: Math.abs(movement.qty),
    reason: movement.reason ?? '',
    date: movement.createdAt.slice(0, 10),
  };
}

function sumProductStock(
  balances: readonly ApiStockBalance[],
  productId: string,
): number {
  return balances.reduce(
    (total, balance) => total + (balance.productId === productId ? balance.qty : 0),
    0,
  );
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  movements: [],
  stockBalances: [],
  summary: EMPTY_SUMMARY,
  isLoading: false,
  stockLoading: false,
  movementsLoading: false,
  error: null,
  stockError: null,
  movementsError: null,

  getMovementsByProduct: (productId) =>
    get().movements.filter((movement) => movement.productId === productId),

  getStockForProduct: (productId) => sumProductStock(get().stockBalances, productId),

  loadStock: async () => {
    set({ stockLoading: true, stockError: null });
    try {
      const stockBalances = await listStock();
      set({ stockBalances: [...stockBalances], stockLoading: false });
      useProductStore.getState().setStockBalances(stockBalances);
      get().refreshSummary(useProductStore.getState().products);
    } catch (error) {
      set({ stockLoading: false, stockError: inventoryErrorMessage(error) });
    }
  },

  loadMovements: async () => {
    set({ movementsLoading: true, movementsError: null });
    try {
      const products = useProductStore.getState().products;
      const apiMovements = await listMovements();
      set({
        movements: apiMovements.map((movement) => toMovement(movement, products)),
        movementsLoading: false,
      });
    } catch (error) {
      set({ movementsLoading: false, movementsError: inventoryErrorMessage(error) });
    }
  },

  loadMovementById: async (id) => {
    set({ error: null });
    try {
      const movement = await getMovementFromApi(id);
      const mapped = toMovement(movement, useProductStore.getState().products);
      set((state) => ({
        movements: [
          mapped,
          ...state.movements.filter((existing) => existing.id !== mapped.id),
        ],
      }));
      return mapped;
    } catch (error) {
      set({ error: inventoryErrorMessage(error) });
      return null;
    }
  },

  addMovement: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const movement = await createMovementWithApi(input);
      const mapped = toMovement(movement, useProductStore.getState().products);
      set((state) => ({
        movements: [
          mapped,
          ...state.movements.filter((existing) => existing.id !== mapped.id),
        ],
        isLoading: false,
      }));
      await Promise.all([get().loadStock(), get().loadMovements()]);
      return mapped;
    } catch (error) {
      set({ isLoading: false, error: inventoryErrorMessage(error) });
      return null;
    }
  },

  refreshSummary: (products) => {
    const activeProducts = products.filter((product) => product.status === 'active');
    const balances = get().stockBalances;
    set({
      summary: {
        totalProducts: activeProducts.length,
        lowStock: activeProducts.filter((product) => {
          const quantity = sumProductStock(balances, product.id);
          return product.minStockDefined !== false && quantity > 0 && quantity <= product.minStock;
        }).length,
        outOfStock: activeProducts.filter(
          (product) => sumProductStock(balances, product.id) === 0,
        ).length,
        estimatedValue: null,
      },
    });
  },

  refreshMovementNames: (products) => {
    set((state) => ({
      movements: state.movements.map((movement) => ({
        ...movement,
        productName:
          products.find((product) => product.id === movement.productId)?.name ??
          movement.productId,
      })),
    }));
  },

  clearError: () => {
    set({ error: null, stockError: null, movementsError: null });
  },
}));
