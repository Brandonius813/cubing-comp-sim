import './check-information-locales.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';
const catalogs = JSON.parse(await readFile('src/ui/locales/extended.json', 'utf8'));
const information = JSON.parse(await readFile('public/information-locales.json', 'utf8'));
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
let browser;
let staticServer;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const settled = () => page.locator('.save-status').waitFor({ state: 'hidden' });
  await page.goto(base);
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Settings"]').disabled);
  // Seed through the application's real storage API; no production accounts or data.
  await page.evaluate(async () => {
    const { BrowserStore } = await import('/src/storage/index.ts');
    const { createRound, createAttempt, addAttempt } = await import('/src/core/index.ts');
    const store = new BrowserStore({ broadcast: false });
    const state = await store.load();
    let round = createRound('333');
    for (let i = 0; i < 5; i++) round = addAttempt(round, createAttempt(round, { rawMs: 12000, inspectionMs: i < 2 ? 17000 : 10000, inputMethod: 'timer', scramble: { eventId: '333', notation: 'R U', svg: '<svg/>', engineVersion: 'browser-fixture', generatedAt: 1 } }));
    await store.replaceFromJson(JSON.stringify({ app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: Date.now(), rounds: [round], activeRoundId: round.id }), state.revision);
  });
  await page.reload();
  await page.locator('.scorecard-time:not([disabled])').first().waitFor();
  assert.match(await page.locator('.scorecard-time').first().textContent(), /DNF/);
  await page.locator('.scorecard-time').first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Inspection penalty', exact: true }).click();
  await page.getByRole('option', { name: 'None', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await settled();
  assert.equal((await page.locator('.scorecard-time').first().textContent()).trim(), '12.00');
  assert.equal((await page.locator('.scorecard-average strong').textContent()).trim(), '12.00');
  await page.reload();
  await page.locator('.scorecard-time:not([disabled])').first().waitFor();
  assert.equal((await page.locator('.scorecard-time').first().textContent()).trim(), '12.00');
  // Every locale must immediately update the currently open settings dialog.
  for (const locale of Object.keys(catalogs)) {
    await page.locator('button[aria-label]').filter({ has: page.locator('img[src="/assets/settings.svg"]') }).click();
    await page.getByRole('tab').nth(1).click();
    await page.getByRole('combobox').nth(0).click();
    await page.locator(`[role="option"][data-value="${locale}"]`).click();
    await page.waitForFunction(locale => document.documentElement.lang === locale, locale);
    await settled();
    assert.ok((await page.getByRole('dialog').textContent()).includes(catalogs[locale].textFont));
    assert.ok((await page.getByRole('dialog').textContent()).includes(catalogs[locale].light));
    await page.getByRole('tab').nth(3).click();
    assert.equal(await page.locator('.settings-information-links a').nth(0).textContent(), catalogs[locale].about);
    assert.match(await page.locator('.settings-information-links a').nth(1).getAttribute('href'), new RegExp(`lang=${locale}`));
    await page.locator('.dialog-header .icon-button').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  // Directory index routes are served by the production static server, not Vite's dev public-file middleware.
  staticServer = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false } });
  const informationBase = `http://127.0.0.1:${staticServer.httpServer.address().port}`;
  for (const locale of ['es', 'de', 'ja', 'zh-Hans', 'ko']) {
    for (const path of ['about', 'privacy', 'terms']) {
      await page.goto(`${informationBase}/${path}/?lang=${locale}`);
      await page.waitForFunction(locale => document.documentElement.lang === locale, locale);
      await page.locator('.information-language select').waitFor();
      assert.equal(await page.locator('.information-language select').inputValue(), locale);
      const originalHeading = { about: 'Practice the whole round.', privacy: 'Privacy Policy', terms: 'Terms of Service' }[path];
      assert.equal(await page.locator('h1').textContent(), information[locale][originalHeading]);
      assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
    }
  }
  console.log('PASS: inspection DNF correction updates scorecard/average and persists; all language switches; standalone information pages.');
} finally { await browser?.close(); await server.close(); await staticServer?.close(); }
