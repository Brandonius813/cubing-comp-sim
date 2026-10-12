import { readFile } from 'node:fs/promises';
import { verifyProviderRedirects, validateAuthProviders } from './auth-providers.mjs';

try {
  const [manifestPath, requested] = process.argv.slice(2);
  if (!manifestPath) throw new Error('Choose an environment manifest.');
  const config = JSON.parse(await readFile(manifestPath, 'utf8'));
  const project = new URL(config.supabaseUrl);
  if (project.protocol !== 'https:' || project.origin !== config.supabaseUrl || !/^[a-z]{20}\.supabase\.co$/.test(project.hostname)) throw new Error('Choose an exact hosted Supabase origin.');
  if (requested) config.authProviders = validateAuthProviders(requested.split(','));
  const key = process.env[config.publicKeyVariable];
  if (!key?.startsWith('sb_publishable_')) throw new Error('Set the manifest publishable-key variable.');
  const providers = await verifyProviderRedirects(config, key);
  console.log(JSON.stringify({ status: 'passed', check: 'initial_oauth_redirect', providers,
    humanConsentVerified: false, frontendManifestChanged: false }));
} catch (error) {
  // Do not print raw responses, locations, state, tokens, or credentials.
  console.error(error instanceof Error && /^(google|wca|WCA|authProviders|Choose|Set)/.test(error.message)
    ? error.message : 'Provider readiness check failed; provider responses were withheld.');
  process.exitCode = 1;
}
