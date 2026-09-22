import { describe, expect, it } from 'vitest';
import { ConfigError } from '../errors/app-error.js';
import { loadConfig } from './env.js';

const base = { MONGODB_URI: 'mongodb://localhost:27017/erp' };

describe('loadConfig', () => {
  it('aplica valores por defecto válidos', () => {
    const env = loadConfig({ ...base });
    expect(env.nodeEnv).toBe('development');
    expect(env.port).toBe(4000);
    expect(env.logLevel).toBe('info');
    expect(env.corsOrigins).toEqual([]);
    expect(env.mongoDbUri).toBe(base.MONGODB_URI);
  });

  it('falla rápido si falta MONGODB_URI', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    try {
      loadConfig({});
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const details = (error as ConfigError).details;
      expect(details).toBeDefined();
      expect(JSON.stringify(details)).toContain('MONGODB_URI');
    }
  });

  it('rechaza LOG_LEVEL inválido', () => {
    expect(() => loadConfig({ ...base, LOG_LEVEL: 'verbose' })).toThrow(ConfigError);
  });

  it('coerza PORT de string a número con rango válido', () => {
    expect(loadConfig({ ...base, PORT: '8080' }).port).toBe(8080);
    expect(() => loadConfig({ ...base, PORT: '0' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, PORT: '99999' })).toThrow(ConfigError);
  });

  it('parsea CORS_ORIGINS separado por comas y lo limpia', () => {
    const env = loadConfig({ ...base, CORS_ORIGINS: 'https://a.com, https://b.com ,' });
    expect(env.corsOrigins).toEqual(['https://a.com', 'https://b.com']);
  });
});
