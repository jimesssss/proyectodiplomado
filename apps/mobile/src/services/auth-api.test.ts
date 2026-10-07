import { afterEach, describe, expect, it, vi } from 'vitest';
import { loginWithApi, registerWithApi, refreshWithApi } from './auth-api.js';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: { apiBaseUrl: 'http://localhost:4000/api/v1' },
    },
  },
}));

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('mobile auth API', () => {
  it('posts registration data to the existing API base URL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: { emailVerificationRequired: true } }),
    });

    await expect(
      registerWithApi({
        displayName: 'Test User',
        email: ' TEST@EXAMPLE.COM ',
        password: 'GoodPassword123',
      }),
    ).resolves.toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          displayName: 'Test User',
          email: 'test@example.com',
          password: 'GoodPassword123',
        }),
      }),
    );
  });

  it('returns typed access tokens and user data for successful login', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 900,
          user: {
            id: 'user-id',
            email: 'test@example.com',
            tenantId: 'tenant-id',
            displayName: 'Test User',
            roles: ['owner'],
            status: 'active',
          },
        },
      }),
    });

    await expect(loginWithApi(' TEST@EXAMPLE.COM ', 'GoodPassword123')).resolves.toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { email: 'test@example.com', displayName: 'Test User' },
    });
  });

  it('maps duplicate account errors to a user-friendly message', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        success: false,
        error: { code: 'CONFLICT', message: 'Email already in use' },
      }),
    });

    await expect(
      registerWithApi({
        displayName: 'Test User',
        email: 'test@example.com',
        password: 'GoodPassword123',
      }),
    ).rejects.toMatchObject({
      name: 'AuthApiError',
      message: 'Ya existe una cuenta con ese correo electrónico.',
    });
  });

  it('surfaces connection failures explicitly', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(loginWithApi('test@example.com', 'GoodPassword123')).rejects.toEqual(
      expect.objectContaining({
        code: 'NETWORK_ERROR',
        message: 'No se pudo conectar con ERP-SC. Comprueba tu conexión e inténtalo de nuevo.',
      }),
    );
  });
  it('allows a cold server to wake up during refresh but still times out after 60 seconds without retrying', async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
      signal = options.signal;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    });
    const result = refreshWithApi('isolated-refresh').catch(error => error);
    await vi.advanceTimersByTimeAsync(55_000);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await result).toMatchObject({ code: 'REQUEST_TIMEOUT' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

});
