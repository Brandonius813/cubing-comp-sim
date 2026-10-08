import { Pool } from 'pg';
import { readConfig } from './config.js';
import { PostgresSaves } from './postgres.js';
import { S3SaveObjects } from './objects.js';

export function dependencies() {
  const config = readConfig();
  const pool = new Pool({ connectionString: config.databaseUrl, ssl: config.databaseSsl, max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000, statement_timeout: 15_000, idle_in_transaction_session_timeout: 60_000 });
  // Prevent an idle-client connection failure from crashing the process. This
  // message never includes the connection URL, query or database exception.
  pool.on('error', () => process.stderr.write('{"level":"error","code":"database_connection_failed"}\n'));
  return { config, pool, repository: new PostgresSaves(pool), objects: new S3SaveObjects(config.s3) };
}
