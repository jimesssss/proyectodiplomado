import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../apps/api/src/core/config/env.js';
import { createApp } from '../../apps/api/src/core/http/app.js';
import { createLogger } from '../../apps/api/src/core/logging/logger.js';

const testEnv: Env = {
  nodeEnv: 'test',
  port: 0,
  mongoDbUri: 'mongodb://127.0.0.1:9/unused',
  logLevel: 'silent',
  corsOrigins: [],
};

const app = createApp({ logger: createLogger('silent'), env: testEnv });

describe('GET /api/v1/health (liveness)', () => {
  it('responde 200 con envelope de éxito', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.error).toBeNull();
    expect(res.body.meta.requestId).toBeTruthy();
    expect(res.body.meta.timestamp).toBeTruthy();
    expect(res.headers['x-request-id']).toBe(res.body.meta.requestId);
  });
});

describe('GET /api/v1/health/ready (readiness sin base de datos)', () => {
  it('responde 503 SERVICE_UNAVAILABLE si la DB no responde', async () => {
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(Object.keys(res.body.meta)).toEqual(['requestId']);
  });
});

describe('rutas desconocidas', () => {
  it('responde 404 con envelope NOT_FOUND y details.path', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.details.path).toBe('/api/v1/nope');
    expect(JSON.stringify(res.body)).not.toContain('stack');
  });
});

describe('JSON malformado', () => {
  it('responde 400 VALIDATION_ERROR sin tumbar el servidor', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Invalid JSON body');
  });

  it('el servidor sigue vivo después del body malformado', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
  });
});
