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
  corsOrigins: ['https://allowed.example.com'],
};
const app = createApp({ logger: createLogger('silent'), env: testEnv });

describe('security headers', () => {
  it('helmet aplica cabeceras de seguridad', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBeTruthy();
    expect(res.headers['x-frame-options'] ?? res.headers['content-security-policy']).toBeTruthy();
  });

  it('no expone x-powered-by', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS allow-list', () => {
  it('no habilita CORS para orígenes no listados', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('permite el origen configurado', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://allowed.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('https://allowed.example.com');
  });
});

describe('request id seguro', () => {
  it('acepta cabecera segura del cliente', async () => {
    const res = await request(app).get('/api/v1/health').set('X-Request-Id', 'trace-abc-123');
    expect(res.headers['x-request-id']).toBe('trace-abc-123');
  });

  it('sustituye cabeceras maliciosas (no las refleja)', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', 'bad value with spaces');
    expect(res.headers['x-request-id']).not.toBe('bad value with spaces');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('no fuga de información interna', () => {
  it('los 404/400/500 no contienen stack traces ni detalle interno', async () => {
    const notFound = await request(app).get('/api/v1/does-not-exist');
    expect(JSON.stringify(notFound.body)).not.toMatch(/stack|at |\.ts:/);

    const malformed = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('}');
    expect(malformed.status).toBe(400);
    expect(JSON.stringify(malformed.body)).not.toMatch(/stack|node_modules/);
  });
});

describe('rate de respuestas: límite de body', () => {
  it('rechaza payloads grandes con 413 y envelope', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(2 * 1024 * 1024) });
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(big);
    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
