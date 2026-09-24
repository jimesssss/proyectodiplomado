/**
 * Authentication middleware
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@erp/config';
import { IJWTPayload, IRequestContext } from '@erp/types';
import { AuthenticationError } from '../errors/AppError';
import logger from '../security/logger';

/**
 * Extract and verify JWT token
 */
export function authenticateToken(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as IJWTPayload;

    req.context = {
      userId: decoded.userId,
      organizationId: decoded.organizationId,
      email: decoded.email,
      roles: [], // TODO: Load from database based on organizationMembership
    };

    logger.debug({
      userId: decoded.userId,
      organizationId: decoded.organizationId,
    });

    next();
  } catch (error) {
    logger.error('Token verification failed:', error);
    throw new AuthenticationError();
  }
}

/**
 * Create JWT tokens
 */
export function createTokens(
  userId: string,
  organizationId: string,
  email: string,
): {
  accessToken: string;
  refreshToken: string;
} {
  const payload: IJWTPayload = {
    userId,
    organizationId,
    email,
  };

  const accessToken = jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRY,
  });

  const refreshToken = jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRY,
  });

  return { accessToken, refreshToken };
}
