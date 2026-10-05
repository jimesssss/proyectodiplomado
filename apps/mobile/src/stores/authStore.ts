/**
 * Auth Store — estado de autenticación de la aplicación.
 * Los tokens se mantienen en memoria; el almacenamiento persistente de sesión
 * queda fuera de este alcance.
 */
import { create } from 'zustand';
import { loginWithApi, registerWithApi } from '../services/auth-api'

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  user: {
    id: string;
    email: string;
    name: string;
  } | null;

  login: (email: string, password: string) => Promise<boolean>;
  register: (input: {
    displayName: string;
    email: string;
    password: string;
  }) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: false,
  error: null,
  accessToken: null,
  refreshToken: null,
  user: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await loginWithApi(email, password);
      set({
        isAuthenticated: true,
        isLoading: false,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.displayName,
        },
      });
      return true;
    } catch (error) {
      set({
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo iniciar sesión. Inténtalo nuevamente.',
      });
      return false;
    }
  },

  register: async (input) => {
    set({ isLoading: true, error: null });
    try {
      await registerWithApi(input);
      set({ isLoading: false, error: null });
      return true;
    } catch (error) {
      set({
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo crear la cuenta. Inténtalo nuevamente.',
      });
      return false;
    }
  },

  logout: () => {
    set({
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      user: null,
      error: null,
    });
  },

  clearError: () => {
    set({ error: null });
  },
}));
