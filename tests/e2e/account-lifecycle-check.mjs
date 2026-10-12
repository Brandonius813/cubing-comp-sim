import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const ids = { a: '11111111-1111-4111-8111-111111111111', b: '22222222-2222-4222-8222-222222222222' };
function responseSession(account, rotated = false) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: ids[account], exp: now + 3600, iat: now, aud: 'authenticated', role: 'authenticated' })).toString('base64url');
  return {
    access_token: `${header}.${payload}.test-only-signature`, refresh_token: `test-only-refresh-${account}${rotated ? '-rotated' : ''}`, expires_in: 3600, expires_at: now + 3600, token_type: 'bearer',
    user: { id: ids[account], aud: 'authenticated', role: 'authenticated', email: `solver-${account}@example.test`, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [{ id: `test-identity-${account}`, user_id: ids[account], identity_id: `test-identity-${account}`, provider: 'email', identity_data: { email_verified: true } }], created_at: new Date().toISOString() },
  };
}

/** Covers the real SDK's cross-tab commit guard; no account methods are mocked. */
export async function checkAccountLifecycle(browser, origin) {
  const context = await browser.newContext();
  const errors = [];
  const requests = [];
  let releaseRefresh;
  let refreshStarted;
  let holdRefresh = false;
  let holdConcurrentRefresh = false;
  let concurrentStarted;
  const concurrentReleases = [];
  let holdLogout = false;
  let logoutStarted;
  let releaseLogout;
  let holdPasswordUpdate = false;
  let passwordUpdateStarted;
  let releasePasswordUpdate;
  let holdPasswordReauth = false;
  let passwordReauthStarted;
  let releasePasswordReauth;
  const accountFromAuth = request => {
    const token = request.headers().authorization?.split(' ')[1];
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return claims.sub === ids.a ? 'a' : 'b';
  };
  const armRefresh = () => {
    holdRefresh = true;
    const started = new Promise(resolve => { refreshStarted = resolve; });
    return started;
  };
  const fulfill = (route, body, status = 200) => route.fulfill({ status, headers: { 'Access-Control-Allow-Origin': '*' }, ...(status === 204 ? {} : { contentType: 'application/json', body: JSON.stringify(body) }) });
  try {
    await context.addInitScript(() => localStorage.setItem('account-lifecycle-local-history-sentinel', 'kept'));
    await context.route('https://auth.example.test/**', async route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST,GET,OPTIONS' } }); return; }
      requests.push(`${route.request().method()} ${url.pathname}${url.search}`);
      if (url.pathname === '/auth/v1/signup') {
        const body = route.request().postDataJSON();
        assert.equal(body.email, 'new-solver@example.test');
        assert.ok(!body.code_challenge, 'Email signup must retain cross-browser confirmation links.');
        await fulfill(route, { user: { ...responseSession('a').user, email: body.email, email_confirmed_at: undefined } });
      } else if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        const account = route.request().postDataJSON().email === 'solver-a@example.test' ? 'a' : 'b';
        if (holdPasswordReauth && account === 'a') {
          holdPasswordReauth = false;
          const held = new Promise(resolve => { releasePasswordReauth = resolve; });
          passwordReauthStarted();
          await held;
        }
        await fulfill(route, responseSession(account));
      } else if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
        const account = route.request().postDataJSON().refresh_token.includes('-a') ? 'a' : 'b';
        if (holdConcurrentRefresh) {
          const held = new Promise(resolve => concurrentReleases.push(resolve));
          if (concurrentReleases.length === 2) concurrentStarted();
          await held;
        } else if (holdRefresh) {
          holdRefresh = false;
          const held = new Promise(resolve => { releaseRefresh = resolve; });
          refreshStarted();
          await held;
        }
        await fulfill(route, responseSession(account, true));
      } else if (url.pathname === '/auth/v1/logout') {
        assert.ok(['local', 'others'].includes(url.searchParams.get('scope')));
        if (url.searchParams.get('scope') === 'others') assert.equal(accountFromAuth(route.request()), 'a', 'Password update revocation must target the captured account A.');
        if (holdLogout) {
          holdLogout = false;
          const held = new Promise(resolve => { releaseLogout = resolve; });
          logoutStarted();
          await held;
        }
        await fulfill(route, undefined, 204);
      } else if (url.pathname === '/auth/v1/user' && route.request().method() === 'GET') {
        await fulfill(route, { user: responseSession(accountFromAuth(route.request())).user });
      } else if (url.pathname === '/auth/v1/user' && route.request().method() === 'PUT') {
        assert.equal(accountFromAuth(route.request()), 'a', 'Password update must use the captured account A token.');
        assert.equal(route.request().postDataJSON().password, 'test-only-new-password');
        if (holdPasswordUpdate) {
          holdPasswordUpdate = false;
          const held = new Promise(resolve => { releasePasswordUpdate = resolve; });
          passwordUpdateStarted();
          await held;
        }
        await fulfill(route, { user: responseSession('a').user });
      } else throw new Error(`Unexpected auth lifecycle request: ${url.pathname}${url.search}`);
    });
    const pages = [await context.newPage(), await context.newPage()];
    for (const page of pages) {
      page.on('pageerror', error => errors.push({ message: error.message, stack: error.stack }));
      await page.goto(`${origin}/tests/e2e/account-lifecycle.fixture.html`);
      await page.getByText('Account ready', { exact: true }).waitFor();
    }
    const sessionId = page => page.evaluate(async () => (await window.accountLifecycleFixture.session())?.user.id ?? null);
    const waitSession = (page, expected) => page.waitForFunction(async expected => ((await window.accountLifecycleFixture.session())?.user.id ?? null) === expected, expected);
    const refreshComplete = page => page.waitForFunction(() => window.accountLifecycleFixture.refreshState().complete);
    assert.equal(await pages[0].evaluate(() => window.accountLifecycleFixture.signUp('new-solver@example.test')), null);
    for (const page of pages) assert.equal(await sessionId(page), null, 'Unconfirmed signup must not sign either tab in.');
    assert.equal(await pages[0].evaluate(() => localStorage.getItem('ccs-auth-session')), null);
    await pages[0].evaluate(() => window.accountLifecycleFixture.signIn('solver-a@example.test'));
    await waitSession(pages[1], ids.a);

    const replacementRefresh = armRefresh();
    await pages[0].evaluate(() => window.accountLifecycleFixture.startRefresh());
    await replacementRefresh;
    await pages[1].evaluate(() => window.accountLifecycleFixture.signIn('solver-b@example.test'));
    await waitSession(pages[0], ids.b);
    releaseRefresh(); releaseRefresh = undefined;
    await refreshComplete(pages[0]);
    assert.equal(await pages[0].evaluate(() => window.accountLifecycleFixture.refreshState().error), 'AuthRefreshDiscardedError');
    for (const page of pages) assert.equal(await sessionId(page), ids.b, 'An older refresh must never overwrite the account signed in by another tab.');
    assert.equal(await pages[0].evaluate(() => window.accountLifecycleFixture.storedSession()?.user.id), ids.b);

    const signedOutRefresh = armRefresh();
    await pages[0].evaluate(() => window.accountLifecycleFixture.startRefresh());
    await signedOutRefresh;
    await pages[1].evaluate(() => window.accountLifecycleFixture.signOut());
    await waitSession(pages[0], null);
    releaseRefresh(); releaseRefresh = undefined;
    await refreshComplete(pages[0]);
    assert.equal(await pages[0].evaluate(() => window.accountLifecycleFixture.refreshState().error), 'AuthRefreshDiscardedError');
    for (const page of pages) {
      assert.equal(await sessionId(page), null, 'An in-flight refresh must not revive a session after another tab signs out.');
      assert.equal(await page.evaluate(() => window.accountLifecycleFixture.storedSession()), null);
      assert.equal(await page.evaluate(() => localStorage.getItem('account-lifecycle-local-history-sentinel')), 'kept');
    }
    await pages[0].evaluate(() => window.accountLifecycleFixture.signIn('solver-a@example.test'));
    await waitSession(pages[1], ids.a);
    holdConcurrentRefresh = true;
    const concurrentRequests = new Promise(resolve => { concurrentStarted = resolve; });
    await pages[0].evaluate(() => window.accountLifecycleFixture.startRefresh());
    await pages[1].evaluate(() => window.accountLifecycleFixture.startRefresh());
    await concurrentRequests;
    holdConcurrentRefresh = false;
    concurrentReleases.forEach(release => release());
    await Promise.all(pages.map(refreshComplete));
    const outcomes = await Promise.all(pages.map(page => page.evaluate(() => window.accountLifecycleFixture.refreshState())));
    assert.ok(outcomes.some(outcome => outcome.userId === ids.a), 'At least one compatible refresh must commit.');
    for (const [index, page] of pages.entries()) {
      assert.ok(!outcomes[index].error || outcomes[index].error === 'AuthRefreshDiscardedError');
      assert.equal(await sessionId(page), ids.a, 'Compatible cross-tab refreshes must retain the same current account.');
      assert.equal(await page.evaluate(() => window.accountLifecycleFixture.storedSession()?.refresh_token), 'test-only-refresh-a-rotated');
    }
    holdLogout = true;
    const deletionLogout = new Promise(resolve => { logoutStarted = resolve; });
    await pages[0].evaluate(userId => window.accountLifecycleFixture.startDeletionLogout(userId), ids.a);
    await deletionLogout;
    await pages[1].evaluate(() => window.accountLifecycleFixture.signIn('solver-b@example.test'));
    await waitSession(pages[0], ids.b);
    const eventCounts = await Promise.all(pages.map(page => page.evaluate(() => window.accountLifecycleFixture.events.length)));
    releaseLogout(); releaseLogout = undefined;
    await pages[0].waitForFunction(() => window.accountLifecycleFixture.deletionLogoutState().complete);
    assert.equal(await pages[0].evaluate(() => window.accountLifecycleFixture.deletionLogoutState().error), undefined);
    for (const [index, page] of pages.entries()) {
      assert.equal(await sessionId(page), ids.b, 'Account A deletion logout must not clear account B signed in while logout was in flight.');
      assert.equal(await page.evaluate(() => window.accountLifecycleFixture.storedSession()?.user.id), ids.b);
      assert.equal(await page.evaluate(start => window.accountLifecycleFixture.events.slice(start).some(event => event.event === 'SIGNED_OUT'), eventCounts[index]), false, 'Account A logout must not notify account B as signed out.');
      assert.equal(await page.evaluate(() => window.accountLifecycleFixture.refreshActive()), true, 'Account B automatic refresh must remain active.');
      assert.equal(await page.evaluate(() => localStorage.getItem('account-lifecycle-local-history-sentinel')), 'kept');
    }
    await pages[0].evaluate(() => window.accountLifecycleFixture.startRefresh());
    await refreshComplete(pages[0]);
    assert.equal(await pages[0].evaluate(() => window.accountLifecycleFixture.refreshState().userId), ids.b);
    assert.equal(await sessionId(pages[1]), ids.b);
    await pages[0].evaluate(() => window.accountLifecycleFixture.signIn('solver-a@example.test'));
    await waitSession(pages[1], ids.a);
    holdPasswordUpdate = true;
    const passwordUpdate = new Promise(resolve => { passwordUpdateStarted = resolve; });
    await pages[0].evaluate(userId => window.accountLifecycleFixture.startPasswordUpdate(userId), ids.a);
    await passwordUpdate;
    await pages[1].evaluate(() => window.accountLifecycleFixture.signIn('solver-b@example.test'));
    await waitSession(pages[0], ids.b);
    releasePasswordUpdate(); releasePasswordUpdate = undefined;
    await pages[0].waitForFunction(() => window.accountLifecycleFixture.passwordState().complete);
    for (const page of pages) {
      assert.equal(await sessionId(page), ids.b, 'A late account-A password response must not overwrite account B.');
      assert.equal(await page.evaluate(() => window.accountLifecycleFixture.storedSession()?.user.id), ids.b);
      assert.equal(await page.evaluate(() => window.accountLifecycleFixture.refreshActive()), true);
    }
    await pages[0].evaluate(() => window.accountLifecycleFixture.signIn('solver-a@example.test'));
    await waitSession(pages[1], ids.a);
    holdPasswordReauth = true;
    const passwordReauth = new Promise(resolve => { passwordReauthStarted = resolve; });
    await pages[0].evaluate(userId => window.accountLifecycleFixture.startDeletionReauth(userId), ids.a);
    await passwordReauth;
    await pages[1].evaluate(() => window.accountLifecycleFixture.signIn('solver-b@example.test'));
    await waitSession(pages[0], ids.b);
    releasePasswordReauth(); releasePasswordReauth = undefined;
    await pages[0].waitForFunction(() => window.accountLifecycleFixture.reauthState().complete);
    assert.equal(await pages[0].evaluate(() => window.accountLifecycleFixture.reauthState().error), 'auth_required');
    for (const page of pages) {
      assert.equal(await sessionId(page), ids.b, 'A late account-A password confirmation must not overwrite account B or authorize deletion.');
      assert.equal(await page.evaluate(() => window.accountLifecycleFixture.storedSession()?.user.id), ids.b);
      assert.equal(await page.evaluate(() => localStorage.getItem('account-lifecycle-local-history-sentinel')), 'kept');
    }
    assert.deepEqual(errors, [], 'Real cross-tab account lifecycle must not emit page errors.');
    assert.equal(requests.filter(request => request.includes('/signup')).length, 1);
    assert.equal(requests.filter(request => request.includes('grant_type=refresh_token')).length, 5);
    return 'Real SDK cross-tab signup, sign-in, refresh, account replacement, sign-out, deletion logout, password update and deletion confirmation races passed; local history retained and no page errors.';
  } finally { releaseRefresh?.(); releaseLogout?.(); releasePasswordUpdate?.(); releasePasswordReauth?.(); concurrentReleases.forEach(release => release()); await context.close(); }
}

