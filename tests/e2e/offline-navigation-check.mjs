import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Match Cloudflare's /index.html redirect, absent from Vite's preview server. */
export async function checkOfflineNavigation(browser, root, browserName) {
  const dist = path.join(root, 'dist');
  const fixedWorker = await readFile(path.join(dist, 'sw.js'), 'utf8');
  const assets = JSON.parse(fixedWorker.match(/const ASSETS=(.*);/)[1]);
  assert.ok(assets.includes('/') && !assets.includes('/index.html'));
  const legacyCache = 'comp-sim-redirected-navigation-fixture';
  const legacyAssets = assets.map(url => url === '/' ? '/index.html' : url);
  // Reproduce the previously deployed handler and its redirected shell.
  const legacyWorker = `
const CACHE=${JSON.stringify(legacyCache)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(${JSON.stringify(legacyAssets)}))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode==='navigate')event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match('/index.html'))||fetch(event.request)));
 else if(${JSON.stringify(legacyAssets)}.includes(new URL(event.request.url).pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(new URL(event.request.url).pathname))||fetch(event.request)));
});`;
  let worker = fixedWorker;
  let release = 'installed';
  let shellUnavailable = false;
  const html = async () => (await readFile(path.join(dist, 'index.html'), 'utf8'))
    .replace('<html', `<html data-release="${release}"`);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/index.html') {
      response.writeHead(307, { Location: '/' + url.search }); response.end(); return;
    }
    if (url.pathname === '/sw.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      response.end(worker); return;
    }
    if (shellUnavailable && (url.pathname === '/' || url.pathname === '/saved-round')) {
      response.writeHead(503, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      response.end('Temporarily unavailable'); return;
    }
    const file = path.resolve(dist, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(dist + path.sep)) { response.writeHead(404); response.end(); return; }
    try {
      const body = url.pathname === '/' ? await html() : await readFile(file);
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(await html());
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const contexts = [];
  const waitControlled = page => page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 60000 });
  const homepage = page => page.getByRole('button', { name: 'Start CompSim', exact: true }).waitFor();
  // Playwright's waitForFunction treats a returned Promise as truthy; explicitly
  // await asynchronous CacheStorage/registration predicates before accepting them.
  async function waitForState(page, predicate, arg) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (await page.evaluate(predicate, arg)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Offline update did not reach its expected state.');
  }
  try {
    const context = await browser.newContext(); contexts.push(context);
    let page = await context.newPage();
    await page.goto(base); await homepage(page); await waitControlled(page);
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const response = await (await caches.open(names.find(name => name.startsWith('comp-sim-')))).match('/');
      return { redirected: response.redirected, status: response.status };
    });
    assert.deepEqual(cached, { redirected: false, status: 200 });
    release = 'latest-online';
    for (let i = 0; i < 3; i++) { await page.reload(); await homepage(page); }
    assert.equal(await page.locator('html').getAttribute('data-release'), 'latest-online', 'Online navigation must bypass the installed shell.');
    shellUnavailable = true;
    await page.reload(); await homepage(page);
    assert.equal(await page.locator('html').getAttribute('data-release'), 'installed', 'A server failure must retain the complete installed release.');
    shellUnavailable = false;
    await page.close(); page = await context.newPage(); await page.goto(base); await homepage(page);
    await context.setOffline(true);
    await page.reload(); await homepage(page);
    await page.goto(base + '/saved-round?fixture=offline'); await homepage(page);
    assert.equal(await page.locator('html').getAttribute('data-release'), 'installed');
    await context.setOffline(false);

    // A new worker may download during a round, but updating requires a safe idle
    // screen and one app window. Never discard browser data to fix a stale build.
    await page.evaluate(() => localStorage.setItem('offline-update-fixture', 'keep-local-data'));
    await page.getByRole('button', { name: 'Start CompSim', exact: true }).click();
    await page.locator('[data-round-active="true"]').waitFor();
    const oldCache = fixedWorker.match(/const CACHE='([^']+)'/)[1];
    const updatedCache = oldCache + '-update-fixture';
    worker = fixedWorker.replace(oldCache, updatedCache);
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    const updateButton = page.getByRole('button', { name: 'Update site', exact: true });
    await updateButton.waitFor();
    assert.ok(await updateButton.isDisabled(), 'A pending update must never interrupt an unfinished round.');
    assert.ok(await page.evaluate(async name => (await caches.keys()).includes(name), oldCache));
    await page.getByRole('button', { name: 'End Round', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'End Round', exact: true }).click();
    await homepage(page);
    const anotherTab = await context.newPage(); await anotherTab.goto(base); await homepage(anotherTab);
    await page.bringToFront();
    await updateButton.click();
    await page.getByText('Close other CompSim tabs, then try again.', { exact: true }).waitFor();
    assert.ok(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting));
    await anotherTab.close();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    assert.ok(await updateButton.isDisabled(), 'Updating must not interrupt a settings/account dialog.');
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await Promise.all([page.waitForEvent('load'), updateButton.click()]);
    await homepage(page);
    await waitForState(page, async name => !(await caches.keys()).includes(name), oldCache);
    assert.equal(await page.locator('html').getAttribute('data-release'), 'latest-online');
    assert.equal(await page.evaluate(() => localStorage.getItem('offline-update-fixture')), 'keep-local-data');
    await context.setOffline(true); await page.reload(); await homepage(page);
    assert.equal(await page.locator('html').getAttribute('data-release'), 'latest-online', 'Explicit activation must make the new release available offline.');
    await context.setOffline(false);
    await context.close();

    worker = legacyWorker;
    const legacyContext = await browser.newContext(); contexts.push(legacyContext);
    const original = await legacyContext.newPage();
    await original.goto(base); await homepage(original); await waitControlled(original);
    await original.evaluate(async () => {
      localStorage.setItem('offline-navigation-fixture', 'keep-local-data');
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('offline-navigation-fixture', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('rounds');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result; const tx = db.transaction('rounds', 'readwrite');
          tx.objectStore('rounds').put({ attempts: [12.34] }, 'saved-round');
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
        };
      });
    });
    assert.equal(await original.evaluate(async name => (await (await caches.open(name)).match('/index.html')).redirected, legacyCache), true);
    const revisit = await legacyContext.newPage();
    let failed = false;
    try { await revisit.goto(base, { timeout: 10000 }); } catch { failed = true; }
    // Chromium rejects the redirected navigation response; Firefox tolerates it.
    // Require the reported Chrome failure, and verify repair/reloads in every engine.
    if (browserName === 'chromium') assert.ok(failed, 'The legacy redirected shell must reproduce the Chrome navigation failure.');

    worker = fixedWorker;
    await original.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
    });
    await waitForState(original, async name => {
      const response = await (await caches.open(name)).match('/index.html');
      return !!(await navigator.serviceWorker.getRegistration()).waiting && response?.redirected === false;
    }, legacyCache);
    const repaired = await original.evaluate(async name => ({
      redirected: (await (await caches.open(name)).match('/index.html')).redirected,
      activeIsLegacy: (await caches.keys()).includes(name),
    }), legacyCache);
    assert.deepEqual(repaired, { redirected: false, activeIsLegacy: true });
    await revisit.goto(base); await homepage(revisit);
    await revisit.reload(); await homepage(revisit);
    await legacyContext.setOffline(true);
    await revisit.reload(); await homepage(revisit);
    const retained = await revisit.evaluate(async () => {
      const round = await new Promise((resolve, reject) => {
        const request = indexedDB.open('offline-navigation-fixture', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result; const tx = db.transaction('rounds', 'readonly');
          const row = tx.objectStore('rounds').get('saved-round');
          row.onsuccess = () => resolve(row.result); tx.oncomplete = () => db.close();
        };
      });
      return { local: localStorage.getItem('offline-navigation-fixture'), round };
    });
    assert.deepEqual(retained, { local: 'keep-local-data', round: { attempts: [12.34] } });
    await legacyContext.setOffline(false);
    await original.close(); await revisit.close();
    const afterActivation = await legacyContext.newPage();
    await afterActivation.goto(base); await homepage(afterActivation); await waitControlled(afterActivation);
    await waitForState(afterActivation, async name => !(await caches.keys()).includes(name), legacyCache);
    await legacyContext.setOffline(true); await afterActivation.reload(); await homepage(afterActivation);
    return `legacy redirected navigation ${failed ? 'rejected' : 'accepted'}; latest online shell, server-failure/offline fallback, active-round/dialog/multitab update guards, explicit activation, legacy repair and stored-data preservation passed`;
  } finally {
    for (const context of contexts) await context.close();
    await new Promise(resolve => server.close(resolve));
  }
}
