import { describe, expect, it } from 'vitest';
import {
  isLocked,
  recordFailedAttempt,
  LOGIN_ATTEMPT_WINDOW_MS,
  LOGIN_LOCK_DURATION_MS,
  MAX_LOGIN_ATTEMPTS,
  validatePasswordPolicy,
} from './auth-rules.js';

describe('validatePasswordPolicy', () => {
  it('acepta una contraseña que cumple todo', () => {
    const result = validatePasswordPolicy('Erp-Secret-2026x');
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rechaza cortas, sin mayúscula, sin dígito', () => {
    const result = validatePasswordPolicy('abc');
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });

  it('rechaza más de 128 caracteres', () => {
    const long = `Aa1${'x'.repeat(200)}`;
    expect(validatePasswordPolicy(long).valid).toBe(false);
  });
});

describe('recordFailedAttempt / isLocked', () => {
  const now = 1_700_000_000_000;

  it('no bloquea antes del máximo de intentos', () => {
    let state = null;
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i++) {
      const result = recordFailedAttempt(state, now);
      state = result.state;
      expect(result.locked).toBe(false);
    }
    expect(isLocked(state, now)).toBe(false);
  });

  it('bloquea al alcanzar el máximo', () => {
    let state = null;
    let locked = false;
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      const result = recordFailedAttempt(state, now);
      state = result.state;
      locked = result.locked;
    }
    expect(locked).toBe(true);
    expect(isLocked(state, now)).toBe(true);
    expect(isLocked(state, now + LOGIN_LOCK_DURATION_MS + 1)).toBe(false);
  });

  it('la ventana expirada reinicia el conteo', () => {
    let state = null;
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      state = recordFailedAttempt(state, now).state;
    }
    expect(isLocked(state, now + LOGIN_ATTEMPT_WINDOW_MS + LOGIN_LOCK_DURATION_MS)).toBe(false);
    const afterWindow = recordFailedAttempt(state, now + LOGIN_ATTEMPT_WINDOW_MS + 1);
    expect(afterWindow.state.count).toBe(1);
    expect(afterWindow.locked).toBe(false);
  });
});
