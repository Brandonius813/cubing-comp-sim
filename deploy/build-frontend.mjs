import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { verifyEngineArtifact } from '../scripts/assert-engine.mjs';

const [configPath, verifiedPath] = process.argv.slice(2);
if (!configPath || !verifiedPath) throw new Error('Supply an environment manifest and a verified web artifact directory.');
const config = JSON.parse(await readFile(configPath, 'utf8'));
for (const value of [config.appUrl, config.apiUrl, config.supabaseUrl]) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) throw new Error('Use exact HTTPS origins in the environment manifest.');
}
if (config.schemaVersion !== 1 || !['staging', 'production'].includes(config.environment) || !/^[a-z0-9-]+$/.test(config.workerName)) throw new Error('Invalid deployment manifest.');
const publicKey = process.env[config.publicKeyVariable];
if (!publicKey?.startsWith('sb_publishable_')) throw new Error('Set the environment publishable-key variable. Secret/admin keys are forbidden in frontend builds.');
const engine = resolve(verifiedPath, 'dist/engine');
const manifest = JSON.parse(await readFile(resolve(engine, 'manifest.json'), 'utf8'));
const proof = JSON.parse(await readFile(resolve(engine, 'conformance.json'), 'utf8'));
const lock = JSON.parse(await readFile('engine/upstream-lock.json', 'utf8'));
verifyEngineArtifact({ manifest, proof, lock, bytes: await readFile(resolve(engine, 'tnoodle.js')) });
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.status !== 0) throw new Error('Deployment build command failed.');
}
run('git', ['fetch', '--depth=1', 'origin', manifest.sourceCommit]);
run('git', ['diff', '--quiet', manifest.sourceCommit, 'HEAD', '--', 'engine', 'src/engine', 'scripts/build-engine.mjs', 'scripts/assert-engine.mjs']);
await mkdir('public/engine', { recursive: true });
await cp(engine, 'public/engine', { recursive: true });
const env = { ...process.env, VITE_APP_URL: config.appUrl, VITE_API_URL: config.apiUrl, VITE_SUPABASE_URL: config.supabaseUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: publicKey, VITE_SENTRY_ENVIRONMENT: config.environment };
await rm('dist', { recursive: true, force: true });
await writeFile('public/deployment.json', JSON.stringify({ schemaVersion: 1, environment: config.environment, appUrl: config.appUrl, apiUrl: config.apiUrl,
  sourceCommit: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), engineSha256: manifest.sha256 }) + '\n');
// Environment settings change the UI bundle; the pinned, proven engine is reused.
run('npm', ['run', 'build'], env);
await writeFile('wrangler.release.json', JSON.stringify({ name: config.workerName, compatibility_date: '2026-10-09', workers_dev: true,
  assets: { directory: './dist', not_found_handling: 'single-page-application' } }, null, 2) + '\n');
console.log('Built environment-specific frontend using the verified engine.');
