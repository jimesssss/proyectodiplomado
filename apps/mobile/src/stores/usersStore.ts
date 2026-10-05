/**
 * Users Store — Zustand
 *
 * Datos mock para el módulo de usuarios.
 */
import { create } from 'zustand';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'cashier' | 'warehouse';
  status: 'active' | 'inactive';
  lastLogin?: string;
}

interface UsersState {
  users: User[];
  isLoading: boolean;

  getUserById: (id: string) => User | undefined;
  addUser: (user: Omit<User, 'id'>) => void;
  updateUser: (id: string, user: Partial<User>) => void;
}

const MOCK_USERS: User[] = [
  {
    id: '1',
    name: 'Administrador',
    email: 'admin@erp-sc.com',
    role: 'admin',
    status: 'active',
    lastLogin: '2026-09-29 08:00',
  },
  {
    id: '2',
    name: 'María Gerente',
    email: 'maria@erp-sc.com',
    role: 'manager',
    status: 'active',
    lastLogin: '2026-09-29 09:30',
  },
  {
    id: '3',
    name: 'Juan Cajero',
    email: 'juan@erp-sc.com',
    role: 'cashier',
    status: 'active',
    lastLogin: '2026-09-29 10:00',
  },
  {
    id: '4',
    name: 'Carlos Almacén',
    email: 'carlos@erp-sc.com',
    role: 'warehouse',
    status: 'active',
    lastLogin: '2026-09-28 14:00',
  },
  {
    id: '5',
    name: 'Ana Inactiva',
    email: 'ana@erp-sc.com',
    role: 'cashier',
    status: 'inactive',
    lastLogin: '2026-08-15 11:00',
  },
];

export const useUsersStore = create<UsersState>((set, get) => ({
  users: MOCK_USERS,
  isLoading: false,

  getUserById: (id: string) => {
    return get().users.find((u) => u.id === id);
  },

  addUser: (user: Omit<User, 'id'>) => {
    const newUser: User = {
      ...user,
      id: Date.now().toString(),
    };
    set((state) => ({
      users: [...state.users, newUser],
    }));
  },

  updateUser: (id: string, updates: Partial<User>) => {
    set((state) => ({
      users: state.users.map((u) =>
        u.id === id ? { ...u, ...updates } : u
      ),
    }));
  },
}));
