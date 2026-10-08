import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkOfflineWorker } from './engine-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactRoot = process.env.CCS_BROWSER_ARTIFACT_DIR ?? path.join(root, 'test-results/browser');

async function screenshots(page, name, artifacts) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  for (const [width, height] of [[1440, 900], [2560, 1440]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: path.join(artifacts, `${name}-${width}x${height}.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflows horizontally at ${width} pixels.`);
    if (name === 'home') assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), 'The desktop home screen should fit its viewport.');
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
}

async function phase(page, value, timeout = 15_000) {
  await page.locator(`[data-phase="${value}"]`).waitFor({ state: 'visible', timeout });
}

async function savedAttemptCount(page, expected) {
  await page.waitForFunction(async count => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cubing-comp-sim');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const rows = await new Promise((resolve, reject) => {
        const transaction = database.transaction('rounds', 'readonly');
        const request = transaction.objectStore('rounds').getAll();
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error);
      });
      return rows.reduce((sum, round) => sum + round.attempts.length, 0) === count;
    } finally { database.close(); }
  }, expected);
}

async function configureInput(page, mode, captureDirectory) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  if (captureDirectory) await screenshots(page, 'settings', captureDirectory);
  await dialog.getByLabel('Solve input', { exact: true }).selectOption(mode);
  const inspection = dialog.getByRole('switch', { name: 'Inspection', exact: true });
  if (await inspection.getAttribute('aria-checked') === 'true') await inspection.click();
  await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="Inspection"]')?.getAttribute('aria-checked') === 'false');
  if (mode === 'timer') await dialog.getByLabel('Hold to start', { exact: true }).fill('0');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
}

async function checkLanguagePersistence(page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const english = page.getByRole('dialog', { name: 'Settings', exact: true });
  await english.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await english.getByLabel('Language', { exact: true }).selectOption('es');
  const spanish = page.getByRole('dialog', { name: 'Ajustes', exact: true });
  await spanish.waitFor();
  assert.equal(await spanish.getByLabel('Idioma', { exact: true }).inputValue(), 'es');
  await spanish.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar CompSim', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Iniciar CompSim', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'es');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  const restoredSpanish = page.getByRole('dialog', { name: 'Ajustes', exact: true });
  await restoredSpanish.getByRole('tab', { name: 'Apariencia', exact: true }).click();
  assert.equal(await restoredSpanish.getByLabel('Idioma', { exact: true }).inputValue(), 'es');
  await restoredSpanish.getByLabel('Idioma', { exact: true }).selectOption('en');
  await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Start CompSim', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
}

async function timerSettingsPersisted(page) {
  await page.waitForFunction(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cubing-comp-sim');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const settings = await new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readonly');
        const request = tx.objectStore('meta').get('state');
        tx.oncomplete = () => resolve(request.result?.settings);
        tx.onabort = () => reject(tx.error);
      });
      return settings?.inputMethod === 'timer' && settings.inspection === false && settings.holdMs === 0;
    } finally { db.close(); }
  });
}

async function failureDiagnostics(page) {
  return page.evaluate(async () => {
    const details = {
      phase: document.querySelector('[data-phase]')?.getAttribute('data-phase'),
      activeElementTag: document.activeElement?.tagName,
      activeElementId: document.activeElement?.id,
      savingVisible: Boolean(document.querySelector('.save-status')),
      savingText: document.querySelector('.save-status')?.textContent ?? null,
    };
    const stored = await new Promise(resolve => {
      const timeout = setTimeout(() => resolve({ storageError: 'metadata-read-timeout' }), 3000);
      const finish = value => { clearTimeout(timeout); resolve(value); };
      const request = indexedDB.open('cubing-comp-sim');
      request.onerror = () => finish({ storageError: request.error?.name });
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('meta', 'readonly');
        const metadata = tx.objectStore('meta').get('state');
        tx.oncomplete = () => {
          const state = metadata.result;
          db.close();
          finish({ revision: state?.revision, settings: state?.settings, draftStage: state?.draft?.stage ?? null });
        };
        tx.onabort = () => { db.close(); finish({ storageError: tx.error?.name }); };
      };
    });
    return { ...details, ...stored };
  });
}

