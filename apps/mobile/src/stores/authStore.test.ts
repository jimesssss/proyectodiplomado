import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ storage: new Map<string, string>(), login: vi.fn(), refresh: vi.fn() }));
vi.mock('expo-secure-store', () => ({
  isAvailableAsync: vi.fn(async () => true),
  getItemAsync: vi.fn(async (key: string) => fake.storage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { fake.storage.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { fake.storage.delete(key); }),
}));
vi.mock('../services/auth-api', () => ({
  loginWithApi: fake.login, refreshWithApi: fake.refresh, registerWithApi: vi.fn(),
  AuthApiError: class extends Error {},
}));
vi.mock('../services/api-client', () => ({
  apiRequest: vi.fn(async () => ({ data: {} })), configureApiSession: vi.fn(),
  ApiError: class extends Error { constructor(readonly code: string, message: string, readonly status: number | null = null) { super(message); } },
}));
import { ApiError } from '../services/api-client';
const key = 'erpsc.refresh-token';
const tokens = {
  accessToken: 'isolated-access-token', refreshToken: 'isolated-refresh-token', expiresIn: 900,
  user: { id: 'u1', email: 'test@example.test', tenantId: 't1', displayName: 'Test', roles: ['owner'], permissions: ['product:delete'], status: 'active' },
};
async function boot() { return (await import('./authStore')).useAuthStore; }
function saveExpired() { fake.storage.set(key, JSON.stringify({ version: 1, expiresAt: Date.now() - 1000, tokens })); }
beforeEach(() => { vi.resetModules(); fake.storage.clear(); fake.login.mockReset(); fake.refresh.mockReset(); });
describe('secure native session restoration', () => {
  it('restores a valid session after a fresh application boot without rotating its refresh token', async () => {
    fake.login.mockResolvedValue(tokens);
    const original = await boot();
    expect(await original.getState().login('test@example.test', 'test-only')).toBe(true);
    expect(fake.storage.get(key)).toContain('isolated-refresh-token');
    vi.resetModules();
    const reopened = await boot();
    await reopened.getState().hydrate();
    expect(reopened.getState()).toMatchObject({ isAuthenticated: true, isHydrated: true, accessToken: tokens.accessToken, user: { id: 'u1' } });
    expect(fake.refresh).not.toHaveBeenCalled();
  });
  it('migrates an existing raw refresh token using the existing refresh operation', async () => {
    fake.storage.set(key, 'legacy-refresh'); fake.refresh.mockResolvedValue(tokens);
    const store = await boot(); await store.getState().hydrate();
    expect(fake.refresh).toHaveBeenCalledWith('legacy-refresh');
    expect(JSON.parse(fake.storage.get(key)!)).toMatchObject({ version: 1, tokens });
    expect(store.getState().isAuthenticated).toBe(true);
  });
  it('refreshes an expired access token once for concurrent hydration and saves the rotated token', async () => {
    saveExpired(); fake.refresh.mockResolvedValue({ ...tokens, refreshToken: 'rotated' });
    const store = await boot(); await Promise.all([store.getState().hydrate(), store.getState().hydrate()]);
    expect(fake.refresh).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ isAuthenticated: true, refreshToken: 'rotated' });
    expect(JSON.parse(fake.storage.get(key)!).tokens.refreshToken).toBe('rotated');
  });
  it('asks for login and removes stored credentials when the server rejects the refresh token', async () => {
    saveExpired(); fake.refresh.mockRejectedValue(new ApiError('UNAUTHENTICATED', 'Session expired', 401));
    const store = await boot(); await store.getState().hydrate();
    expect(store.getState()).toMatchObject({ isAuthenticated: false, isHydrated: true, refreshToken: null, user: null });
    await vi.waitFor(() => expect(fake.storage.has(key)).toBe(false));
  });
  it.each([null, 503])('does not treat a network/server error (%s) as session expiry', async status => {
    saveExpired(); fake.refresh.mockRejectedValue(new ApiError('NETWORK_ERROR', 'Unavailable', status));
    const store = await boot(); await store.getState().hydrate();
    expect(store.getState()).toMatchObject({ isAuthenticated: true, isHydrated: true, refreshToken: tokens.refreshToken, error: 'Unavailable' });
    expect(fake.storage.has(key)).toBe(true);
  });
  it('does not resurrect a session when logout happens during restoration', async () => {
    saveExpired(); let resolve!: (value: typeof tokens) => void;
    fake.refresh.mockReturnValue(new Promise(r => { resolve = r; }));
    const store = await boot(); const restoring = store.getState().hydrate();
    await vi.waitFor(() => expect(fake.refresh).toHaveBeenCalledOnce());
    await store.getState().logout(); resolve(tokens); await restoring;
    expect(store.getState()).toMatchObject({ isAuthenticated: false, isHydrated: true, refreshToken: null });
    expect(fake.storage.has(key)).toBe(false);
  });
  it('does not expire a newer login when an older restoration finishes', async () => {
    saveExpired(); let resolve!: (value: typeof tokens) => void;
    fake.refresh.mockReturnValue(new Promise(r => { resolve = r; }));
    fake.login.mockResolvedValue({ ...tokens, refreshToken: 'new-login-refresh' });
    const store = await boot(); const restoring = store.getState().hydrate();
    await vi.waitFor(() => expect(fake.refresh).toHaveBeenCalledOnce());
    expect(await store.getState().login('test@example.test', 'test-only')).toBe(true);
    resolve(tokens); await restoring;
    expect(store.getState()).toMatchObject({ isAuthenticated: true, refreshToken: 'new-login-refresh' });
    expect(JSON.parse(fake.storage.get(key)!).tokens.refreshToken).toBe('new-login-refresh');
  });

});
