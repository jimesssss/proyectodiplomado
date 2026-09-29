/**
 * Environment configuration with validation
 */
import { z } from 'zod';
import 'dotenv/config';
declare const ConfigSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "production", "test"]>>;
    PORT: z.ZodDefault<z.ZodNumber>;
    MONGODB_URI: z.ZodString;
    JWT_ACCESS_SECRET: z.ZodString;
    JWT_REFRESH_SECRET: z.ZodString;
    JWT_ACCESS_EXPIRY: z.ZodDefault<z.ZodString>;
    JWT_REFRESH_EXPIRY: z.ZodDefault<z.ZodString>;
    CORS_ORIGINS: z.ZodDefault<z.ZodString>;
    LOG_LEVEL: z.ZodDefault<z.ZodEnum<["trace", "debug", "info", "warn", "error", "fatal"]>>;
    API_DOCS_ENABLED: z.ZodDefault<z.ZodEffects<z.ZodEnum<["true", "false"]>, boolean, "true" | "false">>;
    API_DOCS_PATH: z.ZodDefault<z.ZodString>;
    RATE_LIMIT_WINDOW_MS: z.ZodDefault<z.ZodNumber>;
    RATE_LIMIT_MAX_REQUESTS: z.ZodDefault<z.ZodNumber>;
    TIMEZONE: z.ZodDefault<z.ZodString>;
    REDIS_URL: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    NODE_ENV: "development" | "production" | "test";
    PORT: number;
    MONGODB_URI: string;
    JWT_ACCESS_SECRET: string;
    JWT_REFRESH_SECRET: string;
    JWT_ACCESS_EXPIRY: string;
    JWT_REFRESH_EXPIRY: string;
    CORS_ORIGINS: string;
    LOG_LEVEL: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
    API_DOCS_ENABLED: boolean;
    API_DOCS_PATH: string;
    RATE_LIMIT_WINDOW_MS: number;
    RATE_LIMIT_MAX_REQUESTS: number;
    TIMEZONE: string;
    REDIS_URL?: string | undefined;
}, {
    MONGODB_URI: string;
    JWT_ACCESS_SECRET: string;
    JWT_REFRESH_SECRET: string;
    NODE_ENV?: "development" | "production" | "test" | undefined;
    PORT?: number | undefined;
    JWT_ACCESS_EXPIRY?: string | undefined;
    JWT_REFRESH_EXPIRY?: string | undefined;
    CORS_ORIGINS?: string | undefined;
    LOG_LEVEL?: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | undefined;
    API_DOCS_ENABLED?: "true" | "false" | undefined;
    API_DOCS_PATH?: string | undefined;
    RATE_LIMIT_WINDOW_MS?: number | undefined;
    RATE_LIMIT_MAX_REQUESTS?: number | undefined;
    TIMEZONE?: string | undefined;
    REDIS_URL?: string | undefined;
}>;
export type Config = z.infer<typeof ConfigSchema>;
export declare function loadConfig(): Config;
export declare const config: {
    NODE_ENV: "development" | "production" | "test";
    PORT: number;
    MONGODB_URI: string;
    JWT_ACCESS_SECRET: string;
    JWT_REFRESH_SECRET: string;
    JWT_ACCESS_EXPIRY: string;
    JWT_REFRESH_EXPIRY: string;
    CORS_ORIGINS: string;
    LOG_LEVEL: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
    API_DOCS_ENABLED: boolean;
    API_DOCS_PATH: string;
    RATE_LIMIT_WINDOW_MS: number;
    RATE_LIMIT_MAX_REQUESTS: number;
    TIMEZONE: string;
    REDIS_URL?: string | undefined;
};
export {};
//# sourceMappingURL=index.d.ts.map