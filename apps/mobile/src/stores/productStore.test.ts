import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ allowed: true }));
vi.mock('./authStore', () => ({ useAuthStore: { getState: () => ({ can: (permission: string) => auth.allowed && permission === 'product:delete' }) } }));

vi.mock('../services/inventory-api', () => ({
  InventoryApiError: class InventoryApiError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status: number | null = null,
    ) {
      super(message);
    }
  },
  archiveProduct: vi.fn(),
  createProduct: vi.fn(),
  createInitialStock: vi.fn(),
  getProduct: vi.fn(),
  listProducts: vi.fn(),
  updateProduct: vi.fn(),
}));

import {
  archiveProduct as archiveProductWithApi,
  createProduct as createProductWithApi,
  createInitialStock,
  InventoryApiError,
  listProducts,
  updateProduct as updateProductWithApi,
} from '../services/inventory-api';
import { useProductStore, type Product } from './productStore';

const apiProduct = {
  id: 'product-id',
  code: 'CANDY-1',
  name: 'Dulce',
  description: 'Caramelo',
  unit: 'Pza',
  cost: 2,
  price: 5,
  minStock: 15,
  archived: false,
};

describe('product store API integration', () => {
  it('passes the real image reference from API to the product used by screens', async () => {
    const imageUrl = 'https://erp-sc-web.onrender.com/product-images/gomitas.jpg';
    vi.mocked(listProducts).mockResolvedValue([{ ...apiProduct, imageUrl }]);
    await useProductStore.getState().loadProducts();
    expect(useProductStore.getState().products[0]).toMatchObject({ imageUrl, sku: 'CANDY-1', salePrice: 5 });
  });

  beforeEach(() => {
    vi.resetAllMocks();
    auth.allowed = true;
    useProductStore.setState({
      products: [],
      isLoading: false,
      error: null,
      selectedProduct: null,
    });
  });

  it('loads products from the API without sample records', async () => {
    vi.mocked(listProducts).mockResolvedValue([apiProduct]);

    await useProductStore.getState().loadProducts();

    expect(useProductStore.getState().products).toMatchObject([
      {
        id: 'product-id',
        sku: 'CANDY-1',
        name: 'Dulce',
        stock: 0,
        category: '',
        barcode: '',
      },
    ]);
  });

  it('creates a product using only fields accepted by the backend', async () => {
    vi.mocked(createProductWithApi).mockResolvedValue(apiProduct);
    vi.mocked(createInitialStock).mockResolvedValue(25);
    const input: Omit<Product, 'id'> = {
      name: 'Dulce',
      sku: 'CANDY-1',
      barcode: '7500000000000',
      category: 'Dulces',
      purchasePrice: 2,
      salePrice: 5,
      stock: 25,
      minStock: 15,
      unit: 'Pza',
      description: 'Caramelo',
      status: 'active',
    };

    await expect(useProductStore.getState().addProduct(input)).resolves.toMatchObject({
      id: 'product-id',
      stock: 25,
      minStock: 15,
      barcode: '',
      category: '',
    });

    expect(createProductWithApi).toHaveBeenCalledWith({
      code: 'CANDY-1',
      name: 'Dulce',
      description: 'Caramelo',
      unit: 'Pza',
      cost: 2,
      price: 5,
      minStock: 15,
    });
    expect(createInitialStock).toHaveBeenCalledWith('product-id', 25);
  });

  it('creates a product with zero stock without requesting a warehouse or movement', async () => {
    vi.mocked(createProductWithApi).mockResolvedValue(apiProduct);
    const input: Omit<Product, 'id'> = {
      name: 'Dulce',
      sku: 'CANDY-1',
      barcode: '',
      category: '',
      purchasePrice: 2,
      salePrice: 5,
      stock: 0,
      minStock: 15,
      unit: 'Pza',
      description: 'Caramelo',
      status: 'active',
    };

    await expect(useProductStore.getState().addProduct(input)).resolves.toMatchObject({
      stock: 0,
      minStock: 15,
    });
    expect(createInitialStock).not.toHaveBeenCalled();
  });

  it('keeps the successfully created product and exposes the initial-stock failure', async () => {
    vi.mocked(createProductWithApi).mockResolvedValue(apiProduct);
    vi.mocked(createInitialStock).mockRejectedValue(
      new InventoryApiError(
        'NO_ACTIVE_WAREHOUSE',
        'No hay un almacén activo disponible para registrar la existencia inicial.',
      ),
    );
    const input: Omit<Product, 'id'> = {
      name: 'Dulce',
      sku: 'CANDY-1',
      barcode: '',
      category: '',
      purchasePrice: 2,
      salePrice: 5,
      stock: 25,
      minStock: 15,
      unit: 'Pza',
      description: '',
      status: 'active',
    };

    await expect(useProductStore.getState().addProduct(input)).resolves.toBeNull();

    expect(archiveProductWithApi).not.toHaveBeenCalled();
    expect(useProductStore.getState().products).toMatchObject([
      { id: 'product-id', sku: 'CANDY-1', stock: 0, status: 'active' },
    ]);
    expect(useProductStore.getState().error).toContain('No hay un almacén activo');
    expect(useProductStore.getState().error).toContain('id product-id');
  });

  it('updates only mutable backend product fields', async () => {
    vi.mocked(updateProductWithApi).mockResolvedValue(apiProduct);

    await useProductStore.getState().updateProduct('product-id', {
      name: 'Dulce editado',
      sku: 'OTHER-CODE',
      barcode: '7500000000001',
      category: 'Otro',
      stock: 99,
      purchasePrice: 3,
      salePrice: 6,
      minStock: 12,
    });

    expect(updateProductWithApi).toHaveBeenCalledWith('product-id', {
      name: 'Dulce editado',
      cost: 3,
      price: 6,
      minStock: 12,
    });
  });

  it('archives a product through the backend DELETE route', async () => {
    vi.mocked(archiveProductWithApi).mockResolvedValue({
      ...apiProduct,
      archived: true,
    });
    const selectedProduct: Product = {
      id: apiProduct.id,
      name: apiProduct.name,
      sku: apiProduct.code,
      barcode: '',
      category: '',
      purchasePrice: 2,
      salePrice: 5,
      stock: 0,
      minStock: 10,
      unit: apiProduct.unit,
      description: 'Caramelo',
      status: 'active',
    };
    useProductStore.setState({
      products: [selectedProduct],
      selectedProduct,
    });

    await expect(useProductStore.getState().deleteProduct('product-id')).resolves.toBe(true);

    expect(archiveProductWithApi).toHaveBeenCalledWith('product-id');
    expect(useProductStore.getState().products).toEqual([]);
    expect(useProductStore.getState().selectedProduct?.status).toBe('inactive');
  });
  it('does not call the archive API without product:delete permission', async () => {
    auth.allowed = false;
    expect(await useProductStore.getState().deleteProduct('product-id')).toBe(false);
    expect(archiveProductWithApi).not.toHaveBeenCalled();
    expect(useProductStore.getState().error).toContain('permiso');
  });

  it('preserves the product in the list when the backend rejects archiving', async () => {
    vi.mocked(listProducts).mockResolvedValue([apiProduct]);
    await useProductStore.getState().loadProducts();
    vi.mocked(archiveProductWithApi).mockRejectedValue(new InventoryApiError('CONFLICT', 'No se puede archivar', 409));
    expect(await useProductStore.getState().deleteProduct('product-id')).toBe(false);
    expect(useProductStore.getState().products).toMatchObject([{ id: 'product-id', status: 'active' }]);
    expect(useProductStore.getState().error).toBe('No se puede archivar');
  });

});
