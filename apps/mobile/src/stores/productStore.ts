/**
 * Product Store — Zustand
 *
 * Datos mock para el módulo de productos.
 */
import { create } from 'zustand';

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
  unit: string;
  description: string;
  status: 'active' | 'inactive';
  image?: string;
}

interface ProductState {
  products: Product[];
  isLoading: boolean;
  categories: string[];

  getProductById: (id: string) => Product | undefined;
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, product: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
}

const MOCK_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Laptop HP 15',
    sku: 'LAP-001',
    barcode: '7501234567890',
    category: 'Electrónica',
    purchasePrice: 8000,
    salePrice: 12000,
    stock: 25,
    minStock: 5,
    unit: 'Pza',
    description: 'Laptop HP 15 pulgadas, 8GB RAM, 256GB SSD',
    status: 'active',
  },
  {
    id: '2',
    name: 'Mouse Logitech',
    sku: 'MOU-001',
    barcode: '7501234567891',
    category: 'Electrónica',
    purchasePrice: 150,
    salePrice: 350,
    stock: 150,
    minStock: 20,
    unit: 'Pza',
    description: 'Mouse inalámbrico Logitech M185',
    status: 'active',
  },
  {
    id: '3',
    name: 'Teclado Mecánico',
    sku: 'TEC-001',
    barcode: '7501234567892',
    category: 'Electrónica',
    purchasePrice: 400,
    salePrice: 800,
    stock: 8,
    minStock: 10,
    unit: 'Pza',
    description: 'Teclado mecánico RGB switches blue',
    status: 'active',
  },
  {
    id: '4',
    name: 'Monitor Samsung 24"',
    sku: 'MON-001',
    barcode: '7501234567893',
    category: 'Electrónica',
    purchasePrice: 2500,
    salePrice: 4000,
    stock: 0,
    minStock: 3,
    unit: 'Pza',
    description: 'Monitor Samsung 24 pulgadas Full HD',
    status: 'active',
  },
  {
    id: '5',
    name: 'Cable HDMI 2m',
    sku: 'CAB-001',
    barcode: '7501234567894',
    category: 'Accesorios',
    purchasePrice: 50,
    salePrice: 120,
    stock: 200,
    minStock: 30,
    unit: 'Pza',
    description: 'Cable HDMI 2.0 metros 4K',
    status: 'active',
  },
  {
    id: '6',
    name: 'Audífonos Sony',
    sku: 'AUD-001',
    barcode: '7501234567895',
    category: 'Electrónica',
    purchasePrice: 600,
    salePrice: 1200,
    stock: 45,
    minStock: 10,
    unit: 'Pza',
    description: 'Audífonos inalámbricos Sony WH-1000XM4',
    status: 'active',
  },
];

export const useProductStore = create<ProductState>((set, get) => ({
  products: MOCK_PRODUCTS,
  isLoading: false,
  categories: ['Electrónica', 'Accesorios', 'Oficina', 'Hogar'],

  getProductById: (id: string) => {
    return get().products.find((p) => p.id === id);
  },

  addProduct: (product: Omit<Product, 'id'>) => {
    const newProduct: Product = {
      ...product,
      id: Date.now().toString(),
    };
    set((state) => ({
      products: [...state.products, newProduct],
    }));
  },

  updateProduct: (id: string, updates: Partial<Product>) => {
    set((state) => ({
      products: state.products.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    }));
  },

  deleteProduct: (id: string) => {
    set((state) => ({
      products: state.products.filter((p) => p.id !== id),
    }));
  },
}));
