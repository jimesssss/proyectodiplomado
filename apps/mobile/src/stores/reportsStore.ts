/**
 * Reports Store — Zustand
 *
 * Datos mock para el módulo de reportes.
 */
import { create } from 'zustand';

export interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}

export interface ChartData {
  label: string;
  value: number;
}

interface ReportsState {
  reportCards: ReportCard[];
  salesByDay: ChartData[];
  topProducts: ChartData[];
  salesByCategory: ChartData[];
  isLoading: boolean;
}

const MOCK_REPORT_CARDS: ReportCard[] = [
  {
    id: '1',
    title: 'Ventas',
    description: 'Reporte de ventas por periodo',
    icon: 'trending-up',
    color: '#10B981',
  },
  {
    id: '2',
    title: 'Productos',
    description: 'Productos más vendidos',
    icon: 'cube',
    color: '#3B82F6',
  },
  {
    id: '3',
    title: 'Inventario',
    description: 'Estado del inventario',
    icon: 'archive',
    color: '#F59E0B',
  },
  {
    id: '4',
    title: 'Compras',
    description: 'Compras realizadas',
    icon: 'cart',
    color: '#8B5CF6',
  },
  {
    id: '5',
    title: 'Gastos',
    description: 'Gastos del periodo',
    icon: 'receipt',
    color: '#EF4444',
  },
  {
    id: '6',
    title: 'Clientes',
    description: 'Clientes frecuentes',
    icon: 'people',
    color: '#EC4899',
  },
];

const MOCK_SALES_BY_DAY: ChartData[] = [
  { label: 'Lun', value: 1200 },
  { label: 'Mar', value: 1800 },
  { label: 'Mié', value: 1500 },
  { label: 'Jue', value: 2200 },
  { label: 'Vie', value: 2800 },
  { label: 'Sáb', value: 3200 },
  { label: 'Dom', value: 1600 },
];

const MOCK_TOP_PRODUCTS: ChartData[] = [
  { label: 'Laptop HP', value: 15 },
  { label: 'Mouse', value: 45 },
  { label: 'Teclado', value: 30 },
  { label: 'Monitor', value: 12 },
  { label: 'Audífonos', value: 20 },
];

const MOCK_SALES_BY_CATEGORY: ChartData[] = [
  { label: 'Electrónica', value: 65 },
  { label: 'Accesorios', value: 20 },
  { label: 'Oficina', value: 10 },
  { label: 'Otros', value: 5 },
];

export const useReportsStore = create<ReportsState>(() => ({
  reportCards: MOCK_REPORT_CARDS,
  salesByDay: MOCK_SALES_BY_DAY,
  topProducts: MOCK_TOP_PRODUCTS,
  salesByCategory: MOCK_SALES_BY_CATEGORY,
  isLoading: false,
}));
