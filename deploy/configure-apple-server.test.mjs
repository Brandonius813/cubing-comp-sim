import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';

test('server setup preserves unrelated settings and encryption key across repeat runs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'apple-setup-test-'));
  try {
    const env = join(dir, 'server.env'); const key = join(dir, 'key.p8');
    const pem = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    await writeFile(env, 'EXISTING=value$with#characters\n'); await writeFile(key, pem);
    const run = () => execFileSync(process.execPath, ['deploy/configure-apple-server.mjs', env, key, 'ABCDEFGHIJ', '0123456789'], { encoding: 'utf8' });
    assert.equal(run().includes(pem), false);
    const first = await readFile(env, 'utf8'); run();
    assert.equal(await readFile(env, 'utf8'), first);
    assert.ok(first.startsWith('EXISTING=value$with#characters\n'));
    const secret = first.split('\n').find(line => line.startsWith('APPLE_GRANT_ENCRYPTION_KEY=')).split('=')[1];
    assert.equal(Buffer.from(secret, 'base64').length, 32);
    assert.equal((await stat(env)).mode & 0o777, 0o600);
    await writeFile(key, 'invalid-key');
    assert.throws(run);
    assert.equal(await readFile(env, 'utf8'), first);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
