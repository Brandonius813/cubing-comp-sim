import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';
let server;
let browser;
try {
  server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ ...(process.env.CCS_BROWSER_CHANNEL ? { channel: process.env.CCS_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext();
  const page = await context.newPage();
  const transfers = [];
  page.on('request', request => {
    if (request.url().includes('/v1/save') && (request.method() === 'PUT' || new URL(request.url()).pathname === '/v1/save')) transfers.push(request.method());
  });
  await page.goto(url);
  await page.getByRole('button', { name: 'Start CompSim', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Account & cloud save', exact: true });
  assert.equal(await dialog.getByLabel('Email', { exact: true }).isEnabled(), true);
  assert.equal(await dialog.getByLabel('Password', { exact: true }).isEnabled(), true);
  assert.equal(await dialog.locator('form').getByRole('button', { name: 'Sign in', exact: true }).isEnabled(), true);
  assert.deepEqual(transfers, []);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  // Wait on a synchronous predicate: a returned Promise can be treated as
  // truthy before its async registration/cache checks have actually completed.
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 60000 });
  const offlineShell = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const names = await caches.keys();
    const name = names.find(value => value.startsWith('comp-sim-'));
    const shell = name ? await (await caches.open(name)).match('/') : undefined;
    return { registered: Boolean(registration?.active), status: shell?.status, redirected: shell?.redirected };
  });
  assert.deepEqual(offlineShell, { registered: true, status: 200, redirected: false });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Start CompSim', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.onLine), false);
  console.log('Configured account controls, no automatic transfers, and offline guest reload passed in a fresh browser context.');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
