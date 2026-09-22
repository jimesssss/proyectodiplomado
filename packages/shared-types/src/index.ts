/**
 * Tipos compartidos entre apps (api, web, mobile).
 *
 * En FASE 2 se añadirán: envelope de API, eventos tipados (ERPEventMap),
 * permisos canónicos `recurso:acción` y tipos de tenant.
 */

/** Envelope estándar de respuesta de la API (/api/v1). */
export interface ApiMeta {
  readonly requestId: string;
  readonly timestamp: string;
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
  readonly meta: ApiMeta;
  readonly error: ApiError;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
