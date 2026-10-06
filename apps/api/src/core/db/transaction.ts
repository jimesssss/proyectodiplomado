import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose from 'mongoose';
import { ServiceUnavailableError } from '../errors/app-error.js';

// Reuse the outer transaction when services compose; never start an independent nested one.
const scope = new AsyncLocalStorage<boolean>();
mongoose.set('transactionAsyncLocalStorage', true);
export async function atomic<T>(work: () => Promise<T>, required = true): Promise<T> {
  if (scope.getStore()) return work();
  const db = mongoose.connection.db;
  if (!db) throw new ServiceUnavailableError('Database unavailable');
  const topology = await db.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== 'isdbgrid') {
    if (!required) return work();
    throw new ServiceUnavailableError('This operation requires a MongoDB replica set');
  }
  return mongoose.connection.transaction(() => scope.run(true, work));
}
