/**
 * Environment configuration with validation
 */
import { z } from 'zod';
import 'dotenv/config';
const ConfigSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    MONGODB_URI: z.string().url('Invalid MongoDB URI'),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_EXPIRY: z.string().default('15m'),
    JWT_REFRESH_EXPIRY: z.string().default('7d'),
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('debug'),
    API_DOCS_ENABLED: z.enum(['true', 'false']).transform((v) => v === 'true').default('true'),
    API_DOCS_PATH: z.string().default('/api/docs'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
    TIMEZONE: z.string().default('UTC'),
    REDIS_URL: z.string().optional(),
});
export function loadConfig() {
    const config = ConfigSchema.parse(process.env);
    return config;
}
export const config = loadConfig();
//# sourceMappingURL=index.js.map