/**
 * Middleware for request context management
 */
import { Request, Response, NextFunction } from 'express';
import { generateRequestId, formatTimestamp } from '@erp/utils';
import { IRequestContext } from '@erp/types';
import logger from '../security/logger';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      context?: IRequestContext;
    }
  }
}

/**
 * Add request ID and timestamp to all requests
 */
export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = generateRequestId();
  logger.debug({ requestId: req.requestId, path: req.path, method: req.method });
  next();
}

/**
 * Error handling middleware
 */
export function errorHandlerMiddleware(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error({ error: error.message, stack: error.stack });

  // Default to 500
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'Internal server error';

  // Handle custom AppError
  if ('statusCode' in error && 'code' in error) {
    statusCode = (error as any).statusCode;
    code = (error as any).code;
    message = error.message;
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
    timestamp: formatTimestamp(),
    requestId: _req.requestId,
  });
}

/**
 * 404 handler
 */
export function notFoundMiddleware(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
    timestamp: formatTimestamp(),
    requestId: _req.requestId,
  });
}
