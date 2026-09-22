import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Env } from '../../apps/api/src/core/config/env.js';
import {
  connectDatabase,
  disconnectDatabase,
  isDatabaseConnected,
} from '../../apps/api/src/core/db/database.js';
import { createApp } from '../../apps/api/src/core/http/app.js';
import { createLogger } from '../../apps/api/src/core/logging/logger.js';

const logger = createLogger('silent');
const testEnv: Env = {
  nodeEnv: 'test',
  port: 0,
  mongoDbUri: 'mongodb://127.0.0.1:9/unused',
  logLevel: 'silent',
  corsOrigins: [],
};
const app = createApp({ logger, env: testEnv });

let mongod: MongoMemoryServer | undefined;

describe('database foundation con MongoDB real (memory server)', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('erp_test'), logger);
  }, 120_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongod?.stop();
  });

  it('isDatabaseConnected devuelve true tras conectar', async () => {
    expect(await isDatabaseConnected()).toBe(true);
  });

  it('readiness responde 200 con database up', async () => {
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.database).toBe('up');
  });

  it('readiness vuelve a 503 tras desconectar', async () => {
    await disconnectDatabase();
    expect(await isDatabaseConnected()).toBe(false);
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    // reconectar para afterAll limpio
    if (mongod) {
      await connectDatabase(mongod.getUri('erp_test'), logger);
    }
  });
});
