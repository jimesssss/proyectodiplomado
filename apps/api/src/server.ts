/**
 * Server startup
 */
import { createApp } from './app';
import { config } from '@erp/config';
import { connectDatabase, disconnectDatabase } from './core/database/connection';
import logger from './core/security/logger';

async function startServer(): Promise<void> {
  try {
    logger.info('Starting ERP API server...');

    // Connect to database
    await connectDatabase();

    // Create and start Express app
    const app = createApp();
    const server = app.listen(config.PORT, () => {
      logger.info(`Server running on port ${config.PORT} | Environment: ${config.NODE_ENV}`);
      logger.info(`API Docs: http://localhost:${config.PORT}${config.API_DOCS_PATH}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(async () => {
        logger.info('HTTP server closed');
        await disconnectDatabase();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT signal received: closing HTTP server');
      server.close(async () => {
        logger.info('HTTP server closed');
        await disconnectDatabase();
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
