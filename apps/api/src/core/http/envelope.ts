import type { ApiError, ApiFailure, ApiMeta, ApiSuccess } from '@erp/shared-types';

/** Construye el `meta` de respuestas exitosas (requestId + timestamp ISO). */
export function buildMeta(requestId: string): ApiMeta {
  return { requestId, timestamp: new Date().toISOString() };
}

/** Envelope de éxito: { success, data, meta, error: null }. */
export function successResponse<T>(requestId: string, data: T): ApiSuccess<T> {
  return { success: true, data, meta: buildMeta(requestId), error: null };
}

/** Envelope de error: meta solo con requestId (contrato de la API). */
export function errorResponse(requestId: string, error: ApiError): ApiFailure {
  return { success: false, data: null, meta: { requestId }, error };
}