async function checkStoredSvgIsolation(page) {
  await page.addInitScript(() => { window.svgTestExecuted = false; });
  await page.evaluate(async () => {
    const now = Date.now();
    const id = crypto.randomUUID();
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cubing-comp-sim');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      // Adversarial stored-data fixture only. This is never used as a scramble engine.
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="parent.svgTestExecuted=true"><script>parent.svgTestExecuted=true</script><rect width="10" height="10" fill="red"/></svg>';
      await new Promise((resolve, reject) => {
        const tx = database.transaction(['meta', 'rounds'], 'readwrite');
        const metaStore = tx.objectStore('meta');
        const request = metaStore.get('state');
        request.onsuccess = () => {
          const meta = request.result;
          tx.objectStore('rounds').put({ id, eventId: '333', format: 'ao5', attempts: [], createdAt: now, updatedAt: now });
          metaStore.put({ ...meta, revision: meta.revision + 1, activeRoundId: id, draft: { roundId: id, stage: 'scramble', savedAt: now, scramble: { eventId: '333', notation: '<script>window.svgTestExecuted=true</script>', svg, engineVersion: 'adversarial-test-only', generatedAt: now } } });
        };
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
    } finally { database.close(); }
  });
  await page.reload();
  await phase(page, 'scramble');
  await page.locator('img.scramble-drawing').evaluate(image => image.decode());
  assert.equal(await page.evaluate(() => window.svgTestExecuted), false, 'Stored SVG executed script in the application.');
  assert.equal(await page.locator('.drawing-area svg, .scramble-notation script').count(), 0, 'Untrusted save content was inserted as DOM markup.');
}

export async function checkDesktopApp(browser, baseUrl, { browserName = 'chromium' } = {}) {
  assert.ok(['chromium', 'firefox', 'webkit'].includes(browserName), 'Unknown browser artifact directory.');
  const artifacts = path.join(artifactRoot, browserName);
  await mkdir(artifacts, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(baseUrl);
    await page.getByRole('button', { name: 'Start CompSim', exact: true }).waitFor();
    await screenshots(page, 'home', artifacts);
    await page.locator('button.event-selector').click();
    const eventPicker = page.getByRole('dialog', { name: 'Choose event', exact: true });
    assert.equal(await eventPicker.locator('.event-list button').count(), 16);
    assert.equal((await eventPicker.locator('.event-list button').last().innerText()).trim(), 'Clock');
    await screenshots(page, 'events', artifacts);
    // The Figma event dropdown intentionally has no visible dialog header.
    await page.keyboard.press('Escape');
    await eventPicker.waitFor({ state: 'hidden' });
    await checkLanguagePersistence(page);
    await configureInput(page, 'manual', artifacts);
    await page.getByRole('button', { name: 'Start CompSim', exact: true }).click();
    for (let index = 0; index < 5; index++) {
      await phase(page, 'scramble', 180_000);
      if (index === 0) await screenshots(page, 'scramble', artifacts);
      await page.getByRole('button', { name: 'Scramble is good', exact: true }).click();
      await phase(page, 'ready');
      await page.getByRole('button', { name: 'Ready', exact: true }).click();
      await phase(page, 'entry');
      await page.getByLabel('Time', { exact: true }).fill(String(10 + index));
      await page.getByRole('button', { name: 'Submit', exact: true }).click();
      await savedAttemptCount(page, index + 1);
    }
    await phase(page, 'complete');
    assert.equal(await page.locator('.scorecard-average strong').innerText(), '12.00');
    assert.deepEqual(await page.locator('.possible-results > div > span:last-child').allTextContents(), ['11.00', '12.00'], 'Completed rounds retain their pre-final-attempt bounds.');
    await screenshots(page, 'completed-round', artifacts);
    await page.reload();
    await phase(page, 'home');
    assert.equal(await page.locator('.scorecard-average strong').innerText(), '12.00');
    assert.deepEqual(await page.locator('.possible-results > div > span:last-child').allTextContents(), ['11.00', '12.00'], 'Completed rounds retain their pre-final-attempt bounds.');
    await savedAttemptCount(page, 5);

    await configureInput(page, 'timer');
    await timerSettingsPersisted(page);
    await page.getByRole('button', { name: 'Start CompSim', exact: true }).click();
    await phase(page, 'scramble', 180_000);
    await page.getByRole('button', { name: 'Scramble is good', exact: true }).click();
    await phase(page, 'ready');
    await page.keyboard.press('Enter');
    await phase(page, 'ready');
    await page.keyboard.press('KeyA');
    await phase(page, 'ready');
    await page.keyboard.press('Space');
    await phase(page, 'solving');
    await page.keyboard.press('KeyA');
    await phase(page, 'confirm');
    await savedAttemptCount(page, 6);

    // This is the built service worker, not browser HTTP cache alone.
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 180_000 });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const connectivity = page.getByRole('dialog', { name: 'Settings', exact: true });
    await connectivity.getByText('Online', { exact: true }).waitFor();
    await context.route('**/connection-check.json', route => route.abort());
    await connectivity.getByRole('button', { name: 'Check connection', exact: true }).click();
    await connectivity.getByText('Connection unavailable', { exact: true }).waitFor();
    await context.unroute('**/connection-check.json');
    await connectivity.getByRole('button', { name: 'Close', exact: true }).click();
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('dialog', { name: 'Settings', exact: true }).getByText('Offline', { exact: true }).waitFor();
    await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
    await savedAttemptCount(page, 6);
    const assets = await readdir(path.join(root, 'dist/assets'));
    const worker = assets.filter(name => /^worker-.*\.js$/.test(name));
    assert.equal(worker.length, 1, 'Expected the compiled scramble worker asset.');
    const timing = await checkOfflineWorker(page, `/assets/${worker[0]}`);
    // Exercise the destructive import UI only after saving and offline checks.
    await page.locator('button.event-selector').click();
    const returnPicker = page.getByRole('dialog', { name: 'Choose event', exact: true });
    await returnPicker.getByRole('button', { name: '3×3 Cube', exact: true }).click();
    await returnPicker.waitFor({ state: 'hidden' });
    await phase(page, 'home');
    await savedAttemptCount(page, 6);
    await page.getByRole('button', { name: 'View all stats', exact: true }).click();
    await page.getByLabel('Import history file', { exact: true }).setInputFiles({ name: 'invalid-save.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":999}') });
    await page.getByRole('button', { name: 'Replace history', exact: true }).click();
    await page.getByRole('dialog').getByRole('alert').waitFor();
    await savedAttemptCount(page, 6);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'View all stats', exact: true }).click();
    const emptySave = { app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: Date.now(), rounds: [], activeRoundId: null };
    await page.getByLabel('Import history file', { exact: true }).setInputFiles({ name: 'empty-save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(emptySave)) });
    await page.getByRole('button', { name: 'Replace history', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await savedAttemptCount(page, 0);
    await checkStoredSvgIsolation(page);
    assert.deepEqual(errors, [], 'The browser emitted an uncaught application error.');
    return `Desktop browser: Spanish settings persistence, manual Ao5 and reload, keyboard start/stop, offline reload, and 16 offline event drawings passed. Generation milliseconds: ${JSON.stringify(timing)}`;
  } catch (error) {
    const diagnostics = await failureDiagnostics(page).catch(cause => ({ diagnosticError: String(cause) }));
    console.error(`Browser fixture diagnostics:\n${JSON.stringify(diagnostics, null, 2)}`);
    await writeFile(path.join(artifacts, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2));
    await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await context.tracing.stop({ path: path.join(artifacts, 'trace.zip') });
    await context.close();
  }
}
