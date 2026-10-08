import { dependencies } from './dependencies.js';
import { createApi } from './app.js';
import { createAccountVerifier } from './auth.js';
import { SaveService } from './saves.js';

async function start() {
  const { config, pool, repository, objects } = dependencies();
  const saves = new SaveService(repository, objects, () => process.stderr.write('{"level":"warn","code":"obsolete_save_cleanup_failed"}\n'));
  const app = await createApi({ saves, verifyAccount: createAccountVerifier(config.supabaseUrl, config.supabasePublicKey), origins: config.origins, release: config.release, logLevel: config.logLevel });
  app.addHook('onClose', async () => { await pool.end(); });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { void app.close(); });
  try { await app.listen({ port: config.port, host: config.host }); }
  catch { await app.close(); throw new Error('startup_failed'); }
}
try { await start(); }
catch { process.stderr.write('{"level":"error","code":"startup_failed","action":"Check required server environment settings"}\n'); process.exitCode = 1; }
