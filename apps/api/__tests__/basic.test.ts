/**
 * Basic API test suite
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import request from 'supertest';

describe('API - Health & Basic Routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it('should return health check', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
  });

  it('should return API docs info', async () => {
    const response = await request(app).get('/api/docs');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('title');
    expect(response.body).toHaveProperty('version');
  });

  it('should return 404 for unknown route', async () => {
    const response = await request(app).get('/api/v1/unknown-route');
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('success', false);
    expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
  });

  it('should include requestId in response', async () => {
    const response = await request(app).get('/health');
    expect(response.body).toHaveProperty('requestId');
    expect(response.body.requestId).toBeTruthy();
  });
});
