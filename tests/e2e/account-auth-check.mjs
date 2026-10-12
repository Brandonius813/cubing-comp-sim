import assert from 'node:assert/strict';

export async function checkRealAccountCallbacks(browser, origin) {
  const cases = [
    { purpose: 'signin', provider: 'google', identity: 'google', status: 'success' },
    { purpose: 'signin', provider: 'wca', identity: 'custom:wca', status: 'success' },
    { purpose: 'link', provider: 'wca', identity: 'custom:wca', userId: 'test-user', status: 'success' },
    { purpose: 'delete', provider: 'google', identity: 'google', userId: 'test-user', status: 'success', deletionAllowed: true },
    { purpose: 'delete', provider: 'google', identity: 'google', userId: 'different-user', status: 'error' },
    { purpose: 'delete', provider: 'wca', identity: 'google', userId: 'test-user', status: 'error' },
    { purpose: 'signin', provider: 'google', identity: 'google', status: 'error', denied: true },
    { purpose: 'delete', provider: 'google', identity: 'google', userId: 'test-user', status: 'error', expired: true },
    { purpose: 'delete', provider: 'google', identity: 'google', userId: 'test-user', status: 'error', missingVerifier: true },
    { purpose: 'signin', provider: 'wca', identity: 'custom:wca', status: 'error', denied: true, reason: 'email_verification' },
  ];
  for (const scenario of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let exchanges = 0;
    try {
      await context.addInitScript(scenario => {
        if (!scenario.missingVerifier) localStorage.setItem('ccs-auth-session-code-verifier', JSON.stringify('test-only-code-verifier'));
        else {
          const now = Math.floor(Date.now() / 1000);
          const access_token = `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify({ sub: 'test-user', exp: now + 3600, iat: now, aud: 'authenticated', role: 'authenticated' }))}.test-only-signature`;
          localStorage.setItem('ccs-auth-session', JSON.stringify({ access_token, refresh_token: 'test-only-refresh-token', expires_at: now + 3600, expires_in: 3600, token_type: 'bearer', user: { id: 'test-user', email: 'solver@example.test', email_confirmed_at: new Date().toISOString(), identities: [{ provider: scenario.identity }], app_metadata: { provider: scenario.identity, providers: [scenario.identity] }, user_metadata: {}, aud: 'authenticated' } }));
        }
        localStorage.setItem('account-auth-local-history-sentinel', 'kept');
        sessionStorage.setItem('ccs-oauth-intent', JSON.stringify({ purpose: scenario.purpose, provider: scenario.provider, userId: scenario.userId, startedAt: Date.now() - (scenario.expired ? 11 * 60_000 : 1000) }));
      }, scenario);
      await page.route('https://auth.example.test/**', async route => {
        if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST,GET,OPTIONS' } }); return; }
        assert.match(route.request().url(), /\/auth\/v1\/token\?grant_type=pkce$/);
        const request = route.request().postDataJSON();
        assert.equal(request.auth_code, 'test-only-code');
        assert.equal(request.code_verifier, 'test-only-code-verifier');
        exchanges++;
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const claims = Buffer.from(JSON.stringify({ sub: 'test-user', exp: now + 3600, iat: now, aud: 'authenticated', role: 'authenticated' })).toString('base64url');
        await route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({
          access_token: `${header}.${claims}.test-only-signature`, refresh_token: 'test-only-refresh-token', expires_in: 3600, token_type: 'bearer',
          provider_token: 'test-only-provider-token', provider_refresh_token: 'test-only-provider-refresh',
          user: { id: 'test-user', aud: 'authenticated', role: 'authenticated', email: 'solver@example.test', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: scenario.identity, providers: [scenario.identity] }, user_metadata: {}, identities: [{ id: 'test-identity', user_id: 'test-user', identity_id: 'test-identity', provider: scenario.identity, identity_data: { email: 'solver@example.test', email_verified: true } }], created_at: new Date().toISOString() },
        }) });
      });
      await page.goto(`${origin}/tests/e2e/account-auth.fixture.html?account=${scenario.purpose}&${scenario.denied ? `error=access_denied&error_description=Cancelled${scenario.reason ? '&error_code=provider_email_needs_verification' : ''}` : 'code=test-only-code'}`);
      await page.getByText('Callback complete', { exact: true }).waitFor();
      const result = await page.evaluate(() => window.realAccountFixture);
      assert.equal(result.callback.status, scenario.status, JSON.stringify(scenario));
      if (scenario.reason) assert.equal(result.callback.reason, scenario.reason);
      assert.equal(result.deletionAllowed, Boolean(scenario.deletionAllowed), 'Deletion proof must require a successful same-account callback.');
      assert.equal(result.intent, null, 'Callback intent must be consumed.');
      assert.equal(new URL(page.url()).search, '', 'Credentials and callback indicators must be removed from URL.');
      assert.equal(exchanges, scenario.denied || scenario.missingVerifier ? 0 : 1);
      assert.equal(await page.evaluate(() => localStorage.getItem('account-auth-local-history-sentinel')), 'kept');
      if (result.storedSession) {
        assert.ok(!result.storedSession.includes('test-only-provider-token'));
        assert.ok(!result.storedSession.includes('test-only-provider-refresh'));
        assert.equal(result.session.user.email, 'solver@example.test');
        assert.deepEqual(result.session.user.providers, [scenario.identity]);
      }
    } finally { await context.close(); }
  }
  return 'Real Supabase SDK PKCE exchange, Google/custom WCA callbacks, identity linking, same-account deletion proof, mismatch/denial/expiry/missing-verifier handling, email verification, token redaction and local-history preservation passed (10 cases).';
}
