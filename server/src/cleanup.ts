import { dependencies } from './dependencies.js';
import { SaveService } from './saves.js';
import type { Pool } from 'pg';

let pool: Pool | undefined;
try {
  const services = dependencies();
  pool = services.pool;
  const { repository, objects } = services;
  const removed = await new SaveService(repository, objects).cleanup();
  process.stdout.write(JSON.stringify({ code: 'save_cleanup_completed', removed }) + '\n');
} catch {
  process.stderr.write('{"level":"error","code":"save_cleanup_failed"}\n');
  process.exitCode = 1;
} finally { await pool?.end(); }
