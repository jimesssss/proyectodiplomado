import { z } from 'zod';
import { ConfigError } from '../errors/app-error.js';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
        : [],
    ),
});

export type NodeEnv = z.infer<typeof envSchema>['NODE_ENV'];
export type LogLevel = z.infer<typeof envSchema>['LOG_LEVEL'];

export interface Env {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly mongoDbUri: string;
  readonly logLevel: LogLevel;
  readonly corsOrigins: readonly string[];
}

function toEnv(parsed: z.infer<typeof envSchema>): Env {
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    mongoDbUri: parsed.MONGODB_URI,
    logLevel: parsed.LOG_LEVEL,
    corsOrigins: parsed.CORS_ORIGINS,
  };
}

/**
 * Carga y valida la configuración. Falla rápido (fail fast): el proceso
 * no debe arrancar con una configuración inválida.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigError('Invalid environment configuration', {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    });
  }
  return toEnv(result.data);
}
