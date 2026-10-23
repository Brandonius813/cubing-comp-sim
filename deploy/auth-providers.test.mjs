import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyProviderRedirects, validateAuthProviders, assertProviderReleaseReadiness } from './auth-providers.mjs';

const config = { appUrl: 'https://staging.example.com', supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co', authProviders: ['google', 'wca'] };
function responseFor(provider, alter = () => {}) {
  const target = new URL(provider === 'wca' ? 'https://www.worldcubeassociation.org/oauth/authorize' : provider === 'apple' ? 'https://appleid.apple.com/auth/authorize' : 'https://accounts.google.com/o/oauth2/v2/auth');
  target.searchParams.set('redirect_uri', `${config.supabaseUrl}/auth/v1/callback`);
  target.searchParams.set('response_type', 'code');
  target.searchParams.set('state', 'opaque-test-state');
  if (provider === 'apple') target.searchParams.set('response_mode', 'form_post');
  target.searchParams.set('scope', 'public openid profile email');
  target.searchParams.set('code_challenge', 'opaque-provider-challenge');
  target.searchParams.set('code_challenge_method', 'S256');
  alter(target);
  return new Response(null, { status: 302, headers: { location: target.toString() } });
}

test('empty gate performs no requests and provider list rejects mistakes', async () => {
  assert.deepEqual(await verifyProviderRedirects({ ...config, authProviders: [] }, 'public', () => assert.fail('unexpected network request')), []);
  assert.deepEqual(validateAuthProviders(undefined), []);
  for (const value of ['google,wca', ['google', 'google'], ['custom:wca'], ['github']]) assert.throws(() => validateAuthProviders(value));
});

test('configured providers require manual redirects and browser PKCE', async () => {
  const requests = [];
  const result = await verifyProviderRedirects(config, 'publishable-test-key', async (url, options) => {
    requests.push(new URL(url));
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.apikey, 'publishable-test-key');
    assert.equal(url.searchParams.get('redirect_to'), config.appUrl);
    assert.equal(url.searchParams.get('code_challenge_method'), 's256');
    assert.match(url.searchParams.get('code_challenge'), /^[a-zA-Z0-9_-]{43}$/);
    assert.equal(url.searchParams.has('code_verifier'), false);
    return responseFor(url.searchParams.get('provider') === 'custom:wca' ? 'wca' : 'google');
  });
  assert.deepEqual(result, ['google', 'wca']);
  assert.deepEqual(requests.map(url => url.searchParams.get('provider')), ['google', 'custom:wca']);
});

for (const [name, alter] of [
  ['provider impersonation', url => { url.hostname = 'attacker.example'; }],
  ['insecure authorization', url => { url.protocol = 'http:'; }],
  ['wrong callback', url => { url.searchParams.set('redirect_uri', 'https://attacker.example/callback'); }],
  ['missing state', url => { url.searchParams.delete('state'); }],
  ['implicit tokens', url => { url.searchParams.set('response_type', 'token'); }],
  ['missing email scope', url => { url.searchParams.set('scope', 'public openid profile'); }],
  ['disabled provider PKCE', url => { url.searchParams.delete('code_challenge'); }],
  ['weak provider PKCE', url => { url.searchParams.set('code_challenge_method', 'plain'); }],
]) {
  test(`WCA deployment rejects ${name}`, async () => {
    await assert.rejects(verifyProviderRedirects({ ...config, authProviders: ['wca'] }, 'public', async () => responseFor('wca', alter)));
  });
}

test('unconfigured provider error never includes provider response', async () => {
  await assert.rejects(verifyProviderRedirects({ ...config, authProviders: ['google'] }, 'public', async () => new Response('SECRET-RESPONSE', { status: 400 })), error => {
    assert.equal(error.message.includes('SECRET-RESPONSE'), false);
    return /google is not configured/.test(error.message);
  });
});

test('malformed redirect error never includes the sensitive location', async () => {
  await assert.rejects(verifyProviderRedirects({ ...config, authProviders: ['wca'] }, 'public', async () => new Response(null, {
    status: 302, headers: { location: 'MALFORMED-SENSITIVE-LOCATION' },
  })), error => {
    assert.equal(error.message.includes('SENSITIVE'), false);
    return /invalid OAuth authorization target/.test(error.message);
  });
});


test('Apple initial redirect can be checked separately from its blocked release', async () => {
  const providers = ['google', 'wca', 'apple'];
  assert.deepEqual(validateAuthProviders(providers), providers);
  assert.throws(() => assertProviderReleaseReadiness(providers), /revocation/);
  assert.doesNotThrow(() => assertProviderReleaseReadiness(['google', 'wca']));
  const result = await verifyProviderRedirects({ ...config, authProviders: ['apple'] }, 'public', async url => {
    assert.equal(url.searchParams.get('provider'), 'apple');
    return responseFor('apple');
  });
  assert.deepEqual(result, ['apple']);
});

for (const [name, alter] of [
  ['wrong Apple host', url => { url.hostname = 'attacker.example'; }],
  ['wrong callback', url => { url.searchParams.set('redirect_uri', 'https://attacker.example/callback'); }],
  ['missing state', url => { url.searchParams.delete('state'); }],
  ['implicit tokens', url => { url.searchParams.set('response_type', 'token'); }],
  ['missing email', url => { url.searchParams.set('scope', 'name'); }],
  ['wrong response mode', url => { url.searchParams.set('response_mode', 'query'); }],
]) {
  test(`Apple initial redirect rejects ${name}`, async () => {
    await assert.rejects(verifyProviderRedirects({ ...config, authProviders: ['apple'] }, 'public', async () => responseFor('apple', alter)));
  });
}
