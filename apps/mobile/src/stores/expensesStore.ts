/**
 * Expenses Store — Zustand
 *
 * Datos mock para el módulo de gastos.
 */
import { create } from 'zustand';

export interface Expense {
  id: string;
  concept: string;
  category: string;
  date: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'transfer';
  status: 'paid' | 'pending';
}

interface ExpensesState {
  expenses: Expense[];
  isLoading: boolean;
  totalExpenses: number;

  addExpense: (expense: Omit<Expense, 'id'>) => void;
}

const MOCK_EXPENSES: Expense[] = [
  {
    id: '1',
    concept: 'Papelería y oficina',
    category: 'Oficina',
    date: '2026-09-29',
    amount: 200,
    paymentMethod: 'cash',
    status: 'paid',
  },
  {
    id: '2',
    concept: 'Recibo de luz',
    category: 'Servicios',
    date: '2026-09-28',
    amount: 850,
    paymentMethod: 'transfer',
    status: 'paid',
  },
  {
    id: '3',
    concept: 'Agua embotellada',
    category: 'Oficina',
    date: '2026-09-27',
    amount: 120,
    paymentMethod: 'cash',
    status: 'paid',
  },
  {
    id: '4',
    concept: 'Mantenimiento equipo',
    category: 'Mantenimiento',
    date: '2026-09-26',
    amount: 1500,
    paymentMethod: 'card',
    status: 'pending',
  },
  {
    id: '5',
    concept: 'Gasolina',
    category: 'Transporte',
    date: '2026-09-25',
    amount: 400,
    paymentMethod: 'cash',
    status: 'paid',
  },
];

export const useExpensesStore = create<ExpensesState>((set, get) => ({
  expenses: MOCK_EXPENSES,
  isLoading: false,
  totalExpenses: MOCK_EXPENSES.reduce((sum, e) => sum + e.amount, 0),

  addExpense: (expense: Omit<Expense, 'id'>) => {
    const newExpense: Expense = {
      ...expense,
      id: Date.now().toString(),
    };
    set((state) => ({
      expenses: [newExpense, ...state.expenses],
      totalExpenses: state.totalExpenses + expense.amount,
    }));
  },
}));
