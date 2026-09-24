/**
 * Logger configuration using Pino
 */
import pino from 'pino';
import { config } from '@erp/config';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
