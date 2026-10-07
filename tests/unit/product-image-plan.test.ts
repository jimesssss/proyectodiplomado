import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { planProductImages } from '../../scripts/product-image-plan.mjs';

describe('demo product photographs', () => {
  const catalog = JSON.parse(fs.readFileSync('scripts/demo-product-images.json', 'utf8'));
  const products = catalog.map((entry: { code: string; name: string }, i: number) => ({ ...entry, id: String(i), price: 18, imageUrl: null }));
  it('covers the 100 existing codes with deduplicated verified static files', () => {
    expect(catalog).toHaveLength(100);
    expect(new Set(catalog.map((entry: { code: string }) => entry.code)).size).toBe(100);
    const credits = JSON.parse(fs.readFileSync('apps/web/public/product-images/credits.json', 'utf8'));
    for (const entry of catalog) {
      const source = credits.find((row: { file: string }) => row.file === entry.file);
      expect(source?.author).toBeTruthy();
      const bytes = fs.readFileSync('apps/web/public/product-images/' + entry.file);
      expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
    }
  });
  it('is idempotent and does not mutate commercial data', () => {
    const before = JSON.stringify(products);
    const plan = planProductImages(products, catalog, 'https://erp-sc-web.onrender.com');
    expect(plan.every((row: { changed: boolean }) => row.changed)).toBe(true);
    const persisted = products.map((product: object, i: number) => ({ ...product, imageUrl: plan[i].imageUrl }));
    expect(planProductImages(persisted, catalog, 'https://erp-sc-web.onrender.com').every((row: { changed: boolean }) => !row.changed)).toBe(true);
    expect(JSON.stringify(products)).toBe(before);
  });
  it('rejects wrong catalog identities, duplicate codes and insecure origins', () => {
    expect(() => planProductImages([{ ...products[0], name: 'Wrong product' }], [catalog[0]], 'https://erp-sc-web.onrender.com')).toThrow();
    expect(() => planProductImages(products, [catalog[0], catalog[0]], 'https://erp-sc-web.onrender.com')).toThrow();
    expect(() => planProductImages(products, catalog, 'http://localhost')).toThrow();
  });
});
