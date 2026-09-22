import type { RequestHandler } from 'express';
import { NotFoundError } from '../errors/app-error.js';

/** Handler 404: cualquier ruta no registrada responde envelope NOT_FOUND. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError('Route not found', { path: req.path }));
};
