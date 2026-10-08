import { readFile } from 'node:fs/promises';
import { dependencies } from './dependencies.js';
import type { Pool } from 'pg';

let pool: Pool | undefined;
try {
  ({ pool } = dependencies());
  const sql = await readFile(new URL('../migrations/001_cloud_saves.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  process.stdout.write('Cloud save migration completed.\n');
} catch {
  process.stderr.write('{"level":"error","code":"migration_failed"}\n');
  process.exitCode = 1;
} finally { await pool?.end(); }
