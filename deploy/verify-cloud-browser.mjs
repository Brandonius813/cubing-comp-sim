// Run with a private credential file for disposable accounts, never human accounts.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium, firefox, webkit } from 'playwright';
import { createClient } from '@supabase/supabase-js';
const [credentialFile, resultFile] = process.argv.slice(2);
if (!credentialFile || !resultFile) throw new Error('Supply private controlled-account credentials and a result path.');
const browserName = process.env.BROWSER || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw new Error('BROWSER must be chromium, firefox, or webkit.');
const browserType = { chromium, firefox, webkit }[browserName];
if (process.env.CCS_BROWSER_CHANNEL && browserName !== 'chromium') throw new Error('CCS_BROWSER_CHANNEL is supported only with BROWSER=chromium.');
const { settings, accounts } = JSON.parse(await readFile(credentialFile, 'utf8'));
const environment = settings.appUrl === 'https://staging.cubingcompsim.com' ? 'staging' : settings.appUrl === 'https://cubingcompsim.com' ? 'production' : null;
const expectedApi = environment === 'production' ? 'https://api.cubingcompsim.com' : 'https://api-staging.cubingcompsim.com';
if (!environment || settings.apiUrl !== expectedApi || accounts.length !== 2 || accounts.some(a => !/^ccs-check-[a-f0-9-]+@example\.test$/.test(a.email))) throw new Error('This check is restricted to disposable accounts on an exact configured environment.');
if (!['cloud', 'signin-only'].includes(settings.mode)) throw new Error('Unknown verification mode.');
const results = { environment, url: settings.appUrl, browser: browserName, confirmed_test_accounts: true, email_confirmation_delivery: 'not tested by this check', checks: [] };
const pass = name => { results.checks.push(name); console.log(`Passed: ${name}`); };
let stage = 'https_preflight';
let browser;
const pageErrorCounts = [];
const token = async page => page.evaluate(() => JSON.parse(localStorage.getItem('ccs-auth-session') ?? 'null')?.access_token);
async function api(page, path) {
  const response = await page.evaluate(async ({ url, accessToken }) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    return { status: r.status, body: await r.json() };
  }, { url: settings.apiUrl + path, accessToken: await token(page) });
  assert.equal(response.status, 200);
  return response.body;
}
function fixture(label) {
  const now = Date.now(); const id = `${label}-${randomUUID()}`;
  return { id, eventId: '222', format: 'ao5', createdAt: now, updatedAt: now, completedAt: now,
    attempts: Array.from({ length: 5 }, (_, index) => ({ id: randomUUID(), roundId: id, index, rawMs: 12345 + index * 100, penalty: 'none', inspectionPenalty: 'none', inputMethod: 'manual',
      scramble: { eventId: '222', notation: "R U R'", engineVersion: 'controlled-staging-fixture', generatedAt: now }, recordedAt: now })) };
}
async function stored(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('cubing-comp-sim'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise((resolve, reject) => { const tx = db.transaction('rounds', 'readonly'); const r = tx.objectStore('rounds').getAll(); tx.oncomplete = () => resolve(r.result); tx.onabort = () => reject(tx.error); }); }
    finally { db.close(); }
  });
}
async function seed(page, round) {
  await page.evaluate(async round => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('cubing-comp-sim'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { await new Promise((resolve, reject) => {
      const tx = db.transaction(['rounds', 'meta'], 'readwrite'); const store = tx.objectStore('rounds'); store.clear(); store.put(round);
      const meta = tx.objectStore('meta'); const r = meta.get('state'); r.onsuccess = () => meta.put({ ...r.result, revision: r.result.revision + 1, activeRoundId: null, draft: null });
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  }, round);
  await page.reload();
  await page.getByRole('button', { name: 'Account', exact: true }).waitFor();
}
async function accountDialog(page) {
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  return page.getByRole('dialog', { name: 'Account & cloud save', exact: true });
}
async function signIn(page, account) {
  const dialog = await accountDialog(page);
  await dialog.getByLabel('Email', { exact: true }).fill(account.email);
  await dialog.getByLabel('Password', { exact: true }).fill(account.password);
  await dialog.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).waitFor({ timeout: 20000 });
  return dialog;
}
async function transfer(dialog, direction) {
  await dialog.getByRole('button', { name: direction, exact: true }).click();
  await dialog.getByRole('button', { name: 'Replace history', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: direction === 'Upload' ? 'Cloud save replaced' : 'history was replaced' }).waitFor({ timeout: 30000 });
}
try {
  if (settings.mode !== 'signin-only') assert.equal((await fetch(`${settings.apiUrl}/health`)).status, 200);
  const marker = await (await fetch(`${settings.appUrl}/deployment.json`, { cache: 'no-store' })).json();
  assert.equal(marker.environment, environment); assert.equal(marker.apiUrl, settings.apiUrl);
  assert.match(marker.sourceCommit, /^[a-f0-9]{40}$/);
  const authProviders = marker.authProviders ?? [];
  assert.ok(Array.isArray(authProviders) && authProviders.every(provider => ['google', 'wca'].includes(provider)));
  results.deployment = { sourceCommit: marker.sourceCommit, authProviders };
  browser = await browserType.launch({ ...(process.env.CCS_BROWSER_CHANNEL ? { channel: process.env.CCS_BROWSER_CHANNEL } : {}) });
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  pages.forEach((page, index) => {
    pageErrorCounts[index] = 0;
    // Record only counts: exceptions can include credentials or callback URLs.
    page.on('pageerror', () => { pageErrorCounts[index]++; });
  });
  for (const page of pages) { await page.goto(settings.appUrl); await page.getByRole('button', { name: 'Start CompSim', exact: true }).waitFor(); }
  const [a, b] = pages; const aRound = fixture('account-a'); const bRound = fixture('account-b');
  await seed(a, aRound); await seed(b, bRound);
  stage = 'browser_sign_in_and_no_automatic_transfer';
  const aDialog = await signIn(a, accounts[0]); const bDialog = await signIn(b, accounts[1]);
  assert.deepEqual(await stored(a), [aRound]); assert.deepEqual(await stored(b), [bRound]);
  if (settings.mode === 'signin-only') {
    pass('deployed browser password sign-in preserves local history for two accounts');
    await aDialog.getByRole('button', { name: 'Sign out', exact: true }).click();
    await aDialog.getByLabel('Email', { exact: true }).waitFor();
    assert.deepEqual(await stored(a), [aRound]);
    pass('deployed browser sign-out preserves local history');
  } else {
  assert.equal((await api(a, '/v1/save/metadata')).save, null); assert.equal((await api(b, '/v1/save/metadata')).save, null);
  pass('browser sign-in preserves local history and creates no cloud save');
  stage = 'explicit_upload_and_account_isolation';
  await transfer(aDialog, 'Upload'); await transfer(bDialog, 'Upload');
  assert.deepEqual((await api(a, '/v1/save')).snapshot.rounds, [aRound]); assert.deepEqual((await api(b, '/v1/save')).snapshot.rounds, [bRound]);
  const attemptedVictimRead = await api(a, `/v1/save?user_id=${accounts[1].id}`);
  assert.deepEqual(attemptedVictimRead.snapshot.rounds, [aRound]);
  pass('explicit browser uploads and separate saves for two accounts');
  stage = 'fresh_device_sign_in_and_explicit_download';
  const freshContext = await browser.newContext();
  try {
    const freshPage = await freshContext.newPage();
    pageErrorCounts[2] = 0;
    freshPage.on('pageerror', () => { pageErrorCounts[2]++; });
    await freshPage.goto(settings.appUrl);
    await freshPage.getByRole('button', { name: 'Start CompSim', exact: true }).waitFor();
    assert.deepEqual(await stored(freshPage), []);
    const freshDialog = await signIn(freshPage, accounts[0]);
    assert.deepEqual(await stored(freshPage), [], 'Signing in on a fresh device must not download history automatically.');
    await transfer(freshDialog, 'Download');
    assert.equal(aRound.attempts.length, 5);
    assert.deepEqual(await stored(freshPage), [aRound]);
    assert.equal(pageErrorCounts[2], 0);
    pass('fresh device sign-in keeps local history empty until explicit download restores the exact five-attempt round');
  } finally { await freshContext.close(); }
  stage = 'explicit_download_replaces_without_merge';
  await aDialog.getByRole('button', { name: 'Close', exact: true }).click();
  const replacement = fixture('local-replacement'); await seed(a, replacement);
  assert.equal((await api(a, '/v1/save/metadata')).save.revision, 1);
  const downloaded = await accountDialog(a); await transfer(downloaded, 'Download');
  assert.deepEqual(await stored(a), [aRound]);
  pass('explicit download replaces local history without merging');
  await downloaded.getByRole('button', { name: 'Close', exact: true }).click();
  await seed(a, replacement);
  const replaced = await accountDialog(a); await transfer(replaced, 'Upload');
  const saved = await api(a, '/v1/save'); assert.equal(saved.save.revision, 2); assert.deepEqual(saved.snapshot.rounds, [replacement]);
  assert.deepEqual((await api(b, '/v1/save')).snapshot.rounds, [bRound]);
  pass('explicit cloud replacement advances one save and preserves the other account');
  stage = 'browser_sign_out_preserves_local_history';
  await replaced.getByRole('button', { name: 'Sign out', exact: true }).click();
  await replaced.getByLabel('Email', { exact: true }).waitFor();
  assert.deepEqual(await stored(a), [replacement]);
  pass('browser sign-out preserves local history');
  }
  stage = 'browser_runtime_errors';
  assert.deepEqual(pageErrorCounts, settings.mode === 'signin-only' ? [0, 0] : [0, 0, 0]);
  pass('deployed browser pages have no uncaught runtime errors');
} catch {
  console.error(JSON.stringify({ status: 'failed', check: stage })); process.exitCode = 1;
} finally {
  await browser?.close();
  const cleanup = [];
  for (const account of settings.mode === 'signin-only' ? [] : accounts) {
    try {
      const client = createClient(settings.supabaseUrl, settings.publicKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data, error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
      if (error || !data.session) throw new Error();
      const response = await fetch(`${settings.apiUrl}/v1/account`, { method: 'DELETE', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: 'DELETE_ACCOUNT' }) });
      const result = await response.json();
      if (!response.ok || result.status !== 'deleted') throw new Error();
      cleanup.push(true);
    } catch { cleanup.push(false); process.exitCode = 1; }
  }
  results.test_accounts_and_cloud_data_deleted = settings.mode === 'signin-only' ? false : cleanup.every(Boolean);
  results.page_error_counts = pageErrorCounts;
  if (pageErrorCounts.some(count => count > 0)) process.exitCode = 1;
  if (settings.mode === 'signin-only') results.cleanup_method = 'pending private Auth-only cleanup';
  results.completed_at = new Date().toISOString(); results.passed = !process.exitCode;
  await writeFile(resultFile, JSON.stringify(results, null, 2) + '\n', { mode: 0o600 });
  console.log(settings.mode === 'signin-only' ? 'Auth-only identity cleanup must run separately on the server.' : `Controlled-account cleanup: ${results.test_accounts_and_cloud_data_deleted ? 'passed' : 'requires retry'}`);
}
