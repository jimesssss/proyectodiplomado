/**
 * Express application setup
 */
import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from '@erp/config';
import { requestIdMiddleware, errorHandlerMiddleware, notFoundMiddleware } from './core/middleware/errorHandler';
import logger from './core/security/logger';

export function createApp(): Express {
  const app = express();

  // Security
  app.use(helmet());
  app.use(cors({
    origin: config.CORS_ORIGINS.split(','),
    credentials: true,
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Request tracking
  app.use(requestIdMiddleware);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), requestId: req.requestId });
  });

  // API Documentation
  if (config.API_DOCS_ENABLED) {
    app.get(config.API_DOCS_PATH, (_req, res) => {
      res.json({
        title: 'ERP API',
        version: '0.0.1',
        description: 'Modular ERP system API',
        docs_url: `${config.API_DOCS_PATH}/ui`,
      });
    });
  }

  // TODO: Register modules routes here
  // app.use('/api/v1/auth', authRoutes);
  // app.use('/api/v1/organizations', organizationRoutes);
  // app.use('/api/v1/users', userRoutes);

  // 404 handler (must be after all routes)
  app.use(notFoundMiddleware);

  // Error handler (must be last)
  app.use(errorHandlerMiddleware);

  logger.info(`Express app configured (environment: ${config.NODE_ENV})`);

  return app;
}
