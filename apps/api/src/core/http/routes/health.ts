import { Router } from 'express';
import { ServiceUnavailableError } from '../../errors/app-error.js';
import { isDatabaseConnected } from '../../db/database.js';
import { successResponse } from '../envelope.js';

export const healthRouter = Router();

/** Liveness: el proceso está vivo (no depende de la base de datos). */
healthRouter.get('/', (req, res) => {
  res.json(
    successResponse(req.requestId, {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
    }),
  );
});

/** Readiness: depende de que la base de datos responda. 503 si no responde. */
healthRouter.get('/ready', async (req, res) => {
  const databaseUp = await isDatabaseConnected();
  if (!databaseUp) {
    throw new ServiceUnavailableError('Database unavailable');
  }
  res.json(
    successResponse(req.requestId, {
      status: 'ready',
      database: 'up',
    }),
  );
});
