import { readFile, readdir } from 'node:fs/promises';
import { dependencies } from './dependencies.js';
import type { Pool, PoolClient } from 'pg';

let pool: Pool | undefined;
let client: PoolClient | undefined;
try {
  ({ pool } = dependencies());
  client = await pool.connect();
  // Hosted poolers may ignore startup search_path options. Keep schema selection
  // and every migration on the same checked-out connection.
  const schema = process.env.MIGRATION_SCHEMA?.trim();
  if (schema) {
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Invalid migration schema');
    await client.query('SELECT set_config($1, $2, false)', ['search_path', `${schema},pg_catalog`]);
    if ((await client.query('SELECT current_schema() AS schema')).rows[0].schema !== schema) throw new Error('Migration schema does not exist');
  }
  const directory = new URL('../migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter(file => /^\d+_[a-z_]+\.sql$/.test(file)).sort()) {
    await client.query(await readFile(new URL(file, directory), 'utf8'));
  }
  process.stdout.write('Cloud save migration completed.\n');
} catch {
  process.stderr.write('{"level":"error","code":"migration_failed"}\n');
  process.exitCode = 1;
} finally { client?.release(); await pool?.end(); }
