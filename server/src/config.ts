import { readFileSync } from 'node:fs';

export interface ServerConfig {
  port: number; host: string; origins: string[]; release: string; logLevel: string;
  supabaseUrl: string; supabasePublicKey: string; supabaseServiceRoleKey?: string; databaseUrl: string;
  databaseSsl: false | { rejectUnauthorized: true; ca?: string };
  s3: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value || value.includes('replace-with') || value.includes('your-project') || value.includes('your-account-id')) {
    throw new Error(`Missing server configuration: ${name}`);
  }
  return value;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const supabaseUrl = required(env, 'SUPABASE_URL').replace(/\/$/, '');
  const url = new URL(supabaseUrl);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Supabase requires HTTPS');
  const origins = required(env, 'APP_ORIGINS').split(',').map(value => new URL(value.trim()).origin);
  if (origins.includes('*')) throw new Error('APP_ORIGINS must contain explicit origins');
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const databaseUrl = required(env, 'DATABASE_URL');
  const database = new URL(databaseUrl);
  if (['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].some(key => database.searchParams.has(key))) throw new Error('Set database TLS using DATABASE_TLS and DATABASE_CA_FILE, not URL parameters');
  const dbHost = database.hostname;
  if (env.DATABASE_TLS === 'false' && !['localhost', '127.0.0.1', 'postgres'].includes(dbHost)) throw new Error('Remote database connections require TLS');
  return {
    port, host: env.HOST || '127.0.0.1', origins, release: env.RELEASE || 'development', logLevel: env.LOG_LEVEL || 'info',
    supabaseUrl, supabasePublicKey: required(env, 'SUPABASE_PUBLISHABLE_KEY'), databaseUrl,
    ...(env.SUPABASE_SERVICE_ROLE_KEY && !env.SUPABASE_SERVICE_ROLE_KEY.includes('replace-with') ? { supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY } : {}),
    databaseSsl: env.DATABASE_TLS === 'false' ? false : { rejectUnauthorized: true, ...(env.DATABASE_CA_FILE ? { ca: readFileSync(env.DATABASE_CA_FILE, 'utf8') } : {}) },
    s3: { endpoint: required(env, 'R2_ENDPOINT'), bucket: required(env, 'R2_BUCKET'), accessKeyId: required(env, 'R2_ACCESS_KEY_ID'), secretAccessKey: required(env, 'R2_SECRET_ACCESS_KEY'), forcePathStyle: env.R2_FORCE_PATH_STYLE === 'true' },
  };
}
