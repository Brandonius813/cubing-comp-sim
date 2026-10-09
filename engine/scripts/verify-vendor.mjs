import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(await readFile(path.join(root, 'upstream-lock.json'), 'utf8'));
for (const entry of lock.files) {
  const data = await readFile(path.join(root, 'vendor/tnoodle-lib', entry.path));
  const actual = createHash('sha1').update(Buffer.from(`blob ${data.length}\0`)).update(data).digest('hex');
  if (actual !== entry.gitBlobSha) throw new Error(`Vendored source mismatch: ${entry.path}`);
}
console.log(`Verified ${lock.files.length} upstream files at ${lock.commit}.`);
