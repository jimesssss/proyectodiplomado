/**
 * Tipos compartidos entre apps (api, web, mobile).
 *
 * En FASE 2+ se añadirán: eventos tipados (ERPEventMap),
 * permisos canónicos `recurso:acción` y tipos de tenant.
 */

/** Envelope estándar de respuesta de la API (/api/v1). */
export interface ApiMeta {
  readonly requestId: string;
  readonly timestamp: string;
  /** Paginación de listados (opcional; ver docs/api/conventions.md §5). */
  readonly page?: number;
  readonly limit?: number;
  readonly total?: number;
  readonly nextCursor?: string | null;
}

/** Envelope de error: `meta` solo lleva requestId (contrato de la API). */
export interface ApiErrorMeta {
  readonly requestId: string;
}

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export type ApiSuccess<T> = {
  readonly success: true;
  readonly data: T;
  readonly meta: ApiMeta;
  readonly error: null;
};

export type ApiFailure = {
  readonly success: false;
  readonly data: null;
  readonly meta: ApiErrorMeta;
  readonly error: ApiError;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
