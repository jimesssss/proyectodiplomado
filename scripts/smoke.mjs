/**
 * Smoke test de arranque (FASE 2):
 * levanta un mongod en memoria, arranca el API compilado, comprueba
 * /api/v1/health y /api/v1/health/ready, y apaga todo.
 * Uso: node scripts/smoke.mjs
 */
import { spawn } from 'node:child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';

const PORT = 4321;
const BASE = `http://127.0.0.1:${PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/v1/health`);
      if (res.ok) return true;
    } catch {
      // aún no levanta
    }
    await wait(250);
  }
  return false;
}

const mongod = await MongoMemoryServer.create();
const server = spawn(process.execPath, ['apps/api/dist/index.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(PORT),
    LOG_LEVEL: 'warn',
    MONGODB_URI: mongod.getUri('erp_smoke'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let exitCode = 1;
try {
  const up = await waitForServer();
  if (!up) throw new Error('server did not start within timeout');

  const health = await fetch(`${BASE}/api/v1/health`);
  const healthBody = await health.json();
  if (health.status !== 200 || healthBody.data?.status !== 'ok') {
    throw new Error(`unexpected health response: ${health.status}`);
  }

  const ready = await fetch(`${BASE}/api/v1/health/ready`);
  const readyBody = await ready.json();
  if (ready.status !== 200 || readyBody.data?.database !== 'up') {
    throw new Error(`unexpected ready response: ${ready.status}`);
  }

  process.stdout.write('SMOKE OK: health=200, ready=200 (database up)\n');
  exitCode = 0;
} catch (error) {
  process.stderr.write(`SMOKE FAILED: ${error instanceof Error ? error.message : error}\n`);
} finally {
  server.kill('SIGTERM');
  await wait(1000);
  if (!server.killed) server.kill('SIGKILL');
  await mongod.stop();
}

process.exit(exitCode);
