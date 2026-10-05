import { z } from 'zod';
import { ConfigError } from '../errors/app-error.js';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const envSchema = z
  .object({
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
    // Auth (ADR-004)
    JWT_ISSUER: z.string().min(1).default('erp'),
    JWT_AUDIENCE: z.string().min(1).default('erp-api'),
    ACCESS_TOKEN_TTL: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL: z.coerce.number().int().min(3600).default(2_592_000),
    JWT_PRIVATE_KEY_B64: z.string().optional(),
    JWT_PUBLIC_KEY_B64: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),
    RESEND_FROM_NAME: z.string().min(1).max(120).optional(),
    APP_BASE_URL: z.string().url().optional(),
  })
  .superRefine((env, ctx) => {
    const hasPrivate = env.JWT_PRIVATE_KEY_B64 !== undefined && env.JWT_PRIVATE_KEY_B64 !== '';
    const hasPublic = env.JWT_PUBLIC_KEY_B64 !== undefined && env.JWT_PUBLIC_KEY_B64 !== '';
    if (env.NODE_ENV === 'production' && (!hasPrivate || !hasPublic)) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_PRIVATE_KEY_B64'],
        message: 'JWT keys (JWT_PRIVATE_KEY_B64 and JWT_PUBLIC_KEY_B64) are required in production',
      });
    }
    if (hasPrivate !== hasPublic) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_PRIVATE_KEY_B64'],
        message: 'JWT_PRIVATE_KEY_B64 and JWT_PUBLIC_KEY_B64 must be provided together',
      });
    }
  });

export type NodeEnv = z.infer<typeof envSchema>['NODE_ENV'];
export type LogLevel = z.infer<typeof envSchema>['LOG_LEVEL'];

export interface Env {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly mongoDbUri: string;
  readonly logLevel: LogLevel;
  readonly corsOrigins: readonly string[];
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  readonly accessTokenTtl: number;
  readonly refreshTokenTtl: number;
  readonly jwtPrivateKeyB64?: string;
  readonly jwtPublicKeyB64?: string;
  readonly resendApiKey?: string;
  readonly resendFromEmail?: string;
  readonly resendFromName?: string;
  readonly appBaseUrl?: string;
}

function toEnv(parsed: z.infer<typeof envSchema>): Env {
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    mongoDbUri: parsed.MONGODB_URI,
    logLevel: parsed.LOG_LEVEL,
    corsOrigins: parsed.CORS_ORIGINS,
    jwtIssuer: parsed.JWT_ISSUER,
    jwtAudience: parsed.JWT_AUDIENCE,
    accessTokenTtl: parsed.ACCESS_TOKEN_TTL,
    refreshTokenTtl: parsed.REFRESH_TOKEN_TTL,
    ...(parsed.JWT_PRIVATE_KEY_B64 !== undefined && parsed.JWT_PRIVATE_KEY_B64 !== ''
      ? { jwtPrivateKeyB64: parsed.JWT_PRIVATE_KEY_B64 }
      : {}),
    ...(parsed.JWT_PUBLIC_KEY_B64 !== undefined && parsed.JWT_PUBLIC_KEY_B64 !== ''
      ? { jwtPublicKeyB64: parsed.JWT_PUBLIC_KEY_B64 }
      : {}),
    ...(parsed.RESEND_API_KEY !== undefined && parsed.RESEND_API_KEY !== ''
      ? { resendApiKey: parsed.RESEND_API_KEY }
      : {}),
    ...(parsed.RESEND_FROM_EMAIL !== undefined && parsed.RESEND_FROM_EMAIL !== ''
      ? { resendFromEmail: parsed.RESEND_FROM_EMAIL }
      : {}),
    ...(parsed.RESEND_FROM_NAME !== undefined && parsed.RESEND_FROM_NAME !== ''
      ? { resendFromName: parsed.RESEND_FROM_NAME }
      : {}),
    ...(parsed.APP_BASE_URL !== undefined && parsed.APP_BASE_URL !== ''
      ? { appBaseUrl: parsed.APP_BASE_URL }
      : {}),
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