export async function checkRecoveryThenOAuth(browser, origin) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push({ message: error.message, stack: error.stack }));
  let providerRequest;
  let storedVerifier;
  const session = responseSession('a');
  try {
    await context.route('https://auth.example.test/**', async route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST,GET,OPTIONS' } }); return; }
      if (url.pathname === '/auth/v1/user') {
        assert.equal(route.request().headers().authorization, `Bearer ${session.access_token}`);
        await route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({ user: session.user }) });
      } else if (url.pathname === '/auth/v1/logout') {
        await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
      } else if (url.pathname === '/auth/v1/authorize') {
        providerRequest = url;
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Provider request received</p>' });
      } else throw new Error(`Unexpected recovery request: ${url.pathname}`);
    });
    const hash = new URLSearchParams({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: '3600', token_type: 'bearer', type: 'recovery' });
    await page.goto(`${origin}/tests/e2e/account-lifecycle.fixture.html?account=recovery#${hash}`);
    await page.getByText('Account ready', { exact: true }).waitFor();
    assert.equal(await page.evaluate(async () => (await window.accountLifecycleFixture.session()).user.id), ids.a);
    assert.ok(await page.evaluate(() => window.accountLifecycleFixture.events.some(event => event.event === 'PASSWORD_RECOVERY' && event.userId)));
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(new URL(page.url()).search, '');
    await page.evaluate(() => window.accountLifecycleFixture.signOut());
    await page.evaluate(() => window.accountLifecycleFixture.beginProviderSignIn());
    await page.getByText('Provider request received', { exact: true }).waitFor();
    const storage = await context.storageState();
    storedVerifier = JSON.parse(storage.origins.find(entry => entry.origin === origin).localStorage.find(entry => entry.name === 'ccs-auth-session-code-verifier').value);
    assert.equal(providerRequest.searchParams.get('provider'), 'google');
    assert.equal(providerRequest.searchParams.get('code_challenge_method'), 's256');
    assert.equal(providerRequest.searchParams.get('redirect_to'), `${origin}/?account=signin`);
    assert.equal(providerRequest.searchParams.get('code_challenge'), createHash('sha256').update(storedVerifier.split('/')[0]).digest('base64url'));
    assert.deepEqual(errors, [], 'Email recovery followed by OAuth must not emit page errors.');
    return 'Real SDK implicit email recovery restores the account, emits recovery, scrubs credentials and preserves S256 PKCE for subsequent Google sign-in.';
  } finally { await context.close(); }
}
