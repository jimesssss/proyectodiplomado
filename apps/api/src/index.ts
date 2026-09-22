/**
 * Composition root del API.
 * Fail fast: si la configuración o la base de datos fallan, el proceso no arranca.
 */
import { resolveJwtKeys } from './core/auth/keys.js';
import { createJwtService } from './core/auth/jwt.js';
import { loadConfig } from './core/config/env.js';
import { connectDatabase, disconnectDatabase } from './core/db/database.js';
import { createApp } from './core/http/app.js';
import { createLogger } from './core/logging/logger.js';
import { createSessionChecker, createAuthRouter } from './modules/identity/index.js';
import { createTenantRouter, isTenantActive } from './modules/tenancy/index.js';
import {
  createOrgRouter,
  ORG_KINDS_BY_PATH,
  ORG_ROUTE_PATHS,
} from './modules/organization/index.js';

async function bootstrap(): Promise<void> {
  let env;
  try {
    env = loadConfig();
  } catch (error) {
    const bootLogger = createLogger('info');
    bootLogger.fatal({ err: error }, 'invalid configuration — aborting startup');
    process.exit(1);
  }

  const logger = createLogger(env.logLevel);

  try {
    await connectDatabase(env.mongoDbUri, logger);
  } catch (error) {
    logger.fatal({ err: error }, 'database connection failed — aborting startup');
    process.exit(1);
  }

  const keys = resolveJwtKeys(
    {
      ...(env.jwtPrivateKeyB64 !== undefined ? { privateKeyB64: env.jwtPrivateKeyB64 } : {}),
      ...(env.jwtPublicKeyB64 !== undefined ? { publicKeyB64: env.jwtPublicKeyB64 } : {}),
    },
    logger,
  );
  const jwt = createJwtService({
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
    accessTtlSeconds: env.accessTokenTtl,
  });

  const app = createApp({
    logger,
    env,
    routes: [
      {
        path: '/api/v1/auth',
        router: createAuthRouter({
          jwt,
          accessTokenTtl: env.accessTokenTtl,
          refreshTokenTtl: env.refreshTokenTtl,
          isSessionActive: createSessionChecker(),
          isTenantActive,
        }),
      },
      {
        path: '/api/v1/tenants',
        router: createTenantRouter({ jwt, isSessionActive: createSessionChecker() }),
      },
      ...ORG_KINDS_BY_PATH.map((kind) => ({
        path: `/api/v1/${ORG_ROUTE_PATHS[kind]}`,
        router: createOrgRouter({ jwt, isSessionActive: createSessionChecker() }, kind),
      })),
    ],
  });

  const server = app.listen(env.port, () => {
    logger.info({ port: env.port, nodeEnv: env.nodeEnv }, 'api listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutdown requested');
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    server.close(() => {
      void disconnectDatabase().then(
        () => process.exit(0),
        (error: unknown) => {
          logger.error({ err: error }, 'error during database disconnect');
          process.exit(1);
        },
      );
    });
    server.closeAllConnections();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void bootstrap();
