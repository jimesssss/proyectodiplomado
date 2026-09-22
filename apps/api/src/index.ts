/**
 * FASE 0.5 — placeholder de arranque del API.
 *
 * NOT TESTED como servidor HTTP: Express, config, DB y health checks
 * se implementan en FASE 2 (Core). Este archivo solo valida que el
 * toolchain (TypeScript estricto + build + test) funciona.
 */
import type { ApiMeta } from '@erp/shared-types';

export function buildMeta(requestId: string): ApiMeta {
  return { requestId, timestamp: new Date().toISOString() };
}

const meta = buildMeta('bootstrap');
process.stdout.write(`erp-api bootstrap ok requestId=${meta.requestId}\n`);
