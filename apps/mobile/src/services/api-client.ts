import Constants from 'expo-constants';
export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number | null = null, readonly diagnostic: {method?:string;url?:string;backendMessage?:string;responseBody?:unknown} = {}) {
    super(message); this.name = 'ApiError';
  }
}
interface SessionProvider { token(): string | null; refresh(): Promise<void>; expire(): void; identity?(): string | null; }
let session: SessionProvider | undefined;
export function configureApiSession(provider: SessionProvider): void { session = provider; }
export interface ApiResult<T> { data: T; meta: { total?: number; requestId?: string }; }
const messages: Record<number, string> = {
  400: 'La solicitud no cumple el formato esperado.',
  401: 'Tu sesión expiró. Inicia sesión nuevamente.',
  403: 'No tienes permisos para realizar esta operación.',
  404: 'No se encontró el registro solicitado.',
  409: 'La operación entra en conflicto con los datos actuales.',
  422: 'Los datos no se pueden procesar.',
  429: 'Demasiadas solicitudes. Espera un momento.',
  500: 'El servidor tuvo un problema. Inténtalo nuevamente más tarde.',
  502: 'El servicio no está disponible. Inténtalo más tarde.',
  503: 'El servicio no está disponible. Inténtalo más tarde.',
  504: 'El servidor tardó demasiado. Inténtalo más tarde.',
};
export async function apiRequest<T>(path: string, options: {
  method?: string; body?: unknown; public?: boolean; retry?: boolean;
} = {}): Promise<ApiResult<T>> {
  const base: unknown = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof base !== 'string' || !base.trim()) throw new ApiError('API_CONFIGURATION_ERROR', 'La dirección del servicio no está configurada.');
  const token = options.public ? null : session?.token();
  if (!options.public && !token) throw new ApiError('UNAUTHENTICATED', messages[401]!, 401);
  const identity=session?.identity?.();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const url = `${base.replace(/\/+$/, '')}${path}`;
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: controller.signal,
    });
    if(!options.public && identity!==session?.identity?.())throw new ApiError('SESSION_CHANGED','La sesión cambió. Actualiza la pantalla.',401);
    if (response.status === 401 && !options.public && options.retry !== false && session) {
      clearTimeout(timer); await session.refresh();
      return apiRequest<T>(path, { ...options, retry: false });
    }
    if (response.status === 401 && !options.public) session?.expire();
    const body = await response.json().catch(() => null) as {
      success?: boolean; data?: T; error?: { code?: string; message?: string }; meta?: ApiResult<T>['meta'];
    } | null;
    if (!options.public && identity !== session?.identity?.()) throw new ApiError('SESSION_CHANGED','La sesión cambió. Actualiza la pantalla.',401);
    if (!response.ok || body?.success !== true) {
      throw new ApiError(body?.error?.code ?? `HTTP_${response.status}`,
        ([400,409,422].includes(response.status) && body?.error?.message ? `${messages[response.status]} ${body.error.message}` : messages[response.status] ?? body?.error?.message ?? 'Revisa los datos ingresados.'), response.status,
        {method:options.method??'GET',url,...(body?.error?.message?{backendMessage:body.error.message}:{}),
         responseBody:{success:false,error:body?.error??{},meta:body?.meta??{}}});
    }
    if (body.data === undefined || body.data === null) throw new ApiError('INVALID_RESPONSE', 'El servidor devolvió una respuesta sin datos.', response.status);
    return { data: body.data, meta: body.meta ?? {} };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      controller.signal.aborted ? 'La solicitud tardó demasiado. Inténtalo nuevamente.' : 'No se pudo conectar con ERP-SC. Comprueba tu conexión.');
  } finally { clearTimeout(timer); }
}
export async function apiList<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= 10_000; page++) {
    const result = await apiRequest<T[]>(`${path}${path.includes('?') ? '&' : '?'}page=${page}&limit=100`);
    if (!Array.isArray(result.data)) throw new ApiError('INVALID_RESPONSE', 'El listado recibido no es válido.');
    items.push(...result.data);
    if (result.data.length < 100 || (result.meta.total !== undefined && items.length >= result.meta.total)) return items;
  }
  throw new ApiError('LIST_LIMIT', 'El listado supera el límite permitido. Aplica filtros.');
}
