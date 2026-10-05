/**
 * Cash Register Store — Zustand
 *
 * Datos mock para el módulo de caja.
 */
import { create } from 'zustand';

export interface CashMovement {
  id: string;
  type: 'entry' | 'exit';
  amount: number;
  reason: string;
  date: string;
  user: string;
}

export interface CashRegister {
  isOpen: boolean;
  initialBalance: number;
  cashSales: number;
  entries: number;
  exits: number;
  currentBalance: number;
  movements: CashMovement[];
}

interface CashRegisterState {
  cashRegister: CashRegister;
  isLoading: boolean;

  openCashRegister: (initialBalance: number) => void;
  closeCashRegister: () => void;
  addEntry: (amount: number, reason: string) => void;
  addExit: (amount: number, reason: string) => void;
}

const MOCK_CASH_REGISTER: CashRegister = {
  isOpen: true,
  initialBalance: 1000,
  cashSales: 1600,
  entries: 500,
  exits: 200,
  currentBalance: 2900,
  movements: [
    {
      id: '1',
      type: 'entry',
      amount: 1000,
      reason: 'Apertura de caja',
      date: '2026-09-29 08:00',
      user: 'Admin',
    },
    {
      id: '2',
      type: 'entry',
      amount: 1250,
      reason: 'Venta VTA-0001',
      date: '2026-09-29 10:30',
      user: 'Cajero',
    },
    {
      id: '3',
      type: 'exit',
      amount: 200,
      reason: 'Gasto de papelería',
      date: '2026-09-29 11:00',
      user: 'Admin',
    },
    {
      id: '4',
      type: 'entry',
      amount: 350,
      reason: 'Venta VTA-0002',
      date: '2026-09-29 12:15',
      user: 'Cajero',
    },
    {
      id: '5',
      type: 'entry',
      amount: 500,
      reason: 'Entrada manual',
      date: '2026-09-29 14:00',
      user: 'Admin',
    },
  ],
};

export const useCashRegisterStore = create<CashRegisterState>((set, get) => ({
  cashRegister: MOCK_CASH_REGISTER,
  isLoading: false,

  openCashRegister: (initialBalance: number) => {
    set({
      cashRegister: {
        isOpen: true,
        initialBalance,
        cashSales: 0,
        entries: 0,
        exits: 0,
        currentBalance: initialBalance,
        movements: [
          {
            id: Date.now().toString(),
            type: 'entry',
            amount: initialBalance,
            reason: 'Apertura de caja',
            date: new Date().toLocaleString('es-ES'),
            user: 'Admin',
          },
        ],
      },
    });
  },

  closeCashRegister: () => {
    set((state) => ({
      cashRegister: {
        ...state.cashRegister,
        isOpen: false,
      },
    }));
  },

  addEntry: (amount: number, reason: string) => {
    const { cashRegister } = get();
    const newMovement: CashMovement = {
      id: Date.now().toString(),
      type: 'entry',
      amount,
      reason,
      date: new Date().toLocaleString('es-ES'),
      user: 'Admin',
    };
    set({
      cashRegister: {
        ...cashRegister,
        entries: cashRegister.entries + amount,
        currentBalance: cashRegister.currentBalance + amount,
        movements: [newMovement, ...cashRegister.movements],
      },
    });
  },

  addExit: (amount: number, reason: string) => {
    const { cashRegister } = get();
    const newMovement: CashMovement = {
      id: Date.now().toString(),
      type: 'exit',
      amount,
      reason,
      date: new Date().toLocaleString('es-ES'),
      user: 'Admin',
    };
    set({
      cashRegister: {
        ...cashRegister,
        exits: cashRegister.exits + amount,
        currentBalance: cashRegister.currentBalance - amount,
        movements: [newMovement, ...cashRegister.movements],
      },
    });
  },
}));
