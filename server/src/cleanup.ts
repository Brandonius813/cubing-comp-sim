import { dependencies } from './dependencies.js';
import { SaveService } from './saves.js';
import type { Pool } from 'pg';

let pool: Pool | undefined;
try {
  const services = dependencies();
  pool = services.pool;
  const { repository, objects, deletions, deletionRepository } = services;
  if (!deletions && (await deletionRepository.pending()).length) throw new Error('Deletion key missing for pending jobs');
  const accounts = deletions ? await deletions.retryPending() : null;
  const removed = process.argv.includes('--accounts-only') ? 0 : await new SaveService(repository, objects).cleanup();
  process.stdout.write(JSON.stringify({ code: 'save_cleanup_completed', removed, accounts }) + '\n');
  if (accounts?.pending) process.exitCode = 1;
} catch {
  process.stderr.write('{"level":"error","code":"save_cleanup_failed"}\n');
  process.exitCode = 1;
} finally { await pool?.end(); }
