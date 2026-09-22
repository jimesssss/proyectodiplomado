import { describe, expect, it } from 'vitest';
import { buildMeta } from './index.js';

describe('buildMeta', () => {
  it('genera meta con requestId y timestamp ISO', () => {
    const meta = buildMeta('req-42');
    expect(meta.requestId).toBe('req-42');
    expect(Number.isNaN(Date.parse(meta.timestamp))).toBe(false);
  });
});
