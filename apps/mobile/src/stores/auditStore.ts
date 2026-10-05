/**
 * Audit Store — Zustand
 *
 * Gestiona el historial de acciones del sistema.
 */
import { create } from 'zustand';

export interface AuditLog {
  id: string;
  user: string;
  action: string;
  module: string;
  date: string;
  details?: string;
}

interface NewAuditLog {
  user: string;
  action: string;
  module: string;
  details?: string;
}

interface AuditState {
  logs: AuditLog[];
  isLoading: boolean;

  addLog: (log: NewAuditLog) => void;
  getLogsByUser: (user: string) => AuditLog[];
  getLogsByModule: (module: string) => AuditLog[];
}

const MOCK_LOGS: AuditLog[] = [
  {
    id: '1',
    user: 'Admin',
    action: 'Producto creado',
    module: 'Productos',
    date: '2026-09-29 10:30',
    details: 'Se creó el producto "Laptop HP 15"',
  },
  {
    id: '2',
    user: 'Cajero',
    action: 'Venta registrada',
    module: 'Ventas',
    date: '2026-09-29 10:15',
    details: 'Venta VTA-0001 por $1,250.00',
  },
  {
    id: '3',
    user: 'Admin',
    action: 'Inventario actualizado',
    module: 'Inventario',
    date: '2026-09-29 09:45',
    details: 'Ajuste de stock en "Teclado Mecánico"',
  },
  {
    id: '4',
    user: 'Admin',
    action: 'Usuario modificado',
    module: 'Usuarios',
    date: '2026-09-28 16:20',
    details: 'Se actualizó el rol de "Juan Cajero"',
  },
  {
    id: '5',
    user: 'Gerente',
    action: 'Compra registrada',
    module: 'Compras',
    date: '2026-09-28 14:00',
    details: 'Orden de compra OC-0002',
  },
  {
    id: '6',
    user: 'Admin',
    action: 'Gasto registrado',
    module: 'Gastos',
    date: '2026-09-28 11:30',
    details: 'Gasto de papelería por $200.00',
  },
  {
    id: '7',
    user: 'Cajero',
    action: 'Venta cancelada',
    module: 'Ventas',
    date: '2026-09-27 15:45',
    details: 'Venta VTA-0005 cancelada',
  },
  {
    id: '8',
    user: 'Admin',
    action: 'Caja cerrada',
    module: 'Caja',
    date: '2026-09-27 18:00',
    details: 'Cierre de caja con saldo $2,900.00',
  },
];

const formatDate = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

export const useAuditStore = create<AuditState>((set, get) => ({
  logs: MOCK_LOGS,
  isLoading: false,

  addLog: (log) => {
    const newLog: AuditLog = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user: log.user,
      action: log.action,
      module: log.module,
      date: formatDate(),
      details: log.details,
    };

    set((state) => ({
      logs: [newLog, ...state.logs],
    }));
  },

  getLogsByUser: (user: string) => {
    return get().logs.filter(
      (log) => log.user === user
    );
  },

  getLogsByModule: (module: string) => {
    return get().logs.filter(
      (log) => log.module === module
    );
  },
}));