import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { prepareInitialAccount } from './prepare-initial-account.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [destination, releaseId] = process.argv.slice(2);
if (!destination || !/^\d+-\d+-[a-f0-9]{40}$/.test(releaseId || '')) {
  throw new Error('Usage: node scripts/package-release.mjs <empty-directory> <run-attempt-40char-sha>');
}
const output = resolve(destination);
if (existsSync(output) && readdirSync(output).length) throw new Error('Release directory must be empty.');
if (!existsSync(join(root, 'frontend/dist/index.html'))) throw new Error('Run npm run build first.');
mkdirSync(output, { recursive: true });
// Copy an explicit allowlist. No SQLite files, CSV exports, secrets or test data enter the release.
for (const path of [
  'package.json', 'package-lock.json', 'backend/package.json', 'backend/src',
  'frontend/package.json', 'frontend/dist', 'database/schema.sql', 'database/init.sql',
  'scripts/create-account.mjs',
]) {
  mkdirSync(resolve(output, path, '..'), { recursive: true });
  cpSync(join(root, path), join(output, path), { recursive: true });
}
writeFileSync(join(output, 'RELEASE'), releaseId + '\n');
await prepareInitialAccount(output);
const npmArgs = ['ci', '--omit=dev', '--workspace', 'backend', '--ignore-scripts', '--no-audit', '--no-fund'];
const windows = process.platform === 'win32';
execFileSync(windows ? process.execPath : 'npm', windows
  ? [process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...npmArgs]
  : npmArgs, {
  cwd: output, stdio: 'inherit',
});
console.log(`Production release ready: ${output}`);
