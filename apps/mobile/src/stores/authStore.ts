import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { AuthApiError, loginWithApi, registerWithApi, refreshWithApi, type LoginResponse } from '../services/auth-api';
import { apiRequest, ApiError, configureApiSession } from '../services/api-client';

const SESSION_KEY = 'erpsc.refresh-token';
let storageQueue = Promise.resolve();
let generation = 0;
let refreshPromise: Promise<void> | null = null;
let hydrationPromise: Promise<void> | null = null;
interface SavedSession { version: 1; expiresAt: number; tokens: LoginResponse; }
function readSavedSession(value: string): SavedSession | null {
  try {
    const saved = JSON.parse(value) as SavedSession;
    const tokens = saved?.tokens;
    if (saved.version !== 1 || !Number.isFinite(saved.expiresAt) ||
        typeof tokens?.accessToken !== 'string' || typeof tokens.refreshToken !== 'string' ||
        typeof tokens.user?.id !== 'string' || typeof tokens.user.tenantId !== 'string' ||
        typeof tokens.user.email !== 'string' || typeof tokens.user.displayName !== 'string' ||
        !Array.isArray(tokens.user.roles) || !Array.isArray(tokens.user.permissions)) return null;
    return saved;
  } catch { return null; }
}
function persist(tokens: LoginResponse | null): Promise<void> {
  const saved: SavedSession | null = tokens ? { version: 1, expiresAt: Date.now() + tokens.expiresIn * 1000, tokens } : null;
  storageQueue = storageQueue.catch(() => undefined).then(async () => {
    if (!(await SecureStore.isAvailableAsync())) return;
    if (saved === null) await SecureStore.deleteItemAsync(SESSION_KEY);
    else await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(saved));
  });
  return storageQueue;
}
interface AuthState {
  isAuthenticated: boolean; isLoading: boolean; isHydrated: boolean; error: string | null;
  accessToken: string | null; refreshToken: string | null; permissions: readonly string[];
  user: { id: string; email: string; name: string; roles: readonly string[]; tenantId: string } | null;
  login(email: string, password: string): Promise<boolean>;
  register(input: { displayName: string; email: string; password: string }): Promise<boolean>;
  hydrate(): Promise<void>; refreshSession(): Promise<void>; logout(): Promise<void>; expire(): void;
  clearError(): void; can(permission: string): boolean;
}
function stateFor(result: LoginResponse) {
  return { isAuthenticated: true, accessToken: result.accessToken, refreshToken: result.refreshToken,
    permissions: result.user.permissions ?? [],
    user: { id: result.user.id, email: result.user.email, name: result.user.displayName,
      roles: result.user.roles, tenantId: result.user.tenantId } };
}
export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false, isLoading: false, isHydrated: false, error: null,
  accessToken: null, refreshToken: null, permissions: [], user: null,
  login: async (email, password) => {
    const attempt = ++generation;
    set({ isLoading: true, error: null });
    try {
      const result = await loginWithApi(email, password);
      if (attempt !== generation) return false;
      await persist(result);
      if (attempt !== generation) return false;
      set({ ...stateFor(result), isLoading: false, isHydrated: true }); return true;
    } catch (error) {
      if (attempt === generation) set({ isLoading: false, error: error instanceof Error ? error.message : 'No se pudo iniciar sesión.' });
      return false;
    }
  },
  register: async input => {
    set({ isLoading: true, error: null });
    try { await registerWithApi(input); set({ isLoading: false }); return true; }
    catch (error) { set({ isLoading: false, error: error instanceof Error ? error.message : 'No se pudo crear la cuenta.' }); return false; }
  },
  hydrate: () => {
    if (hydrationPromise) return hydrationPromise;
    if (get().isHydrated || get().isLoading) return Promise.resolve();
    const attempt = generation;
    set({ isLoading: true });
    hydrationPromise = (async () => {
      let saved: SavedSession | null = null;
      try {
        await storageQueue;
        if (await SecureStore.isAvailableAsync()) {
          const value = await SecureStore.getItemAsync(SESSION_KEY);
          if (attempt !== generation || !value) return;
          saved = readSavedSession(value);
          // Existing installations stored the raw refresh token in this same key.
          set({ refreshToken: saved?.tokens.refreshToken ?? value });
          if (saved && saved.expiresAt > Date.now() + 30_000) {
            set({ ...stateFor(saved.tokens), error: null });
            return;
          }
          await get().refreshSession();
        }
      } catch (error) {
        if (attempt !== generation) return;
        // Network/server failures do not prove that a saved session expired.
        // The API still validates every request and handles access-token expiry.
        if (saved && get().refreshToken && error instanceof ApiError &&
            (error.status === null || error.status === 429 || (error.status ?? 0) >= 500)) {
          set(stateFor(saved.tokens));
        }
        set({ error: error instanceof Error ? error.message : 'No se pudo restaurar la sesión.' });
      } finally {
        if (attempt === generation) set({ isLoading: false, isHydrated: true });
        hydrationPromise = null;
      }
    })();
    return hydrationPromise;
  },
  refreshSession: () => {
    if (refreshPromise) return refreshPromise;
    const attempt = generation;
    const token = get().refreshToken;
    if (!token) { get().expire(); return Promise.reject(new ApiError('UNAUTHENTICATED', 'Inicia sesión nuevamente.', 401)); }
    refreshPromise = (async () => {
      try {
        const result = await refreshWithApi(token);
        if (attempt !== generation) throw new ApiError('UNAUTHENTICATED', 'La sesión se cerró.', 401);
        await persist(result);
        if (attempt !== generation) throw new ApiError('UNAUTHENTICATED', 'La sesión se cerró.', 401);
        set({ ...stateFor(result), error: null });
      } catch (error) {
        if (attempt === generation && (error instanceof ApiError || error instanceof AuthApiError) && (error.status === 401 || error.status === 403)) get().expire();
        throw error;
      } finally { refreshPromise = null; }
    })();
    return refreshPromise;
  },
  expire: () => {
    generation++;
    set({ isAuthenticated: false, isLoading: false, isHydrated: true, accessToken: null, refreshToken: null, user: null, permissions: [] });
    void persist(null).catch(() => set({ error: 'No se pudo borrar la sesión guardada.' }));
  },
  logout: async () => {
    try { if (get().accessToken) await apiRequest('/auth/logout', { method: 'POST', retry: false }); }
    catch (error) { set({ error: error instanceof Error ? error.message : 'No se pudo revocar la sesión remota.' }); }
    finally { get().expire(); await storageQueue.catch(() => undefined); }
  },
  clearError: () => set({ error: null }),
  can: permission => get().permissions.includes(permission),
}));
configureApiSession({ token: () => useAuthStore.getState().accessToken,
  identity:()=>useAuthStore.getState().user?.id??null,
  refresh: () => useAuthStore.getState().refreshSession(), expire: () => useAuthStore.getState().expire() });
