import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
async function activate({ environment = 'production', origin = 'https://cubingcompsim.com', previous = 'morning-base-55f2', failTarget = false, missingTarget = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ccs-domain-'));
  try {
    const config = join(directory, 'environment.json');
    await writeFile(config, JSON.stringify({ environment, appUrl: origin, workerName: `ccs-${environment}-frontend` }));
    const script = `
      const calls = [];
      globalThis.fetch = async (url, options) => {
        const method = options.method;
        const path = new URL(url).pathname.split('/workers/')[1];
        const body = options.body ? JSON.parse(options.body) : null;
        calls.push({ path, method, body });
        const failed = (${missingTarget} && path.endsWith('/settings')) || (${failTarget} && method === 'PUT' && body?.service === 'ccs-production-frontend');
        return new Response(JSON.stringify({ success: !failed, errors: failed ? [{ code: 10000 }] : [], result: path === 'domains' && method === 'GET' ? [{ id: 'opaque-domain-id', hostname: new URL(${JSON.stringify(origin)}).hostname, service: ${JSON.stringify(previous)} }] : {} }), { status: failed ? 403 : 200 });
      };
      process.argv[2] = ${JSON.stringify(config)};
      try { await import(${JSON.stringify(new URL('./connect-domain.mjs', import.meta.url).href)}); }
      catch { process.exitCode = 1; }
      console.log('RESULT:' + JSON.stringify(calls));
    `;
    const result = await execute(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-only-token' },
    }).then(r => ({ ...r, code: 0 }), e => ({ stdout: e.stdout, code: e.code }));
    return { code: result.code, calls: JSON.parse(result.stdout.split('RESULT:')[1]) };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
test('production verifies the target before moving the exact live hostname', async () => {
  const result = await activate();
  assert.equal(result.code, 0);
  assert.deepEqual(result.calls.map(c => [c.method, c.path]), [['GET', 'scripts/ccs-production-frontend/settings'], ['GET', 'domains'], ['DELETE', 'domains/opaque-domain-id'], ['PUT', 'domains']]);
  assert.equal(result.calls.at(-1).body.hostname, 'cubingcompsim.com');
});
test('failed production attachment restores the guest mapping', async () => {
  const result = await activate({ failTarget: true });
  assert.equal(result.code, 1);
  assert.deepEqual(result.calls.filter(c => c.method === 'PUT').map(c => c.body.service), ['ccs-production-frontend', 'morning-base-55f2']);
});
test('a missing target never detaches a live hostname', async () => {
  const result = await activate({ missingTarget: true });
  assert.equal(result.code, 1);
  assert.equal(result.calls.some(c => c.method === 'DELETE'), false);
});
test('unexpected mappings and arbitrary origins fail without mutation', async () => {
  for (const config of [{ previous: 'unrelated-worker' }, { origin: 'https://other.example' }]) {
    const result = await activate(config);
    assert.equal(result.code, 1);
    assert.equal(result.calls.some(c => c.method !== 'GET'), false);
  }
});
test('staging keeps its exact origin and independent Worker', async () => {
  const result = await activate({ environment: 'staging', origin: 'https://staging.cubingcompsim.com' });
  assert.equal(result.code, 0);
  assert.equal(result.calls.at(-1).body.hostname, 'staging.cubingcompsim.com');
  assert.equal(result.calls.at(-1).body.service, 'ccs-staging-frontend');
});
