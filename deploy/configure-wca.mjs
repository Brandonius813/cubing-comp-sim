import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Private JSON input stays outside this public checkout, never in arguments.
// Default mode validates inputs and prints public registration details only.
const [manifestPath, privatePath, mode] = process.argv.slice(2);
if (!manifestPath || !privatePath || (mode !== undefined && mode !== '--apply')) {
  throw new Error('Usage: node deploy/configure-wca.mjs ENVIRONMENT_JSON PRIVATE_JSON [--apply]');
}
let stage = 'private configuration';
try {
  const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const privateFile = await realpath(privatePath);
  if (privateFile === checkout || privateFile.startsWith(checkout + sep)) throw new Error('Private configuration must stay outside the public checkout.');
  if (((await stat(privateFile)).mode & 0o777) !== 0o600 || ((await stat(dirname(privateFile))).mode & 0o777) !== 0o700) {
    throw new Error('Private configuration requires file mode 600 and parent directory mode 700.');
  }
  const config = JSON.parse(await readFile(manifestPath, 'utf8'));
  const secret = JSON.parse(await readFile(privateFile, 'utf8'));
  const project = new URL(config.supabaseUrl);
  if (project.protocol !== 'https:' || !/^[a-z]{20}\.supabase\.co$/.test(project.hostname) || project.origin !== config.supabaseUrl || !['staging', 'production'].includes(config.environment)) {
    throw new Error('Choose an exact hosted Supabase project URL in an environment manifest.');
  }
  if (secret.projectRef !== project.hostname.split('.')[0]) throw new Error('Private credentials belong to another project.');
  for (const key of ['supabaseAdminKey', 'wcaClientId', 'wcaClientSecret']) {
    if (typeof secret[key] !== 'string' || !secret[key].trim() || /[\r\n]/.test(secret[key])) throw new Error('Private credential fields are missing or invalid.');
  }
  if (secret.supabaseAdminKey.startsWith('sb_publishable_')) throw new Error('A server-only Supabase admin key is required.');
  const provider = {
    provider_type: 'oidc', identifier: 'custom:wca', name: 'World Cube Association',
    issuer: 'https://www.worldcubeassociation.org', scopes: ['public', 'openid', 'profile', 'email'],
    client_id: secret.wcaClientId, client_secret: secret.wcaClientSecret,
    enabled: true, pkce_enabled: true, email_optional: false, skip_nonce_check: false,
    attribute_mapping: {}, authorization_params: {}, acceptable_client_ids: [], custom_claims_allowlist: [],
  };
  if (mode === '--apply') {
    stage = 'WCA provider administration';
    const client = createClient(config.supabaseUrl, secret.supabaseAdminKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.admin.customProviders.listProviders();
    if (error || !data?.providers) throw new Error('Provider administration unavailable.');
    const current = data.providers.find(item => item.identifier === provider.identifier);
    if (current && current.provider_type !== 'oidc') throw new Error('Existing WCA configuration uses another protocol; review it before changing.');
    const { provider_type, identifier, ...updates } = provider;
    const result = current
      ? await client.auth.admin.customProviders.updateProvider(identifier, updates)
      : await client.auth.admin.customProviders.createProvider(provider);
    if (result.error) throw new Error('Provider administration failed.');
    const confirmed = await client.auth.admin.customProviders.getProvider(identifier);
    if (confirmed.error || !confirmed.data || confirmed.data.provider_type !== 'oidc' || confirmed.data.issuer !== provider.issuer
      || !confirmed.data.pkce_enabled || !confirmed.data.enabled || confirmed.data.email_optional || confirmed.data.skip_nonce_check
      || Object.keys(confirmed.data.attribute_mapping || {}).length || provider.scopes.some(scope => !confirmed.data.scopes?.includes(scope))) {
      throw new Error('Provider verification failed.');
    }
  }
  console.log(JSON.stringify({ status: mode === '--apply' ? 'configured' : 'validated-inputs', environment: config.environment,
    provider: 'custom:wca', issuer: provider.issuer, scopes: provider.scopes,
    callbackUrl: `${config.supabaseUrl}/auth/v1/callback`, frontendManifestChanged: false,
    next: 'Pass the initial redirect and email checks, then enable the staging acceptance build; production needs human acceptance.' }));
} catch {
  // Provider errors can echo request headers or sensitive response details.
  console.error(`WCA setup failed during ${stage}; no credentials or provider response were printed.`);
  process.exitCode = 1;
}
