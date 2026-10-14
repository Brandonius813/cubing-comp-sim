// Operator-only cloud-save backup. Never mount its key/output into the public app.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const MAGIC = Buffer.from('CCSBK001');
const MAX_BYTES = 100 * 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function seal(bytes, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(MAGIC);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), encrypted]);
}
export function unseal(bytes, key) {
  if (bytes.length < 36 || !bytes.subarray(0, 8).equals(MAGIC)) throw new Error('Invalid backup format');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(8, 20));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(bytes.subarray(20, 36));
  return Buffer.concat([decipher.update(bytes.subarray(36)), decipher.final()]);
}
async function keyFrom(path) {
  const info = await stat(path);
  if (!info.isFile() || (info.mode & 0o077)) throw new Error('Key must be a private regular file');
  const key = await readFile(path);
  if (key.length !== 32) throw new Error('Key must be 32 bytes');
  return key;
}
export function verifySave(row, compressed) {
  const raw = gunzipSync(compressed, { maxOutputLength: MAX_BYTES });
  if (raw.length !== row.bytes || digest(raw) !== row.sha256) throw new Error('Snapshot integrity mismatch');
  const snapshot = JSON.parse(raw);
  if (snapshot.app !== 'cubing-comp-sim' || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.rounds)) throw new Error('Unsupported snapshot');
  if (snapshot.rounds.length !== row.round_count || snapshot.rounds.reduce((n, r) => n + r.attempts.length, 0) !== row.attempt_count) throw new Error('Snapshot counts mismatch');
  return snapshot;
}
async function poolFromEnvironment() {
  const { Pool } = await import('pg');
  const url = process.env.DATABASE_URL;
  if (!url || ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].some(key => new URL(url).searchParams.has(key))) throw new Error('Explicit verified database TLS required');
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: true, ...(process.env.DATABASE_CA_FILE ? { ca: await readFile(process.env.DATABASE_CA_FILE) } : {}) },
    statement_timeout: 15000, idle_in_transaction_session_timeout: 60000 });
  pool.on('error', () => {});
  return pool;
}
async function backup(keyPath, output) {
  if (process.env.R2_BUCKET !== 'cubing-comp-sim-saves-production') throw new Error('Exact production bucket required');
  const key = await keyFrom(keyPath);
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT,
    forcePathStyle: process.env.R2_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  const pool = await poolFromEnvironment();
  let db;
  const partial = output + '.partial';
  let created = false;
  try {
    // An existing destination or unfinished backup is never overwritten.
    await mkdir(partial, { mode: 0o700 }); created = true;
    try { await stat(output); throw new Error('Destination already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    db = await pool.connect();
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await db.query("SET LOCAL lock_timeout = '5s'");
    // Prevent a replacement/deletion from removing a referenced immutable object.
    // Acquire all locks before the snapshot query. Timeout fails the backup safely.
    await db.query('LOCK TABLE account_deletions, cloud_saves, cloud_upload_receipts IN SHARE MODE');
    const started = Date.now();
    const deletions = (await db.query('SELECT * FROM account_deletions ORDER BY user_id')).rows;
    const saves = (await db.query('SELECT s.* FROM cloud_saves s WHERE NOT EXISTS (SELECT 1 FROM account_deletions d WHERE d.user_id=s.user_id) ORDER BY user_id')).rows;
    const receipts = (await db.query('SELECT r.* FROM cloud_upload_receipts r WHERE NOT EXISTS (SELECT 1 FROM account_deletions d WHERE d.user_id=r.user_id) ORDER BY user_id,operation_id LIMIT 10001')).rows;
    if (receipts.length > 10000) throw new Error('Small-deployment receipt limit exceeded');
    if (saves.length > 1000 || saves.reduce((n, s) => n + s.bytes, 0) > MAX_BYTES) throw new Error('Small-deployment backup limit exceeded');
    for (let i = 0; i < saves.length; i++) {
      if (Date.now() - started > 45000) throw new Error('Backup lock budget exhausted');
      const save = saves[i];
      const result = await client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: save.object_key }), { abortSignal: AbortSignal.timeout(10000) });
      if (!result.Body || result.ContentLength > MAX_BYTES) throw new Error('Invalid object size');
      const compressed = Buffer.from(await result.Body.transformToByteArray());
      verifySave(save, compressed);
      save.backup_file = `${i}.ccsbk`;
      await writeFile(join(partial, save.backup_file), seal(compressed, key), { flag: 'wx', mode: 0o600 });
    }
    const manifest = { format: 1, createdAt: new Date().toISOString(), sourceBucket: process.env.R2_BUCKET,
      release: process.env.RELEASE ?? 'unknown', scope: 'cloud-save-data-only', saves, receipts, deletions };
    await writeFile(join(partial, 'manifest.ccsbk'), seal(Buffer.from(JSON.stringify(manifest)), key), { flag: 'wx', mode: 0o600 });
    await db.query('COMMIT');
    await rename(partial, output); created = false;
    return { code: 'cloud_backup_complete', saves: saves.length, attempts: saves.reduce((n, s) => n + s.attempt_count, 0), encrypted: true, authBackup: false };
  } finally {
    if (db) { await db.query('ROLLBACK').catch(() => {}); db.release(); }
    await pool.end(); client.destroy();
    if (created) await rm(partial, { recursive: true, force: true });
  }
}
export async function restore(keyPath, input, output) {
  const key = await keyFrom(keyPath);
  const manifest = JSON.parse(unseal(await readFile(join(input, 'manifest.ccsbk')), key));
  if (manifest.format !== 1 || manifest.scope !== 'cloud-save-data-only' || !Array.isArray(manifest.saves) || !Array.isArray(manifest.deletions)) throw new Error('Invalid manifest');
  const blocked = new Set(manifest.deletions.map(row => row.user_id));
  await mkdir(output, { mode: 0o700 });
  try {
    for (const [i, save] of manifest.saves.entries()) {
      if (save.backup_file !== `${i}.ccsbk` || blocked.has(save.user_id)) throw new Error('Unsafe backup reference');
      const compressed = unseal(await readFile(join(input, save.backup_file)), key);
      const snapshot = verifySave(save, compressed);
      await writeFile(join(output, `${i}.json.gz`), compressed, { flag: 'wx', mode: 0o600 });
      await writeFile(join(output, `${i}.json`), JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
    }
    await writeFile(join(output, 'metadata.json'), JSON.stringify(manifest), { flag: 'wx', mode: 0o600 });
    return manifest;
  } catch (error) { await rm(output, { recursive: true, force: true }); throw error; }
}
async function drill(keyPath, input, output) {
  const manifest = await restore(keyPath, input, output);
  const pool = await poolFromEnvironment();
  let db;
  try {
    db = await pool.connect();
    await db.query('BEGIN');
    // Only a connection-private temporary table is created; production is never written.
    await db.query('CREATE TEMP TABLE ccs_restore_drill (user_id uuid PRIMARY KEY, revision integer NOT NULL, object_key text UNIQUE NOT NULL, saved_at timestamptz NOT NULL, round_count integer NOT NULL, attempt_count integer NOT NULL, bytes integer NOT NULL, sha256 text NOT NULL) ON COMMIT DROP');
    for (const save of manifest.saves) {
      await db.query('INSERT INTO ccs_restore_drill VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [save.user_id, save.revision, save.object_key, save.saved_at, save.round_count, save.attempt_count, save.bytes, save.sha256]);
    }
    const restored = (await db.query('SELECT * FROM ccs_restore_drill ORDER BY user_id')).rows;
    if (restored.length !== manifest.saves.length) throw new Error('Restore row mismatch');
    for (const row of restored) {
      const index = manifest.saves.findIndex(save => save.user_id === row.user_id);
      verifySave(row, await readFile(join(output, `${index}.json.gz`)));
    }
    await db.query('ROLLBACK');
    return { code: 'cloud_restore_drill_complete', saves: restored.length, attempts: restored.reduce((n, s) => n + s.attempt_count, 0), productionWrites: 0, authRestore: false };
  } finally { if (db) { await db.query('ROLLBACK').catch(() => {}); db.release(); } await pool.end(); }
}
async function main() {
  process.umask(0o077);
  const [command, keyPath, input, output] = process.argv.slice(2);
  if (command === 'keygen' && keyPath && !input) {
    await writeFile(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
    return { code: 'backup_key_created' };
  }
  if (command === 'backup' && keyPath && input && !output) return backup(keyPath, resolve(input));
  if (command === 'restore' && keyPath && input && output) {
    const manifest = await restore(keyPath, resolve(input), resolve(output));
    return { code: 'cloud_restore_complete', saves: manifest.saves.length, authRestore: false };
  }
  if (command === 'drill' && keyPath && input && output) return drill(keyPath, resolve(input), resolve(output));
  throw new Error('Usage: keygen KEY | backup KEY NEW_DIR | restore/drill KEY BACKUP NEW_DIR');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await main())); }
  catch { console.error('{"code":"backup_operation_failed"}'); process.exitCode = 1; }
}
