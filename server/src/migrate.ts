import { readFile, readdir } from 'node:fs/promises';
import { dependencies } from './dependencies.js';
import type { Pool } from 'pg';

let pool: Pool | undefined;
try {
  ({ pool } = dependencies());
  const directory = new URL('../migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter(file => /^\d+_[a-z_]+\.sql$/.test(file)).sort()) {
    await pool.query(await readFile(new URL(file, directory), 'utf8'));
  }
  process.stdout.write('Cloud save migration completed.\n');
} catch {
  process.stderr.write('{"level":"error","code":"migration_failed"}\n');
  process.exitCode = 1;
} finally { await pool?.end(); }
