import { apiRequest, ApiError } from './api-client';


export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly tenantId: string;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly permissions?: readonly string[];
  readonly status: string;
}

export interface LoginResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly user: AuthUser;
}

export class AuthApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mapApiError(code: string, message: string): string {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 'Correo o contraseña incorrectos.';
    case 'FORBIDDEN':
      return message === 'Account disabled'
        ? 'La cuenta está deshabilitada o pendiente de verificación. Revisa tu correo si acabas de registrarte.'
        : 'No tienes acceso a la cuenta.';
    case 'CONFLICT':
      return 'Ya existe una cuenta con ese correo electrónico.';
    case 'VALIDATION_ERROR':
      return 'Revisa los datos ingresados. La contraseña debe tener al menos 12 caracteres, mayúscula, minúscula y número.';
    case 'RATE_LIMITED':
      return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
    case 'SERVICE_UNAVAILABLE':
      return 'El servicio no está disponible en este momento. Inténtalo más tarde.';
    default:
      return message || 'No se pudo completar la solicitud.';
  }
}

async function post<T>(path: string, body: Record<string, string>): Promise<T> {
  try { return (await apiRequest<T>('/auth/' + path, { method: 'POST', body, public: true })).data; }
  catch (error) {
    if (error instanceof ApiError) {
      const message = error.code === 'NETWORK_ERROR' ? 'No se pudo conectar con ERP-SC. Comprueba tu conexión e inténtalo de nuevo.' :
        mapApiError(error.code, error.message);
      throw new AuthApiError(error.code, message, error.status);
    }
    throw error;
  }
}

export async function loginWithApi(email: string, password: string): Promise<LoginResponse> {
  const data = await post<unknown>('login', { email: email.trim().toLowerCase(), password });
  if (
    !isRecord(data) ||
    typeof data.accessToken !== 'string' ||
    typeof data.refreshToken !== 'string' ||
    typeof data.expiresIn !== 'number' ||
    !isRecord(data.user) ||
    typeof data.user.id !== 'string' ||
    typeof data.user.email !== 'string' ||
    typeof data.user.tenantId !== 'string' ||
    typeof data.user.displayName !== 'string' ||
    !Array.isArray(data.user.roles) ||
    !data.user.roles.every((role: unknown) => typeof role === 'string') ||
    typeof data.user.status !== 'string'
  ) {
    throw new AuthApiError('INVALID_RESPONSE', 'El servicio devolvió datos de acceso no válidos.');
  }

  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
    user: {
      id: data.user.id,
      email: data.user.email,
      tenantId: data.user.tenantId,
      displayName: data.user.displayName,
      roles: data.user.roles,
      permissions: Array.isArray(data.user.permissions) ? data.user.permissions.filter((p: unknown): p is string => typeof p === 'string') : [],
      status: data.user.status,
    },
  };
}

export async function registerWithApi(input: {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
}): Promise<void> {
  await post('register', {
    displayName: input.displayName.trim(),
    email: input.email.trim().toLowerCase(),
    password: input.password,
  });
}

export async function refreshWithApi(refreshToken: string): Promise<LoginResponse> {
  return (await apiRequest<LoginResponse>('/auth/refresh', { method: 'POST', body: { refreshToken }, public: true, timeoutMs: 60_000 })).data;
}
export async function verifyEmailWithApi(token: string): Promise<void> { await post('verify-email', { token }); }
export async function resendVerificationWithApi(email: string): Promise<void> { await post('resend-verification', { email: email.trim().toLowerCase() }); }
export async function forgotPasswordWithApi(email: string): Promise<void> { await post('forgot-password', { email: email.trim().toLowerCase() }); }
export async function resetPasswordWithApi(token: string, newPassword: string): Promise<void> { await post('reset-password', { token, newPassword }); }
export async function changePasswordWithApi(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
}
