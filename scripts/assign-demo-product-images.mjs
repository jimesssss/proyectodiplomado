import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { planProductImages } from './product-image-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = Object.assign({}, ...['apps/api/.env', 'apps/api.env'].map(file => path.join(root, file)).filter(fs.existsSync).map(file => dotenv.parse(fs.readFileSync(file))), process.env);
const base = config.DEMO_API_BASE_URL ?? 'https://erp-sc-api.onrender.com/api/v1';
const web = config.DEMO_IMAGE_WEB_ORIGIN ?? 'https://erp-sc-web.onrender.com';
const apply = process.argv.includes('--apply');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'scripts/demo-product-images.json')));
const credits = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/product-images/credits.json')));
let token;
async function request(route, options = {}) {
  const response = await fetch(base + route, { ...options, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(90000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) throw new Error(`${route}: HTTP ${response.status} ${body?.error?.code ?? ''}`);
  return body;
}
async function list(route) {
  const result = [];
  for (let page = 1; page <= 100; page++) {
    const body = await request(`${route}?page=${page}&limit=100`);
    if (!Array.isArray(body.data)) throw new Error('Unexpected list contract');
    result.push(...body.data);
    if (body.data.length < 100 || (body.meta?.total !== undefined && result.length >= body.meta.total)) return result;
  }
  throw new Error('Pagination limit exceeded');
}
try {
  if (catalog.length !== 100) throw new Error('Expected existing 100-product demo catalog');
  if (!config.DEMO_ADMIN_PASSWORD) throw new Error('Existing DEMO_ADMIN_PASSWORD unavailable; no password changes are performed');
  const login = (await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@erp-sc.com', password: config.DEMO_ADMIN_PASSWORD }) })).data;
  token = login.accessToken;
  if (!token || login.user.email !== 'admin@erp-sc.com') throw new Error('Unexpected authentication identity');
  const organizations = await list('/organizations');
  if (!organizations.some(org => org.name === 'Dulcería ERP-SC' && org.status === 'active')) throw new Error('Expected demo organization not accessible');
  const products = await list('/inventory/products');
  const plan = planProductImages(products, catalog, web);
  if (!plan.every(row => Object.hasOwn(row.product, 'imageUrl'))) throw new Error('Deploy imageUrl support in API before assigning references');
  // Preflight every unique public asset before any write. A SPA fallback is rejected.
  for (const imageUrl of new Set(plan.map(row => row.imageUrl))) {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok || !/^image\/(jpeg|png|webp)(;|$)/.test(response.headers.get('content-type') ?? '')) throw new Error('Static photograph unavailable: ' + new URL(imageUrl).pathname);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const expected = credits.find(row => row.file === path.basename(new URL(imageUrl).pathname));
    if (!expected || crypto.createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error('Published photograph differs from validated static file');
  }
  const stockBefore = JSON.stringify(await list('/inventory/stock'));
  let updated = 0;
  let reused = 0;
  for (const row of plan) {
    // Preserve any existing accessible HTTPS image instead of needlessly replacing it.
    if (!row.changed) { reused++; continue; }
    if (row.currentImageUrl?.startsWith('https://')) {
      const existing = await fetch(row.currentImageUrl, { signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (existing?.ok && /^image\//.test(existing.headers.get('content-type') ?? '')) { await existing.body?.cancel(); reused++; continue; }
      await existing?.body?.cancel();
    }
    if (!apply) continue;
    const result = (await request('/inventory/products/' + row.id, { method: 'PATCH', body: JSON.stringify({ imageUrl: row.imageUrl }) })).data;
    if (result.imageUrl !== row.imageUrl) throw new Error('Image reference was not persisted');
    for (const [field, value] of Object.entries(row.product)) {
      if (field === 'imageUrl' || field === 'updatedAt') continue;
      if (JSON.stringify(result[field]) !== JSON.stringify(value)) throw new Error('Unexpected product change: ' + field);
    }
    updated++;
  }
  if (apply && JSON.stringify(await list('/inventory/stock')) !== stockBefore) throw new Error('Stock changed during image assignment; investigate concurrent writes');
  const after = apply ? await list('/inventory/products') : products;
  const demo = after.filter(product => catalog.some(entry => entry.code === product.code));
  const report = { checkedAt: new Date().toISOString(), mode: apply ? 'apply' : 'dry-run', products: demo.length, updated, reused, withImage: demo.filter(product => product.imageUrl).length, placeholder: demo.filter(product => !product.imageUrl).length, pending: apply ? 0 : plan.length - reused };
  fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(root, '.cache/demo-product-images-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error('Image assignment failed: ' + error.message);
  process.exitCode = 1;
} finally {
  if (token) try { await request('/auth/logout', { method: 'POST', body: '{}' }); } catch { console.error('Image assignment session could not be closed'); }
}
