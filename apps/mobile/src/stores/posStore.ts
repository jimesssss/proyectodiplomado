/**
 * POS Store — Zustand
 *
 * Estado del punto de venta (carrito, productos, etc.).
 * Datos mock para desarrollo.
 */
import { create } from 'zustand';

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

interface POSState {
  products: Product[];
  cart: CartItem[];
  isLoading: boolean;

  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getCartCount: () => number;
}

// Datos mock de productos
const MOCK_PRODUCTS: Product[] = [
  { id: '1', name: 'Producto A', price: 50.0, stock: 100, category: 'General' },
  { id: '2', name: 'Producto B', price: 75.0, stock: 80, category: 'General' },
  { id: '3', name: 'Producto C', price: 100.0, stock: 60, category: 'General' },
  { id: '4', name: 'Producto D', price: 125.0, stock: 40, category: 'General' },
  { id: '5', name: 'Producto E', price: 150.0, stock: 30, category: 'General' },
  { id: '6', name: 'Producto F', price: 200.0, stock: 20, category: 'General' },
  { id: '7', name: 'Producto G', price: 250.0, stock: 15, category: 'General' },
  { id: '8', name: 'Producto H', price: 300.0, stock: 10, category: 'General' },
];

export const usePOSStore = create<POSState>((set, get) => ({
  products: MOCK_PRODUCTS,
  cart: [],
  isLoading: false,

  addToCart: (product: Product) => {
    const { cart } = get();
    const existingItem = cart.find((item) => item.product.id === product.id);

    if (existingItem) {
      set({
        cart: cart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ),
      });
    } else {
      set({ cart: [...cart, { product, quantity: 1 }] });
    }
  },

  removeFromCart: (productId: string) => {
    const { cart } = get();
    set({ cart: cart.filter((item) => item.product.id !== productId) });
  },

  updateQuantity: (productId: string, quantity: number) => {
    const { cart } = get();
    if (quantity <= 0) {
      set({ cart: cart.filter((item) => item.product.id !== productId) });
    } else {
      set({
        cart: cart.map((item) =>
          item.product.id === productId ? { ...item, quantity } : item
        ),
      });
    }
  },

  clearCart: () => {
    set({ cart: [] });
  },

  getCartTotal: () => {
    const { cart } = get();
    return cart.reduce(
      (total, item) => total + item.product.price * item.quantity,
      0
    );
  },

  getCartCount: () => {
    const { cart } = get();
    return cart.reduce((count, item) => count + item.quantity, 0);
  },
}));
