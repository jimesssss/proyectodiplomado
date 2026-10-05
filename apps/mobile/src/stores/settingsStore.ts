/**
 * Settings Store — Zustand
 *
 * Datos mock para el módulo de configuración.
 */
import { create } from 'zustand';

export interface CompanySettings {
  name: string;
  rfc: string;
  address: string;
  phone: string;
  email: string;
}

export interface BranchSettings {
  name: string;
  code: string;
  address: string;
}

export interface FiscalSettings {
  taxRegime: string;
  defaultTax: number;
  currency: string;
}

export interface PreferencesSettings {
  lowStockAlert: boolean;
  negativeStock: boolean;
  automaticPrices: boolean;
  showPricesWithTax: boolean;
}

export interface NotificationSettings {
  stockAlerts: boolean;
  dailySummary: boolean;
}

export interface SecuritySettings {
  twoFactorAuth: boolean;
  loginNotifications: boolean;
}

interface SettingsState {
  company: CompanySettings;
  branch: BranchSettings;
  fiscal: FiscalSettings;
  preferences: PreferencesSettings;
  notifications: NotificationSettings;
  security: SecuritySettings;
  isLoading: boolean;

  updateCompany: (settings: Partial<CompanySettings>) => void;
  updateBranch: (settings: Partial<BranchSettings>) => void;
  updateFiscal: (settings: Partial<FiscalSettings>) => void;
  updatePreferences: (settings: Partial<PreferencesSettings>) => void;
  updateNotifications: (settings: Partial<NotificationSettings>) => void;
  updateSecurity: (settings: Partial<SecuritySettings>) => void;
}

const MOCK_COMPANY: CompanySettings = {
  name: 'Mi Empresa SA de CV',
  rfc: 'MEE123456ABC',
  address: 'Av. Principal 123, CDMX',
  phone: '555-123-4567',
  email: 'contacto@miempresa.com',
};

const MOCK_BRANCH: BranchSettings = {
  name: 'Sucursal Centro',
  code: 'CEN-001',
  address: 'Calle Central 456, CDMX',
};

const MOCK_FISCAL: FiscalSettings = {
  taxRegime: 'Régimen General de Ley',
  defaultTax: 16,
  currency: 'MXN',
};

const MOCK_PREFERENCES: PreferencesSettings = {
  lowStockAlert: true,
  negativeStock: false,
  automaticPrices: true,
  showPricesWithTax: false,
};

const MOCK_NOTIFICATIONS: NotificationSettings = {
  stockAlerts: true,
  dailySummary: true,
};

const MOCK_SECURITY: SecuritySettings = {
  twoFactorAuth: false,
  loginNotifications: true,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  company: MOCK_COMPANY,
  branch: MOCK_BRANCH,
  fiscal: MOCK_FISCAL,
  preferences: MOCK_PREFERENCES,
  notifications: MOCK_NOTIFICATIONS,
  security: MOCK_SECURITY,
  isLoading: false,

  updateCompany: (settings: Partial<CompanySettings>) => {
    set((state) => ({
      company: {
        ...state.company,
        ...settings,
      },
    }));
  },

  updateBranch: (settings: Partial<BranchSettings>) => {
    set((state) => ({
      branch: {
        ...state.branch,
        ...settings,
      },
    }));
  },

  updateFiscal: (settings: Partial<FiscalSettings>) => {
    set((state) => ({
      fiscal: {
        ...state.fiscal,
        ...settings,
      },
    }));
  },

  updatePreferences: (settings: Partial<PreferencesSettings>) => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        ...settings,
      },
    }));
  },

  updateNotifications: (settings: Partial<NotificationSettings>) => {
    set((state) => ({
      notifications: {
        ...state.notifications,
        ...settings,
      },
    }));
  },

  updateSecurity: (settings: Partial<SecuritySettings>) => {
    set((state) => ({
      security: {
        ...state.security,
        ...settings,
      },
    }));
  },
}));