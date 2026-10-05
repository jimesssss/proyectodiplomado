import Constants from 'expo-constants';

interface ApiErrorBody {
  readonly code?: string;
  readonly message?: string;
}

interface ApiEnvelope<T> {
  readonly success?: boolean;
  readonly data?: T | null;
  readonly error?: ApiErrorBody | null;
}

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly tenantId: string;
  readonly displayName: string;
  readonly roles: readonly string[];
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
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

function getApiBaseUrl(): string {
  const configuredUrl: unknown = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof configuredUrl !== 'string' || configuredUrl.trim().length === 0) {
    throw new AuthApiError(
      'API_CONFIGURATION_ERROR',
      'La dirección del servicio no está configurada.',
    );
  }
  return configuredUrl.replace(/\/+$/, '');
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
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthApiError(
      'NETWORK_ERROR',
      'No se pudo conectar con ERP-SC. Comprueba tu conexión e inténtalo de nuevo.',
    );
  }

  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new AuthApiError('INVALID_RESPONSE', 'El servicio devolvió una respuesta no válida.');
  }

  if (!response.ok || envelope.success !== true || envelope.data === null || envelope.data === undefined) {
    const error = envelope.error;
    throw new AuthApiError(
      error?.code ?? `HTTP_${response.status}`,
      mapApiError(error?.code ?? '', error?.message ?? ''),
    );
  }

  return envelope.data;
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
