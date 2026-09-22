/**
 * Composition root del API.
 * Fail fast: si la configuración o la base de datos fallan, el proceso no arranca.
 */
import { loadConfig } from './core/config/env.js';
import { connectDatabase, disconnectDatabase } from './core/db/database.js';
import { createApp } from './core/http/app.js';
import { createLogger } from './core/logging/logger.js';

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

  const app = createApp({ logger, env });
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
