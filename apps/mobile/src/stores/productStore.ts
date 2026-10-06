/**
 * Product Store — Zustand
 *
 * Los datos persistidos se obtienen de la API; category/barcode se conservan
 * en la interfaz mientras el backend no los incluya en su contrato.
 */
import { create } from 'zustand';
import {
  archiveProduct as archiveProductWithApi,
  createProduct as createProductWithApi,
  createInitialStock,
  getProduct as getProductFromApi,
  InventoryApiError,
  listProducts,
  updateProduct as updateProductWithApi,
  type ApiProduct,
  type ApiStockBalance,
} from '../services/inventory-api';

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  purchasePrice: number;
  salePrice: number;
  stock: number;
  minStock: number;
  purchasePriceDefined?: boolean;
  salePriceDefined?: boolean;
  minStockDefined?: boolean;
  unit: string;
  description: string;
  status: 'active' | 'inactive';
  image?: string;
}

interface ProductState {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  categories: string[];
  selectedProduct: Product | null;

  getProductById: (id: string) => Product | undefined;
  loadProducts: () => Promise<void>;
  loadProductById: (id: string) => Promise<Product | null>;
  setStockBalances: (balances: readonly ApiStockBalance[]) => void;
  addProduct: (product: Omit<Product, 'id'>) => Promise<Product | null>;
  updateProduct: (id: string, product: Partial<Product>) => Promise<Product | null>;
  deleteProduct: (id: string) => Promise<boolean>;
  clearError: () => void;
}

const UNPERSISTED_CATEGORY_OPTIONS = ['Electrónica', 'Accesorios', 'Oficina', 'Hogar'];

function toProduct(apiProduct: ApiProduct, stock = 0): Product {
  return {
    id: apiProduct.id,
    name: apiProduct.name,
    sku: apiProduct.code,
    barcode: '',
    category: '',
    purchasePrice: apiProduct.cost ?? 0,
    salePrice: apiProduct.price ?? 0,
    stock,
    minStock: apiProduct.minStock ?? 0,
    purchasePriceDefined: apiProduct.cost !== null,
    salePriceDefined: apiProduct.price !== null,
    minStockDefined: apiProduct.minStock !== null,
    unit: apiProduct.unit,
    description: apiProduct.description ?? '',
    status: apiProduct.archived ? 'inactive' : 'active',
  };
}

function inventoryErrorMessage(error: unknown): string {
  return error instanceof InventoryApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : 'No se pudo completar la operación de productos.';
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

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  isLoading: false,
  error: null,
  categories: UNPERSISTED_CATEGORY_OPTIONS,
  selectedProduct: null,

  getProductById: (id: string) => {
    const selected = get().selectedProduct;
    if (selected?.id === id) {
      return selected;
    }
    return get().products.find((product) => product.id === id);
  },

  loadProducts: async () => {
    set({ isLoading: true, error: null });
    try {
      const apiProducts = await listProducts();
      const currentProducts = get().products;
      const stockById = new Map(currentProducts.map((product) => [product.id, product.stock]));
      const products = apiProducts.map((product) =>
        toProduct(product, stockById.get(product.id) ?? 0),
      );
      set({
        products,
        selectedProduct:
          get().selectedProduct === null
            ? null
            : products.find((product) => product.id === get().selectedProduct?.id) ?? null,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false, error: inventoryErrorMessage(error) });
    }
  },

  loadProductById: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const current = get().products.find((product) => product.id === id);
      const product = toProduct(
        await getProductFromApi(id),
        current?.stock ?? get().selectedProduct?.stock ?? 0,
      );
      set((state) => ({
        products: [
          ...state.products.filter((existing) => existing.id !== product.id),
          product,
        ],
        selectedProduct: product,
        isLoading: false,
      }));
      return product;
    } catch (error) {
      set({ isLoading: false, error: inventoryErrorMessage(error) });
      return null;
    }
  },

  setStockBalances: (balances) => {
    set((state) => {
      const products = state.products.map((product) => ({
        ...product,
        stock: sumProductStock(balances, product.id),
      }));
      const selectedProduct =
        state.selectedProduct === null
          ? null
          : {
              ...state.selectedProduct,
              stock: sumProductStock(balances, state.selectedProduct.id),
            };
      return { products, selectedProduct };
    });
  },

  addProduct: async (productInput) => {
    set({ isLoading: true, error: null });
    try {
      const apiProduct = await createProductWithApi({
        code: productInput.sku,
        name: productInput.name,
        description: productInput.description,
        unit: productInput.unit,
        cost: productInput.purchasePrice,
        price: productInput.salePrice,
        minStock: productInput.minStock,
      });
      let stock = 0;
      if (productInput.stock > 0) {
        try {
          stock = await createInitialStock(apiProduct.id, productInput.stock);
        } catch (initialStockError) {
          const persistedProduct = toProduct(apiProduct);
          const apiError =
            initialStockError instanceof InventoryApiError ? initialStockError : null;
          const message =
            apiError?.code === 'NO_ACTIVE_WAREHOUSE'
              ? 'No hay un almacén activo disponible para registrar la existencia inicial.'
              : apiError?.status === 401
                ? 'Tu sesión expiró. Inicia sesión nuevamente.'
                : apiError?.status === 403
                  ? 'No tienes permisos para realizar esta operación.'
                  : 'No se pudo registrar la existencia inicial. El producto sí se creó, pero su existencia no quedó confirmada.';
          set((state) => ({
            products: [
              persistedProduct,
              ...state.products.filter((product) => product.id !== persistedProduct.id),
            ],
            isLoading: false,
            error: `${message} Producto: ${apiProduct.code} (id ${apiProduct.id}). Consulta su saldo antes de volver a intentarlo.`,
          }));
          return null;
        }
      }
      const product = toProduct(apiProduct, stock);
      set((state) => ({
        products: [product, ...state.products],
        isLoading: false,
      }));
      return product;
    } catch (error) {
      set({ isLoading: false, error: inventoryErrorMessage(error) });
      return null;
    }
  },

  updateProduct: async (id, updates) => {
    set({ isLoading: true, error: null });
    try {
      const product = toProduct(
        await updateProductWithApi(id, {
          ...(updates.name !== undefined ? { name: updates.name } : {}),
          ...(updates.description !== undefined ? { description: updates.description } : {}),
          ...(updates.unit !== undefined ? { unit: updates.unit } : {}),
          ...(updates.purchasePrice !== undefined ? { cost: updates.purchasePrice } : {}),
          ...(updates.salePrice !== undefined ? { price: updates.salePrice } : {}),
          ...(updates.minStock !== undefined ? { minStock: updates.minStock } : {}),
        }),
        get().products.find((existing) => existing.id === id)?.stock ?? 0,
      );
      set((state) => ({
        products: state.products.map((existing) => (existing.id === id ? product : existing)),
        selectedProduct: state.selectedProduct?.id === id ? product : state.selectedProduct,
        isLoading: false,
      }));
      return product;
    } catch (error) {
      set({ isLoading: false, error: inventoryErrorMessage(error) });
      return null;
    }
  },

  deleteProduct: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const archived = toProduct(await archiveProductWithApi(id));
      set((state) => ({
        products: state.products.filter((product) => product.id !== id),
        selectedProduct: state.selectedProduct?.id === id ? archived : state.selectedProduct,
        isLoading: false,
      }));
      return true;
    } catch (error) {
      set({ isLoading: false, error: inventoryErrorMessage(error) });
      return false;
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
