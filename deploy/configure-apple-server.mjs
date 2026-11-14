import { readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createPrivateKey, randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';

// Run on the API host. Arguments are paths and public IDs, never key contents.
const [envPath, p8Path, teamId, keyId] = process.argv.slice(2);
try {
  if (!envPath || !p8Path || !/^[A-Z0-9]{10}$/.test(teamId ?? '') || !/^[A-Z0-9]{10}$/.test(keyId ?? ''))
    throw new Error('usage');
  const destination = resolve(envPath);
  const metadata = await stat(destination);
  if (!metadata.isFile()) throw new Error('file');
  const original = await readFile(destination, 'utf8');
  const pem = (await readFile(resolve(p8Path), 'utf8')).trim();
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('key');
  const previous = original.split(/\r?\n/).find(line => line.startsWith('APPLE_GRANT_ENCRYPTION_KEY='))?.slice('APPLE_GRANT_ENCRYPTION_KEY='.length);
  if (previous && Buffer.from(previous, 'base64').length !== 32) throw new Error('encryption');
  const values = {
    APPLE_TEAM_ID: teamId, APPLE_KEY_ID: keyId,
    APPLE_PRIVATE_KEY: pem.replace(/\r?\n/g, '\\n'),
    APPLE_CLIENT_IDS: 'com.cubingcompsim.web,com.cubingcompsim.app',
    APPLE_GRANT_ENCRYPTION_KEY: previous ?? randomBytes(32).toString('base64'),
  };
  const lines = original.split(/\r?\n/).filter(line => !Object.keys(values).some(name => line.startsWith(name + '=')));
  while (lines.at(-1) === '') lines.pop();
  const next = lines.concat(Object.entries(values).map(([name, value]) => name + '=' + value)).join('\n') + '\n';
  const temp = resolve(dirname(destination), '.apple-env-' + randomBytes(8).toString('hex'));
  await writeFile(temp, next, { mode: 0o600, flag: 'wx' });
  await rename(temp, destination);
  console.log('Apple server configuration saved. Existing grant encryption key preserved when present. No services restarted.');
} catch {
  console.error('Apple setup failed. Usage: node deploy/configure-apple-server.mjs SERVER_ENV P8_FILE TEAM_ID KEY_ID. Check file access and key format. No credentials printed.');
  process.exitCode = 1;
}
