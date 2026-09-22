import cors from 'cors';
import express, { type Express, type Router } from 'express';
import helmet from 'helmet';
import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';
import { createErrorHandler } from './error-handler.js';
import { notFoundHandler } from './not-found.js';
import { requestIdMiddleware } from './request-id.js';
import { requestLogger } from './request-logger.js';
import { healthRouter } from './routes/health.js';

export interface AppRoute {
  readonly path: string;
  readonly router: Router;
}

export interface CreateAppOptions {
  readonly logger: Logger;
  readonly env: Env;
  readonly routes?: readonly AppRoute[];
}

/**
 * Construye la app Express. Cadena de seguridad por petición:
 * helmet → CORS (allow-list) → body limit → requestId → logs
 * → rutas → 404 → error handler (envelope).
 */
export function createApp({ logger, env, routes = [] }: CreateAppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  if (env.corsOrigins.length > 0) {
    app.use(cors({ origin: [...env.corsOrigins], credentials: true }));
  }
  app.use(express.json({ limit: '1mb' }));
  app.use(requestIdMiddleware);
  app.use(requestLogger(logger));

  app.use('/api/v1/health', healthRouter);
  for (const route of routes) {
    app.use(route.path, route.router);
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
