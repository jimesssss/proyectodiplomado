import { hash, verify } from '@node-rs/argon2';

/**
 * Hash de contraseñas con Argon2id (parámetros OWASP 2024: m=19456, t=2, p=1).
 * El algoritmo por defecto de @node-rs/argon2 es Argon2id (no se referencia el
 * enum ambiental `Algorithm` porque choca con `verbatimModuleSyntax`).
 * Nunca texto plano, nunca MD5/SHA simple.
 */
const ARGON_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password, ARGON_OPTIONS);
  } catch {
    // Hash corrupto o algoritmo desconocido: credencial inválida, no error 500.
    return false;
  }
}
