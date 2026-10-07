import { cp, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function run(script, args, cwd) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: path.join(root, cwd), stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('node_modules/expo/bin/cli', ['export', '--platform', 'web', '--output-dir', 'dist'], 'apps/mobile');
run('node_modules/typescript/bin/tsc', [], 'apps/web');
run('node_modules/vite/bin/vite.js', ['build'], 'apps/web');
// Preserve the existing verification page alongside the Expo application.
const output = path.join(root, 'apps/mobile/dist');
await cp(path.join(root, 'apps/web/dist/assets'), path.join(output, 'assets'), { recursive: true });
await copyFile(path.join(root, 'apps/web/dist/index.html'), path.join(output, 'verify-email.html'));
await cp(path.join(root, 'apps/web/public/product-images'), path.join(output, 'product-images'), { recursive: true });
console.log('ERP-SC web: Expo application and existing email verification page exported.');
