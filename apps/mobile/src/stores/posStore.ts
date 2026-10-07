/**
 * POS Store — Zustand
 *
 * Estado del punto de venta (carrito, productos, etc.).
 * Datos mock para desarrollo.
 */
import { create } from 'zustand';

export interface Product {
  imageUrl?: string | null;
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
  customerId: string;
  selectCustomer: (id: string) => void;

  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getCartCount: () => number;
}

export const usePOSStore = create<POSState>((set, get) => ({
  products: [],
  cart: [],
  isLoading: false,
  customerId: '',
  selectCustomer: customerId => set({ customerId }),

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
