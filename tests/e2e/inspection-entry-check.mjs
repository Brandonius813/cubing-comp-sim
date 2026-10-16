import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const [mode, key] of [['manual', '1'], ['timer', 'Numpad1'], ['manual', null], ['timer', null]]) {
    console.log('Checking', mode, key);
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
    await page.waitForSelector('[data-phase="home"]');
    await page.evaluate(async mode => {
      const { BrowserStore, DEFAULT_SETTINGS } = await import('/src/storage/index.ts');
      const { createRound } = await import('/src/core/index.ts');
      const store = new BrowserStore();
      let state = await store.load();
      state = await store.saveSettings({ ...DEFAULT_SETTINGS, inputMethod: mode, waitEnabled: false, holdMs: 0 }, state.revision);
      const round = createRound('333');
      state = await store.saveRound(round, state.revision);
      await store.saveDraft({ roundId: round.id, stage: 'scramble', savedAt: Date.now(), scramble: { eventId: '333', notation: 'R U', svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', engineVersion: 'test', generatedAt: Date.now() } }, state.revision);
    }, mode);
    await page.reload();
    await page.waitForSelector('[data-phase="scramble"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-phase="ready"]');
    await page.locator('.save-status').waitFor({ state: 'hidden' });
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-phase="inspection"]');
    await page.locator('.save-status').waitFor({ state: 'hidden' });
    await page.evaluate(() => { const now = performance.now.bind(performance); performance.now = () => now() + 20000; });
    await page.waitForFunction(() => Number(document.querySelector('.timer-number')?.textContent) >= 20);
    assert.equal(await page.locator('.inspection-penalty').count(), mode === 'timer' ? 1 : 0);
    if (key) {
      if (key.startsWith('Numpad')) await page.locator('.main-stage').dispatchEvent('keydown', { key: '1', code: key, bubbles: true });
      else await page.keyboard.press(key);
      await page.waitForSelector('#manual-time');
      assert.equal(await page.locator('#manual-time').inputValue(), '1');
      await page.keyboard.type('234');
      assert.equal(await page.locator('#manual-time').inputValue(), '1234');
      await page.keyboard.press('Enter');
    } else if (mode === 'manual') {
      await page.keyboard.press('Enter');
      await page.waitForSelector('#manual-time');
      await page.keyboard.type('1234');
      await page.keyboard.press('Enter');
    } else {
      await page.keyboard.press('Space');
      await page.waitForSelector('[data-phase="solving"]');
      await page.keyboard.press('Space');
    }
    await page.waitForFunction(async () => {
      const { BrowserStore } = await import('/src/storage/index.ts');
      return (await new BrowserStore().load()).rounds.some(r => r.attempts.length);
    });
    const attempt = await page.evaluate(async () => {
      const { BrowserStore } = await import('/src/storage/index.ts');
      return (await new BrowserStore().load()).rounds[0].attempts[0];
    });
    assert.equal(attempt.inspectionPenalty, mode === 'timer' && !key ? 'DNF' : 'none');
    if (key || mode === 'manual') { assert.equal(attempt.rawMs, 12340); assert.equal(attempt.inputMethod, 'manual'); }

    if (mode === 'timer' && !key) {
      await page.locator('.save-status').waitFor({ state: 'hidden' });
      const quickDnf = page.locator('.scorecard-penalty-controls').first().getByRole('button', { name: 'DNF', exact: true });
      assert.equal(await quickDnf.getAttribute('aria-pressed'), 'true');
      await page.locator('.scorecard-time').first().click();
      const dialog = page.getByRole('dialog');
      assert.equal(await dialog.locator('.penalty-buttons button').count(), 2);
      assert.equal(await dialog.getByRole('combobox').count(), 0);
      const dnf = dialog.getByRole('button', { name: 'DNF', exact: true });
      assert.equal(await dnf.getAttribute('aria-pressed'), 'true');
      await dnf.click();
      await dialog.locator('button[type=submit]').click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await quickDnf.getAttribute('aria-pressed'), 'false');
      await page.reload();
      await page.waitForSelector('[data-phase="home"]');
      const restored = await page.evaluate(async () => {
        const { BrowserStore } = await import('/src/storage/index.ts');
        return (await new BrowserStore().load()).rounds[0].attempts[0];
      });
      assert.equal(restored.penalty, 'none');
      assert.equal(restored.inspectionPenalty, 'none');
    }
    await page.close();
  }
  console.log('Late typed entry, first digit, numpad override, manual advance, and keyboard inspection DNF passed.');
} finally { await browser.close(); await server.close(); }
