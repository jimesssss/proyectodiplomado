import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./authStore', () => ({ useAuthStore: { getState: () => ({ can: () => true }) } }));

vi.mock('../services/inventory-api', () => ({
  InventoryApiError: class InventoryApiError extends Error {},
  createMovement: vi.fn(),
  getMovement: vi.fn(),
  listMovements: vi.fn(),
  listStock: vi.fn(),
}));

import {
  createMovement,
  listMovements,
  listStock,
} from '../services/inventory-api';
import { useInventoryStore } from './inventoryStore';
import { useProductStore } from './productStore';

const product = {
  id: 'product-id',
  name: 'Dulce',
  sku: 'CANDY-1',
  barcode: '',
  category: '',
  purchasePrice: 2,
  salePrice: 5,
  stock: 0,
  minStock: 10,
  unit: 'Pza',
  description: '',
  status: 'active' as const,
};

const movement = {
  id: 'movement-id',
  productId: 'product-id',
  warehouseId: 'warehouse-id',
  type: 'manual_out' as const,
  qty: -2,
  balanceAfter: 3,
  sourceType: null,
  sourceId: null,
  reason: 'Merma',
  createdAt: '2026-10-05T12:00:00.000Z',
};

describe('inventory store API integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProductStore.setState({
      products: [product],
      isLoading: false,
      error: null,
      selectedProduct: null,
    });
    useInventoryStore.setState({
      movements: [],
      stockBalances: [],
      isLoading: false,
      stockLoading: false,
      movementsLoading: false,
      error: null,
      stockError: null,
      movementsError: null,
    });
  });

  it('loads balances from every warehouse and sums them by product', async () => {
    vi.mocked(listStock).mockResolvedValue([
      { id: 'balance-a', productId: 'product-id', warehouseId: 'warehouse-a', qty: 3 },
      { id: 'balance-b', productId: 'product-id', warehouseId: 'warehouse-b', qty: 4 },
    ]);

    await useInventoryStore.getState().loadStock();

    expect(useInventoryStore.getState().getStockForProduct('product-id')).toBe(7);
    expect(useProductStore.getState().getProductById('product-id')?.stock).toBe(7);
  });

  it('maps real movements to the existing screen model without inventing a user', async () => {
    vi.mocked(listMovements).mockResolvedValue([movement]);

    await useInventoryStore.getState().loadMovements();

    expect(useInventoryStore.getState().movements).toEqual([
      {
        id: 'movement-id',
        productId: 'product-id',
        productName: 'Dulce',
        type: 'exit',
        quantity: 2,
        reason: 'Merma',
        date: '2026-10-05',
      },
    ]);
  });

  it('posts a movement using the selected backend warehouse and reloads stock', async () => {
    vi.mocked(createMovement).mockResolvedValue(movement);
    vi.mocked(listStock).mockResolvedValue([
      { id: 'balance-a', productId: 'product-id', warehouseId: 'warehouse-id', qty: 3 },
    ]);
    vi.mocked(listMovements).mockResolvedValue([movement]);

    await useInventoryStore.getState().addMovement({
      productId: 'product-id',
      warehouseId: 'warehouse-id',
      type: 'manual_out',
      quantity: 2,
      reason: 'Merma',
    });

    expect(createMovement).toHaveBeenCalledWith({
      productId: 'product-id',
      warehouseId: 'warehouse-id',
      type: 'manual_out',
      quantity: 2,
      reason: 'Merma',
    });
    expect(useInventoryStore.getState().getStockForProduct('product-id')).toBe(3);
  });
});
