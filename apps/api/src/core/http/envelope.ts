import type { ApiError, ApiFailure, ApiMeta, ApiSuccess } from '@erp/shared-types';

/** Construye el `meta` de respuestas exitosas (requestId + timestamp ISO). */
export function buildMeta(requestId: string): ApiMeta {
  return { requestId, timestamp: new Date().toISOString() };
}

/** Metadatos de paginación de listados (docs/api/conventions.md §5). */
export interface ListPagination {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly nextCursor?: string | null;
}

/** Envelope de éxito: { success, data, meta, error: null }. */
export function successResponse<T>(requestId: string, data: T): ApiSuccess<T> {
  return { success: true, data, meta: buildMeta(requestId), error: null };
}

/** Envelope de éxito con metadatos de paginación para listados. */
export function successListResponse<T>(
  requestId: string,
  data: T,
  pagination: ListPagination,
): ApiSuccess<T> {
  return { success: true, data, meta: { ...buildMeta(requestId), ...pagination }, error: null };
}

/** Envelope de error: meta solo con requestId (contrato de la API). */
export function errorResponse(requestId: string, error: ApiError): ApiFailure {
  return { success: false, data: null, meta: { requestId }, error };
}
