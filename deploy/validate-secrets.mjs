import { readFile } from 'node:fs/promises';
const [manifestPath, envPath] = process.argv.slice(2);
if (!manifestPath || !envPath) throw new Error('Supply an environment manifest and its private server.env file.');
try {
  const c = JSON.parse(await readFile(manifestPath, 'utf8'));
  const values = Object.fromEntries((await readFile(envPath, 'utf8')).split('\n').filter(line => line.includes('=')).map(line => {
    const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)];
  }));
  const expected = { SUPABASE_URL: c.supabaseUrl, R2_BUCKET: c.bucket, APP_ORIGINS: c.appUrl, DATABASE_TLS: 'true', DATABASE_CA_FILE: '/run/secrets/supabase-ca.crt', HOST: '0.0.0.0', PORT: '3001' };
  for (const [key, value] of Object.entries(expected)) if (values[key] !== value) throw new Error(key);
  for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) if (!values[key] || values[key].includes('replace-with')) throw new Error(key);
  if (!values.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) throw new Error('SUPABASE_PUBLISHABLE_KEY');
  const project = new URL(c.supabaseUrl).hostname.split('.')[0];
  const db = new URL(values.DATABASE_URL);
  if (![c.databaseRole, `${c.databaseRole}.${project}`].includes(decodeURIComponent(db.username))) throw new Error('DATABASE_URL role/project');
  if (['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].some(key => db.searchParams.has(key))) throw new Error('DATABASE_URL TLS override');
  const endpoint = new URL(values.R2_ENDPOINT);
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.r2.cloudflarestorage.com') || endpoint.pathname !== '/') throw new Error('R2_ENDPOINT');
  console.log('Private configuration matches the selected environment. No secret values displayed.');
} catch {
  console.error('Private configuration does not match the selected environment. Review secret fields without printing their values.');
  process.exitCode = 1;
}
