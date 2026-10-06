import mongoose from 'mongoose';
import type { Logger } from '../logging/logger.js';

let loggerRef: Logger | undefined;

/** Abre la conexión global de MongoDB. Falla rápido si no conecta. */
export async function connectDatabase(uri: string, logger: Logger): Promise<void> {
  loggerRef = logger;
  mongoose.connection.on('error', (error) => {
    loggerRef?.error({ err: error }, 'database connection error');
  });
  mongoose.connection.on('disconnected', () => {
    loggerRef?.warn('database disconnected');
  });
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  logger.info('database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  loggerRef?.info('database disconnected');
}

/** Ping real a la base: true solo si la conexión responde. */
export async function isDatabaseConnected(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) {
    return false;
  }
  const db = mongoose.connection.db;
  if (db === undefined || db === null) {
    return false;
  }
  try {
    await db.admin().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
