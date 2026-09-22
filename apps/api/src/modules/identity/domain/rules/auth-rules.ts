/**
 * Reglas de dominio: política de contraseñas y bloqueo por intentos.
 */

export interface PasswordPolicyResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Política documentada en docs/security. Cambios → reconsiderar hashes previos. */
export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const issues: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push(`Must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push(`Must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  if (!/[a-z]/.test(password)) {
    issues.push('Must contain a lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    issues.push('Must contain an uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    issues.push('Must contain a digit');
  }
  return { valid: issues.length === 0, issues };
}

/** Bloqueo por intentos fallidos (ADR-004): 5 fallos → 15 min. */
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;

export interface AttemptState {
  readonly count: number;
  readonly windowStart: number;
  readonly lockedUntil?: number;
}

export function isLocked(state: AttemptState | null, now: number): boolean {
  if (state === null) {
    return false;
  }
  if (state.lockedUntil !== undefined && state.lockedUntil > now) {
    return true;
  }
  // Ventana expirada → contador vuelve a cero.
  if (now - state.windowStart >= LOGIN_ATTEMPT_WINDOW_MS) {
    return false;
  }
  return false;
}

/**
 * Registra un intento fallido. Devuelve el nuevo estado y si hay bloqueo.
 * Clave: por (email, tenant) — la ventana no caducada conserva el conteo.
 */
export function recordFailedAttempt(
  state: AttemptState | null,
  now: number,
): { state: AttemptState; locked: boolean } {
  const windowExpired = state === null || now - state.windowStart >= LOGIN_ATTEMPT_WINDOW_MS;
  const windowStart = windowExpired ? now : state.windowStart;
  const count = (windowExpired ? 0 : state.count) + 1;
  if (count >= MAX_LOGIN_ATTEMPTS) {
    return {
      state: { count, windowStart, lockedUntil: now + LOGIN_LOCK_DURATION_MS },
      locked: true,
    };
  }
  return { state: { count, windowStart }, locked: false };
}
