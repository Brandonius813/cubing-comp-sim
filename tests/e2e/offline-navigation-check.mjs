import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function bounded(promise, label, milliseconds = 30_000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
const evaluate = (page, predicate, arg) => bounded(page.evaluate(predicate, arg), 'offline fixture evaluation');

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
  let networkUnavailable = false;
  const html = async () => (await readFile(path.join(dist, 'index.html'), 'utf8'))
    .replace('<html', `<html data-release="${release}"`);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = createServer(async (request, response) => {
    // Firefox service-worker requests can bypass Playwright's simulated offline
    // mode. Reject the connection too, so every engine tests a failed fetch.
    if (networkUnavailable) { request.socket.destroy(); return; }
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
    const file = path.resolve(dist, '.' + (url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
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
  const setOffline = async (context, offline) => {
    networkUnavailable = offline;
    await bounded(context.setOffline(offline), 'offline fixture network transition');
  };
  const waitControlled = page => page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 60000 });
  const homepage = page => page.getByRole('button', { name: 'Start CompSim', exact: true }).waitFor();
  // Playwright's waitForFunction treats a returned Promise as truthy; explicitly
  // await asynchronous CacheStorage/registration predicates before accepting them.
  async function waitForState(page, predicate, arg) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (await evaluate(page, predicate, arg)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Offline update did not reach its expected state.');
  }
  try {
    console.log(`[${browserName}] Offline navigation: installing the current release.`);
    const context = await browser.newContext(); contexts.push(context);
    let page = await context.newPage();
    await page.goto(base); await homepage(page); await waitControlled(page);
    const cached = await evaluate(page, async () => {
      const names = await caches.keys();
      const response = await (await caches.open(names.find(name => name.startsWith('comp-sim-')))).match('/');
      return { redirected: response.redirected, status: response.status };
    });
    assert.deepEqual(cached, { redirected: false, status: 200 });
    console.log(`[${browserName}] Offline navigation: online reloads and failed-network fallback.`);
    release = 'latest-online';
    for (let i = 0; i < 3; i++) { await page.reload(); await homepage(page); }
    assert.equal(await page.locator('html').getAttribute('data-release'), 'latest-online', 'Online navigation must bypass the installed shell.');
    shellUnavailable = true;
    await page.reload(); await homepage(page);
    assert.equal(await page.locator('html').getAttribute('data-release'), 'installed', 'A server failure must retain the complete installed release.');
    shellUnavailable = false;
    await page.close(); page = await context.newPage(); await page.goto(base); await homepage(page);
    await setOffline(context, true);
    await page.reload(); await homepage(page);
    await page.goto(base + '/saved-round?fixture=offline'); await homepage(page);
    assert.equal(await page.locator('html').getAttribute('data-release'), 'installed');
    for (const [route, heading] of [['about', 'Practice the whole round.'], ['privacy', 'Privacy Policy'], ['terms', 'Terms of Service']]) {
      await page.goto(`${base}/${route}/`);
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      await page.reload();
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    }
    await page.goto(base); await homepage(page);
    await setOffline(context, false);

    console.log(`[${browserName}] Offline navigation: safe waiting-worker activation.`);
    // A new worker may download during a round, but updating requires a safe idle
    // screen and one app window. Never discard browser data to fix a stale build.
    await evaluate(page, () => localStorage.setItem('offline-update-fixture', 'keep-local-data'));
    await page.getByRole('button', { name: 'Start CompSim', exact: true }).click();
    await page.locator('[data-round-active="true"]').waitFor();
    const oldCache = fixedWorker.match(/const CACHE='([^']+)'/)[1];
    const updatedCache = oldCache + '-update-fixture';
    worker = fixedWorker.replace(oldCache, updatedCache);
    await evaluate(page, async () => (await navigator.serviceWorker.getRegistration()).update());
    const updateButton = page.getByRole('button', { name: 'Update site', exact: true });
    await updateButton.waitFor();
    assert.ok(await updateButton.isDisabled(), 'A pending update must never interrupt an unfinished round.');
    assert.ok(await evaluate(page, async name => (await caches.keys()).includes(name), oldCache));
    await page.getByRole('button', { name: 'End Round', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'End Round', exact: true }).click();
    await homepage(page);
    const anotherTab = await context.newPage(); await anotherTab.goto(base); await homepage(anotherTab);
    await page.bringToFront();
    await updateButton.click();
    await page.getByText('Close other CompSim tabs, then try again.', { exact: true }).waitFor();
    assert.ok(await evaluate(page, async () => !!(await navigator.serviceWorker.getRegistration()).waiting));
    await anotherTab.close();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    assert.ok(await updateButton.isDisabled(), 'Updating must not interrupt a settings/account dialog.');
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await Promise.all([page.waitForEvent('load'), updateButton.click()]);
    await homepage(page);
    await waitForState(page, async name => !(await caches.keys()).includes(name), oldCache);
    assert.equal(await page.locator('html').getAttribute('data-release'), 'latest-online');
    assert.equal(await evaluate(page, () => localStorage.getItem('offline-update-fixture')), 'keep-local-data');
    await setOffline(context, true); await page.reload(); await homepage(page);
    assert.equal(await page.locator('html').getAttribute('data-release'), 'latest-online', 'Explicit activation must make the new release available offline.');
    await setOffline(context, false);
    await context.close();

    console.log(`[${browserName}] Offline navigation: legacy redirected-cache repair.`);
    worker = legacyWorker;
    const legacyContext = await browser.newContext(); contexts.push(legacyContext);
    const original = await legacyContext.newPage();
    await original.goto(base); await homepage(original); await waitControlled(original);
    await evaluate(original, async () => {
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
    assert.equal(await evaluate(original, async name => (await (await caches.open(name)).match('/index.html')).redirected, legacyCache), true);
    const revisit = await legacyContext.newPage();
    let failed = false;
    try { await revisit.goto(base, { timeout: 10000 }); } catch { failed = true; }
    // Chromium rejects the redirected navigation response; Firefox tolerates it.
    // Require the reported Chrome failure, and verify repair/reloads in every engine.
    if (browserName === 'chromium') assert.ok(failed, 'The legacy redirected shell must reproduce the Chrome navigation failure.');

    worker = fixedWorker;
    await evaluate(original, async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
    });
    await waitForState(original, async name => {
      const response = await (await caches.open(name)).match('/index.html');
      return !!(await navigator.serviceWorker.getRegistration()).waiting && response?.redirected === false;
    }, legacyCache);
    const repaired = await evaluate(original, async name => ({
      redirected: (await (await caches.open(name)).match('/index.html')).redirected,
      activeIsLegacy: (await caches.keys()).includes(name),
    }), legacyCache);
    assert.deepEqual(repaired, { redirected: false, activeIsLegacy: true });
    await revisit.goto(base); await homepage(revisit);
    await revisit.reload(); await homepage(revisit);
    await setOffline(legacyContext, true);
    await revisit.reload(); await homepage(revisit);
    const retained = await evaluate(revisit, async () => {
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
    await setOffline(legacyContext, false);
    console.log(`[${browserName}] Offline navigation: legacy activation and final offline reload.`);
    await original.close(); await revisit.close();
    const afterActivation = await legacyContext.newPage();
    await afterActivation.goto(base); await homepage(afterActivation); await waitControlled(afterActivation);
    await waitForState(afterActivation, async name => !(await caches.keys()).includes(name), legacyCache);
    await setOffline(legacyContext, true); await afterActivation.reload(); await homepage(afterActivation);
    return `legacy redirected navigation ${failed ? 'rejected' : 'accepted'}; latest online shell, server-failure/offline fallback, active-round/dialog/multitab update guards, explicit activation, legacy repair and stored-data preservation passed`;
  } catch (error) {
    console.error(`[${browserName}] Offline navigation failed:`, error);
    throw error;
  } finally {
    console.log(`[${browserName}] Offline navigation: restoring networking and closing fixtures.`);
    // WebKit can leave pending service-worker requests while emulated offline.
    // Restore the fixture connection before closing contexts, then terminate
    // remaining HTTP sockets so cleanup cannot conceal an assertion failure.
    networkUnavailable = false;
    try {
      for (const context of contexts) {
        await bounded(context.setOffline(false).catch(() => undefined), 'offline cleanup network restore', 10_000);
        await bounded(context.close(), 'offline browser-context cleanup', 10_000);
      }
    } finally {
      server.closeAllConnections();
      await bounded(new Promise(resolve => server.close(resolve)), 'offline HTTP server cleanup', 10_000);
    }
  }
}
