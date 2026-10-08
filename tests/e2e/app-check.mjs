import assert from 'node:assert/strict';
import { mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkOfflineWorker } from './engine-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = process.env.CCS_BROWSER_ARTIFACT_DIR ?? path.join(root, 'test-results/browser');

async function screenshots(page, name) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  for (const [width, height] of [[1440, 900], [2560, 1440]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: path.join(artifacts, `${name}-${width}x${height}.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflows horizontally at ${width} pixels.`);
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

async function configureInput(page, mode) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await dialog.getByLabel('Solve input', { exact: true }).selectOption(mode);
  const inspection = dialog.getByRole('switch', { name: 'Inspection', exact: true });
  if (await inspection.getAttribute('aria-checked') === 'true') await inspection.click();
  await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="Inspection"]')?.getAttribute('aria-checked') === 'false');
  if (mode === 'timer') await dialog.getByLabel('Hold to start', { exact: true }).fill('0');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
}

export async function checkDesktopApp(browser, baseUrl) {
  await mkdir(artifacts, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(baseUrl);
    await page.getByRole('button', { name: 'Start CompSim', exact: true }).waitFor();
    await screenshots(page, 'home');
    await configureInput(page, 'manual');
    await page.getByRole('button', { name: 'Start CompSim', exact: true }).click();
    for (let index = 0; index < 5; index++) {
      await phase(page, 'scramble', 180_000);
      if (index === 0) await screenshots(page, 'scramble');
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
    await screenshots(page, 'completed-round');
    await page.reload();
    await phase(page, 'home');
    assert.equal(await page.locator('.scorecard-average strong').innerText(), '12.00');
    await savedAttemptCount(page, 5);

    await configureInput(page, 'timer');
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
    assert.deepEqual(errors, [], 'The browser emitted an uncaught application error.');
    return `Desktop browser: manual Ao5 and reload, keyboard start/stop, offline reload, and 16 offline event drawings passed. Generation milliseconds: ${JSON.stringify(timing)}`;
  } catch (error) {
    await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await context.tracing.stop({ path: path.join(artifacts, 'trace.zip') });
    await context.close();
  }
}
