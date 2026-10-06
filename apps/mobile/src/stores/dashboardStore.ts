/**
 * Dashboard Store — Zustand
 *
 * Calcula la información del dashboard utilizando
 * las ventas registradas en Sales Store.
 */

import { create } from 'zustand';
import { useSalesStore } from './salesStore';

export interface SalesSummary {
  today: number;
  week: number;
  month: number;
  year: number;
}

export interface TopProduct {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface RecentSale {
  id: string;
  customer: string;
  total: number;
  date: string;
  status: 'completed' | 'pending' | 'cancelled';
}

interface DashboardState {
  salesSummary: SalesSummary;
  topProducts: TopProduct[];
  recentSales: RecentSale[];
  isLoading: boolean;

  refresh: () => Promise<void>;
}

const calculateDashboardData = () => {
  const { sales } = useSalesStore.getState();

  const completedSales = sales.filter(
    (sale) => sale.status === 'completed' && sale.currency === 'MXN'
  );

  const now = new Date();

  const todayString = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  const difference = day === 0 ? -6 : 1 - day;

  startOfWeek.setDate(startOfWeek.getDate() + difference);
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

  const startOfYear = new Date(
    now.getFullYear(),
    0,
    1
  );

  let today = 0;
  let week = 0;
  let month = 0;
  let year = 0;

  completedSales.forEach((sale) => {
    const saleDate = new Date(`${sale.date}T00:00:00`);

    if (sale.date === todayString) {
      today += sale.total;
    }

    if (saleDate >= startOfWeek && saleDate <= now) {
      week += sale.total;
    }

    if (saleDate >= startOfMonth && saleDate <= now) {
      month += sale.total;
    }

    if (saleDate >= startOfYear && saleDate <= now) {
      year += sale.total;
    }
  });

  const productMap: Record<
    string,
    TopProduct
  > = {};

  completedSales.forEach((sale) => {
    sale.items.forEach((item) => {
      if (!productMap[item.productId]) {
        productMap[item.productId] = {
          id: item.productId,
          name: item.productName,
          quantity: 0,
          revenue: 0,
        };
      }

      productMap[item.productId].quantity +=
        item.quantity;

      productMap[item.productId].revenue +=
        item.price * item.quantity;
    });
  });

  const topProducts = Object.values(productMap)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  const recentSales: RecentSale[] = [...sales]
    .sort((a, b) => {
      const dateA = new Date(
        `${a.date}T${a.time || '00:00'}`
      ).getTime();

      const dateB = new Date(
        `${b.date}T${b.time || '00:00'}`
      ).getTime();

      return dateB - dateA;
    })
    .slice(0, 5)
    .map((sale) => ({
      id: sale.id,
      customer: sale.customer,
      total: sale.total,
      date: sale.time
        ? `${sale.date} ${sale.time}`
        : sale.date,
      status: sale.status,
    }));

  return {
    salesSummary: {
      today,
      week,
      month,
      year,
    },
    topProducts,
    recentSales,
  };
};

const initialData = calculateDashboardData();

export const useDashboardStore =
  create<DashboardState>((set) => ({
    salesSummary: initialData.salesSummary,
    topProducts: initialData.topProducts,
    recentSales: initialData.recentSales,
    isLoading: false,

    refresh: async () => {
      set({ isLoading: true });

      await useSalesStore.getState().load();
      const data = calculateDashboardData();

      set({
        salesSummary: data.salesSummary,
        topProducts: data.topProducts,
        recentSales: data.recentSales,
        isLoading: false,
      });
    },
  }));