import { generateKeyPairSync } from 'node:crypto';
import type { Logger } from '../logging/logger.js';

export interface JwtKeys {
  readonly privateKey: string;
  readonly publicKey: string;
}

/**
 * Resuelve las claves RS256:
 * - Producción: obligatorias desde variables de entorno (valida loadConfig).
 * - Dev/test: si faltan, genera un par efímero (las sesiones morirán al
 *   reiniciar el proceso; aceptable solo fuera de producción) y avisa.
 */
export function resolveJwtKeys(
  env: { privateKeyB64?: string; publicKeyB64?: string },
  logger?: Logger,
): JwtKeys {
  if (env.privateKeyB64 !== undefined && env.publicKeyB64 !== undefined) {
    return {
      privateKey: Buffer.from(env.privateKeyB64, 'base64').toString('utf8'),
      publicKey: Buffer.from(env.publicKeyB64, 'base64').toString('utf8'),
    };
  }
  logger?.warn('JWT keys not provided — using ephemeral keypair (sessions invalid after restart)');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}
