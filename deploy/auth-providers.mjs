import { randomBytes, createHash } from 'node:crypto';

export function validateAuthProviders(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(provider => !['google', 'wca', 'apple'].includes(provider)) || new Set(value).size !== value.length) {
    throw new Error('authProviders must be a unique array containing only google, wca, and/or apple.');
  }
  return [...value];
}

// This hard gate must be removed only with tested Apple grant revocation.
// A configured provider alone is not proof that account deletion is supported.
export function assertProviderReleaseReadiness(providers) {
  if (validateAuthProviders(providers).includes('apple')) {
    throw new Error('apple release is blocked until provider token revocation and account deletion are accepted. See docs/apple-sign-in.md.');
  }
}

// This verifies configuration and the initial redirect, never signs in a person.
// Successful human consent, email confirmation and cloud checks remain required.
export async function verifyProviderRedirects(config, publicKey, request = fetch) {
  const providers = validateAuthProviders(config.authProviders);
  const callback = `${config.supabaseUrl}/auth/v1/callback`;
  for (const provider of providers) {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const url = new URL(`${config.supabaseUrl}/auth/v1/authorize`);
    url.searchParams.set('provider', provider === 'wca' ? 'custom:wca' : provider);
    url.searchParams.set('redirect_to', config.appUrl);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 's256');
    const response = await request(url, { headers: { apikey: publicKey }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const location = response.headers.get('location');
    if (![302, 303].includes(response.status) || !location) throw new Error(`${provider} is not configured for this environment. Keep its frontend gate closed.`);
    let target;
    try { target = new URL(location); }
    catch { throw new Error(`${provider} returned an invalid OAuth authorization target.`); }
    const validTarget = provider === 'wca'
      ? target.origin === 'https://www.worldcubeassociation.org' && target.pathname === '/oauth/authorize'
      : provider === 'apple' ? target.origin === 'https://appleid.apple.com' && target.pathname === '/auth/authorize'
      : target.origin === 'https://accounts.google.com' && target.pathname.startsWith('/o/oauth2/');
    if (!validTarget || target.searchParams.get('redirect_uri') !== callback || target.searchParams.get('response_type') !== 'code' || !target.searchParams.get('state')) {
      throw new Error(`${provider} returned an unexpected OAuth authorization target.`);
    }
    if (provider === 'apple' && (target.searchParams.get('response_mode') !== 'form_post'
      || !(target.searchParams.get('scope') || '').split(' ').includes('email'))) {
      throw new Error('apple requires form_post and email scope before enabling its frontend gate.');
    }
    if (provider === 'wca') {
      const scopes = new Set((target.searchParams.get('scope') || '').split(' '));
      if (['public', 'openid', 'profile', 'email'].some(scope => !scopes.has(scope)) || target.searchParams.get('code_challenge_method') !== 'S256' || !target.searchParams.get('code_challenge')) {
        throw new Error('WCA requires its configured OpenID scopes and provider PKCE before enabling its frontend gate.');
      }
    }
  }
  return providers;
}
