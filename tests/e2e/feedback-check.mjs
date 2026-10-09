import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactRoot = process.env.CCS_BROWSER_ARTIFACT_DIR ?? path.join(root, 'test-results/browser');
const phase = (page, value) => page.locator(`[data-phase="${value}"]`).waitFor({ state: 'visible', timeout: value === 'scramble' ? 180_000 : 15_000 });
const outsideFocus = page => page.evaluate(() => document.activeElement?.blur());
const settled = page => page.locator('.save-status').waitFor({ state: 'hidden' });
async function advance(page, key = 'Space') { await settled(page); await outsideFocus(page); await page.keyboard.press(key); }
async function settings(page, tab) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  if (tab) await dialog.getByRole('tab', { name: tab, exact: true }).click();
  return dialog;
}
async function choose(page, label, value) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.locator(`[role="option"][data-value="${value}"]`).click();
  await settled(page);
}
async function toggle(dialog, label, desired) {
  const control = dialog.getByRole('switch', { name: label, exact: true });
  if (await control.getAttribute('aria-checked') !== String(desired)) await control.click();
  await settled(dialog.page());
}
async function closeSettings(dialog) { await settled(dialog.page()); await dialog.getByRole('button', { name: 'Close', exact: true }).click(); }
async function assertCard(page) {
  assert.equal(await page.locator('.scorecard-wrap').count(), 1, 'Every phase must show the shared scorecard.');
  assert.ok(await page.evaluate(() => window.feedbackCard === document.querySelector('.scorecard-wrap')), 'The scorecard was replaced between phases.');
}
async function capture(page, name, directory) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} has horizontal overflow.`);
}
async function compactCentered(dialog) {
  const box = await dialog.boundingBox();
  const viewport = dialog.page().viewportSize();
  assert.ok(box.width <= 600 && box.height < viewport.height * 0.8, 'Dialog should be compact.');
  assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) < 3, 'Dialog is not horizontally centered.');
  assert.ok(Math.abs(box.y + box.height / 2 - viewport.height / 2) < 3, 'Dialog is not vertically centered.');
}
async function savedAttempts(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('cubing-comp-sim'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      return await new Promise((resolve, reject) => { const tx = db.transaction('rounds', 'readonly'); const request = tx.objectStore('rounds').getAll(); tx.oncomplete = () => resolve(request.result.flatMap(round => round.attempts)); tx.onabort = () => reject(tx.error); });
    } finally { db.close(); }
  });
}

async function persistedRoundState(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('cubing-comp-sim'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(['meta', 'rounds'], 'readonly');
        const metadata = tx.objectStore('meta').get('state');
        const rounds = tx.objectStore('rounds').getAll();
        tx.oncomplete = () => resolve({ activeRoundId: metadata.result.activeRoundId, draft: metadata.result.draft, revision: metadata.result.revision, settings: metadata.result.settings, rounds: rounds.result });
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
}
async function openEndRound(page) {
  await page.locator('.end-round-button').click();
  const dialog = page.getByRole('dialog', { name: 'End this round?', exact: true });
  await dialog.waitFor();
  return dialog;
}
async function checkDiscardedHistory(page, retainedRounds) {
  const persisted = await persistedRoundState(page);
  assert.equal(persisted.activeRoundId, null);
  assert.equal(persisted.draft, null);
  assert.deepEqual(persisted.rounds, retainedRounds, 'Discard changed completed history or retained the unfinished round.');
  await page.getByRole('button', { name: 'View all stats', exact: true }).click();
  const statistics = page.getByRole('dialog', { name: 'Statistics', exact: true });
  const count = retainedRounds.reduce((total, round) => total + round.attempts.length, 0);
  assert.equal(await statistics.locator('.statistics-summary > div').first().locator('dd').innerText(), String(count));
  assert.equal(await statistics.locator('.statistics-attempts button').count(), count, 'Statistics still displays discarded attempts.');
  const downloading = page.waitForEvent('download');
  await statistics.getByRole('button', { name: 'Export history', exact: true }).click();
  const download = await downloading;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.deepEqual(exported.rounds.map(round => round.id).sort(), retainedRounds.map(round => round.id).sort(), 'Export includes a discarded round.');
  assert.equal(exported.rounds.reduce((total, round) => total + round.attempts.length, 0), count);
  assert.equal(exported.activeRoundId, null);
  await download.delete();
  await statistics.getByRole('button', { name: 'Close', exact: true }).click();
}
async function recordManualAttempt(page, time) {
  await advance(page); await phase(page, 'ready');
  await advance(page); await phase(page, 'entry');
  await page.getByLabel('Time', { exact: true }).fill(time);
  await page.keyboard.press('Enter'); await phase(page, 'scramble');
}
async function checkRoundExits(page, artifacts) {
  const retained = (await persistedRoundState(page)).rounds;
  assert.ok(retained.length > 0 && retained.every(round => round.completedAt !== undefined), 'Discard checks require completed history to protect.');
  assert.equal(await page.getByRole('button', { name: 'End Round', exact: true }).count(), 0, 'Home should not offer to end a nonexistent round.');
  let dialog = await settings(page);
  await toggle(dialog, 'Wait between solves', false);
  await choose(page, 'Solve input', 'manual'); await toggle(dialog, 'Inspection', false);
  await closeSettings(dialog);
  await advance(page); await phase(page, 'scramble');
  await recordManualAttempt(page, '61'); await recordManualAttempt(page, '62');
  const prior = await persistedRoundState(page);
  const notation = await page.locator('.scramble-notation').innerText();
  assert.equal(prior.rounds.find(round => round.id === prior.activeRoundId).attempts.length, 2);
  const endButton = await page.locator('.end-round-button').boundingBox();
  assert.ok(endButton.width < 180 && endButton.height <= 48, 'End Round should be a small secondary control.');
  for (const cancel of ['close', 'back', 'backdrop']) {
    dialog = await openEndRound(page); await compactCentered(dialog);
    if (cancel === 'close') await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    else if (cancel === 'back') await dialog.getByRole('button', { name: 'Go back', exact: true }).click();
    else await page.mouse.click(5, 5);
    await dialog.waitFor({ state: 'hidden' }); await phase(page, 'scramble');
    assert.equal(await page.locator('.scramble-notation').innerText(), notation, 'Canceling End Round replaced the current scramble.');
    assert.deepEqual(await persistedRoundState(page), prior, 'Canceling End Round changed the active round or saved attempts.');
  }
  dialog = await openEndRound(page); await capture(page, 'end-round-confirmation', artifacts);
  await dialog.getByRole('button', { name: 'End Round', exact: true }).click(); await phase(page, 'home');
  await checkDiscardedHistory(page, retained);
  assert.equal(await page.locator('.scorecard-time:not(:disabled)').count(), 0, 'Ending a round must clear the scorecard.');
  await page.reload(); await phase(page, 'home'); await checkDiscardedHistory(page, retained);

  // Confirming an event change follows the same deletion rule as End Round.
  await advance(page); await phase(page, 'scramble');
  await recordManualAttempt(page, '63'); await recordManualAttempt(page, '64');
  const beforeEvent = await persistedRoundState(page);
  assert.equal(beforeEvent.rounds.find(round => round.id === beforeEvent.activeRoundId).attempts.length, 2);
  await page.locator('.event-selector').click();
  await page.getByRole('dialog', { name: 'Choose event', exact: true }).getByRole('button', { name: '3×3 Cube', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Change event?', exact: true });
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click(); await phase(page, 'home');
  assert.match(await page.locator('.event-selector').innerText(), /3×3/);
  await checkDiscardedHistory(page, retained);
  await page.reload(); await phase(page, 'home'); await checkDiscardedHistory(page, retained);

  // Hold delivery of a genuine engine result while discarding its pending round.
  await page.evaluate(() => { window.feedbackWorkerHold = true; });
  await advance(page);
  await page.waitForFunction(() => window.feedbackWorkerMessages.length === 1, undefined, { timeout: 180_000 });
  await phase(page, 'loading');
  dialog = await openEndRound(page);
  await dialog.getByRole('button', { name: 'End Round', exact: true }).click(); await phase(page, 'home');
  await page.evaluate(() => {
    window.feedbackWorkerHold = false;
    for (const { worker, data } of window.feedbackWorkerMessages.splice(0)) worker.dispatchEvent(new MessageEvent('message', { data }));
  });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-phase]').getAttribute('data-phase'), 'home');
  await page.reload(); await phase(page, 'home'); await checkDiscardedHistory(page, retained);
}
async function checkSettingsWidth(page, dialog) {
  const snapshot = () => dialog.locator('.settings-tabs').evaluate(element => { const box = element.getBoundingClientRect(); return { x: box.x, width: box.width }; });
  const overflowing = () => dialog.locator('.dialog-body').evaluate(element => element.scrollHeight > element.clientHeight + 1);
  let exercisedOverflow = false;
  for (const height of [900, 840, 780, 720]) {
    await page.setViewportSize({ width: 1440, height });
    await dialog.getByRole('tab', { name: 'Simulation', exact: true }).click();
    const baseline = await snapshot();
    const simulationOverflow = await overflowing();
    await dialog.getByRole('tab', { name: 'Shortcuts', exact: true }).click();
    const shortcuts = await snapshot();
    const shortcutsOverflow = await overflowing();
    assert.ok(Math.abs(baseline.x - shortcuts.x) < 1 && Math.abs(baseline.width - shortcuts.width) < 1, 'Settings content shifts when the Shortcuts scrollbar appears.');
    await dialog.getByRole('tab', { name: 'Simulation', exact: true }).click();
    const returned = await snapshot();
    assert.ok(Math.abs(baseline.x - returned.x) < 1 && Math.abs(baseline.width - returned.width) < 1, 'Settings content does not return to the same position.');
    if (!simulationOverflow && shortcutsOverflow) { exercisedOverflow = true; break; }
  }
  assert.ok(exercisedOverflow, 'The width regression must exercise a tab that introduces a vertical scrollbar.');
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** User-feedback regressions against the built app and its real offline engine. */
export async function checkFeedbackApp(browser, baseUrl, { browserName = 'chromium' } = {}) {
  const artifacts = path.join(artifactRoot, browserName, 'feedback');
  await mkdir(artifacts, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await context.newPage();
  await page.addInitScript(() => {
    // Delay delivery of a real TNoodle result to exercise cancellation races.
    // Generation itself still runs in the genuine compiled worker.
    window.feedbackWorkerHold = false; window.feedbackWorkerMessages = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        if (options?.name === 'tnoodle') this.addEventListener('message', event => {
          if (window.feedbackWorkerHold && event.data?.type === 'result') {
            event.stopImmediatePropagation();
            window.feedbackWorkerMessages.push({ worker: this, data: event.data });
          }
        });
      }
    };
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  try {
    await page.goto(baseUrl);
    await page.getByRole('button', { name: 'Start CompSim', exact: true }).waitFor();
    let dialog = await settings(page);
    assert.equal(await dialog.getByLabel('Hold to start', { exact: true }).inputValue(), '0.55');
    const header = dialog.locator('.dialog-header');
    await header.getByRole('button', { name: 'Check connection', exact: true }).waitFor();
    assert.equal(await dialog.locator('.dialog-body').getByRole('button', { name: 'Check connection', exact: true }).count(), 0);
    assert.equal(await dialog.getByRole('switch', { name: 'Usage metrics', exact: true }).count(), 0);
    assert.equal(await dialog.getByRole('switch', { name: 'Error reports', exact: true }).count(), 0);
    await checkSettingsWidth(page, dialog);
    for (const [width, height] of [[1440, 900], [2560, 1440]]) {
      await page.setViewportSize({ width, height });
      const control = dialog.getByRole('combobox', { name: 'Solve input', exact: true });
      await control.click();
      const menu = page.getByRole('listbox', { name: 'Solve input', exact: true });
      const [triggerBox, menuBox] = await Promise.all([control.boundingBox(), menu.boundingBox()]);
      assert.ok(Math.abs(triggerBox.x - menuBox.x) < 3 && Math.abs(triggerBox.width - menuBox.width) < 3, 'Dropdown is misaligned with its field.');
      assert.ok(menuBox.y >= triggerBox.y + triggerBox.height && menuBox.y - triggerBox.y - triggerBox.height < 12, 'Dropdown is not anchored below its field.');
      assert.deepEqual(await page.getByRole('option').allTextContents().then(values => values.map(value => value.replace('✓', '').trim())), ['Spacebar', 'Manual Entry']);
      await capture(page, `dropdown-${width}`, artifacts);
      await page.keyboard.press('Escape');
      await dialog.waitFor();
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await dialog.getByRole('tab', { name: 'Appearance', exact: true }).click();
    assert.equal(await dialog.getByRole('switch', { name: 'Show scorecard', exact: true }).count(), 0);
    await dialog.getByRole('radio', { name: 'Light', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await capture(page, 'light-settings', artifacts);
    await dialog.getByRole('radio', { name: 'System', exact: true }).click();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await choose(page, 'Text and labels font', 'georgia');
    await choose(page, 'Numbers and times font', 'arial');
    await dialog.getByRole('tab', { name: 'Shortcuts', exact: true }).click();
    await dialog.getByRole('button', { name: 'Change Advance shortcut', exact: true }).click();
    await page.keyboard.press('KeyN');
    await settled(page);
    await dialog.getByRole('button', { name: 'Change Submit solve shortcut', exact: true }).click();
    await page.keyboard.press('KeyM');
    await closeSettings(dialog);
    await page.reload();
    await phase(page, 'home');
    dialog = await settings(page, 'Appearance');
    assert.equal(await dialog.getByRole('radio', { name: 'System', exact: true }).getAttribute('aria-checked'), 'true');
    assert.equal(await dialog.getByRole('combobox', { name: 'Text and labels font', exact: true }).getAttribute('data-value'), 'georgia');
    assert.equal(await dialog.getByRole('combobox', { name: 'Numbers and times font', exact: true }).getAttribute('data-value'), 'arial');
    assert.match(await page.locator('body').evaluate(element => getComputedStyle(element).fontFamily), /Georgia/);
    assert.match(await page.locator('.scorecard-average strong').evaluate(element => getComputedStyle(element).fontFamily), /Arial/);
    await dialog.getByRole('radio', { name: 'Dark', exact: true }).click();
    await dialog.getByRole('tab', { name: 'Shortcuts', exact: true }).click();
    assert.match(await dialog.getByRole('button', { name: 'Change Advance shortcut', exact: true }).innerText(), /N/);
    assert.match(await dialog.getByRole('button', { name: 'Change Submit solve shortcut', exact: true }).innerText(), /M/);
    await dialog.getByRole('tab', { name: 'Privacy', exact: true }).click();
    await dialog.getByRole('switch', { name: 'Usage metrics', exact: true }).waitFor();
    await dialog.getByRole('switch', { name: 'Error reports', exact: true }).waitFor();
    await closeSettings(dialog);
    await page.evaluate(() => { window.feedbackCard = document.querySelector('.scorecard-wrap'); });
    await advance(page, 'KeyN');
    await phase(page, 'scramble');
    await assertCard(page);
    let laptopDrawingWidth;
    for (const [width, height] of [[1440, 900], [2560, 1440]]) {
      await page.setViewportSize({ width, height });
      const counter = await page.locator('.solve-counter').boundingBox();
      const headerBox = await page.locator('.event-selector').boundingBox();
      assert.ok(counter.y - headerBox.y - headerBox.height < 90, 'Solve counter sits too far below the event selector.');
      const drawing = await page.locator('.scramble-drawing').boundingBox();
      if (width === 1440) laptopDrawingWidth = drawing.width;
      else assert.ok(drawing.width > laptopDrawingWidth * 1.2, 'Desktop scramble drawing does not grow with available space.');
      await capture(page, `scramble-${width}`, artifacts);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await advance(page, 'Space'); await phase(page, 'ready'); await assertCard(page);
    await advance(page, 'Enter'); await phase(page, 'inspection'); await assertCard(page);
    assert.match(await page.locator('.timer-number').innerText(), /^\d+$/, 'Inspection should show whole seconds.');
    const inspectionExit = await openEndRound(page);
    await inspectionExit.getByRole('button', { name: 'Close', exact: true }).click();
    // Deliberately keep the restored focus: Space must resume the timer control.
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('.timer-number')?.classList.contains('error-text'));
    await page.waitForTimeout(150);
    await page.keyboard.up('Space');
    await phase(page, 'inspection');
    await page.keyboard.down('Space');
    await page.getByText('Release to start', { exact: true }).first().waitFor();
    assert.ok(await page.locator('.timer-number').evaluate(element => element.classList.contains('positive-text')), 'Armed timer must turn green before release.');
    await phase(page, 'inspection');
    await capture(page, 'armed-inspection', artifacts);
    await page.keyboard.up('Space'); await phase(page, 'solving'); await assertCard(page);
    const endDuringSolve = await openEndRound(page);
    await compactCentered(endDuringSolve);
    await endDuringSolve.getByRole('button', { name: 'Go back', exact: true }).click();
    await phase(page, 'solving');
    await page.keyboard.press('Space'); await phase(page, 'confirm'); await settled(page); await assertCard(page);
    assert.equal((await savedAttempts(page)).length, 1);
    const first = page.locator('.scorecard-result').first();
    await first.hover();
    const plusTwo = first.getByRole('button', { name: '+2', exact: true });
    await plusTwo.waitFor({ state: 'visible' });
    assert.ok(await plusTwo.evaluate(element => Number(getComputedStyle(element.parentElement).opacity) > 0));
    await plusTwo.click(); await settled(page);
    assert.equal((await savedAttempts(page))[0].penalty, '+2');
    await first.getByRole('button', { name: 'DNF', exact: true }).click(); await settled(page);
    assert.equal((await savedAttempts(page))[0].penalty, 'DNF');
    await first.getByRole('button', { name: 'DNF', exact: true }).click(); await settled(page);
    await first.locator('.scorecard-time').click();
    const edit = page.getByRole('dialog', { name: /^Edit time/ });
    await compactCentered(edit); await capture(page, 'edit-time', artifacts);
    await edit.getByRole('button', { name: 'Close', exact: true }).click();
    await page.evaluate(() => {
      window.feedbackPhases = [];
      window.feedbackObserver = new MutationObserver(() => window.feedbackPhases.push(document.querySelector('[data-phase]')?.getAttribute('data-phase')));
      window.feedbackObserver.observe(document.querySelector('[data-phase]'), { attributes: true, attributeFilter: ['data-phase'] });
    });
    await advance(page, 'Space'); await phase(page, 'scramble'); await assertCard(page);
    assert.ok(!(await page.evaluate(() => window.feedbackPhases)).includes('home'), 'Confirm solve flashed the home screen.');
    dialog = await settings(page); await toggle(dialog, 'Inspection', false); await closeSettings(dialog);
    await advance(page, 'Enter'); await phase(page, 'ready');
    const readyExit = await openEndRound(page);
    await page.keyboard.press('Escape'); await readyExit.waitFor({ state: 'hidden' });
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('.timer-number')?.classList.contains('error-text'));
    await page.waitForTimeout(150); await page.keyboard.up('Space'); await phase(page, 'ready');
    await page.keyboard.down('Space'); await page.getByText('Release to start', { exact: true }).first().waitFor();
    assert.ok(await page.locator('.timer-number').evaluate(element => element.classList.contains('positive-text')), 'Without inspection, an armed timer must turn green.');
    await phase(page, 'ready');
    await page.keyboard.up('Space');
    await phase(page, 'solving'); await page.keyboard.press('Enter'); await phase(page, 'confirm');
    await advance(page, 'Enter'); await phase(page, 'scramble'); await assertCard(page);
    dialog = await settings(page);
    await choose(page, 'Solve input', 'manual'); await toggle(dialog, 'Inspection', false); await closeSettings(dialog);
    for (const [key, value] of [['Space', '12.34'], ['Enter', '14.56']]) {
      await advance(page, key); await phase(page, 'ready'); await advance(page, key); await phase(page, 'entry'); await assertCard(page);
      await page.getByLabel('Time', { exact: true }).fill(value);
      if (key === 'Space') {
        await page.locator('form[data-solve-entry]').getByRole('button', { name: '+2', exact: true }).click();
        await page.locator('.scorecard-time').first().click();
        const priorSolve = page.getByRole('dialog', { name: /^Edit time/ });
        await priorSolve.getByLabel('Time', { exact: true }).fill('99');
        await priorSolve.getByRole('button', { name: 'DNF', exact: true }).click();
        await priorSolve.getByRole('button', { name: 'Close', exact: true }).click();
        assert.equal(await page.getByLabel('Time', { exact: true }).inputValue(), value, 'Editing a previous solve replaced the current manual entry.');
        const manualPenalty = page.locator('form[data-solve-entry]').getByRole('button', { name: '+2', exact: true });
        assert.equal(await manualPenalty.getAttribute('aria-pressed'), 'true', 'Editing a previous solve changed the current manual penalty.');
        await manualPenalty.click();
        await page.getByLabel('Time', { exact: true }).focus();
      }
      await page.keyboard.press(key);
      await phase(page, 'scramble'); await assertCard(page);
    }
    assert.equal((await savedAttempts(page)).length, 4);
    await page.getByRole('button', { name: 'Hide scorecard', exact: true }).click();
    const show = page.getByRole('button', { name: 'Show scorecard', exact: true });
    const showBox = await show.boundingBox();
    assert.ok(Math.abs(showBox.y + showBox.height / 2 - 450) < 35, 'Show scorecard should sit at the vertical center.');
    await show.click(); await settled(page);
    await page.evaluate(() => { window.feedbackCard = document.querySelector('.scorecard-wrap'); });
    dialog = await settings(page);
    await toggle(dialog, 'Wait between solves', true);
    const fixedWait = dialog.getByRole('spinbutton', { name: 'Wait duration', exact: true });
    assert.equal(await fixedWait.getAttribute('max'), '300');
    await fixedWait.fill('300'); await settled(page);
    assert.equal((await persistedRoundState(page)).settings.waitSeconds, 300);
    await fixedWait.fill('301'); await settled(page);
    assert.equal((await persistedRoundState(page)).settings.waitSeconds, 300, 'Fixed wait accepted more than five minutes.');
    await fixedWait.fill('10'); await settled(page); await closeSettings(dialog);
    await page.clock.install();
    await advance(page); await phase(page, 'waiting'); await assertCard(page);
    await page.keyboard.press('Space'); await page.keyboard.press('Enter'); await phase(page, 'waiting');
    assert.ok(await page.getByRole('button', { name: 'Ready', exact: true }).isDisabled());
    dialog = await settings(page);
    await dialog.getByRole('spinbutton', { name: 'Wait duration', exact: true }).fill('0'); await settled(page); await closeSettings(dialog);
    await phase(page, 'waiting');
    await page.clock.fastForward(10_000); await phase(page, 'ready');
    await advance(page); await phase(page, 'entry'); await page.getByLabel('Time', { exact: true }).fill('15'); await page.keyboard.press('Enter'); await phase(page, 'complete'); await assertCard(page);
    await advance(page); await phase(page, 'scramble');
    dialog = await settings(page);
    await dialog.getByRole('radio', { name: 'Random Duration', exact: true }).click();
    const minimumWait = dialog.getByRole('textbox', { name: 'Minimum wait (MM:SS)', exact: true });
    const maximumWait = dialog.getByRole('textbox', { name: 'Maximum wait (MM:SS)', exact: true });
    await minimumWait.fill('00:10'); await minimumWait.press('Enter'); await settled(page);
    await maximumWait.fill('00:20'); await maximumWait.press('Enter'); await settled(page);
    assert.equal(await minimumWait.inputValue(), '00:10');
    assert.equal(await maximumWait.inputValue(), '00:20');
    await maximumWait.fill('05:01'); await maximumWait.press('Enter');
    assert.equal(await maximumWait.getAttribute('aria-invalid'), 'true');
    assert.equal((await persistedRoundState(page)).settings.waitMaxSeconds, 20, 'Invalid MM:SS wait changed the stored upper bound.');
    await maximumWait.fill('05:00'); await maximumWait.press('Enter'); await settled(page);
    assert.equal((await persistedRoundState(page)).settings.waitMaxSeconds, 300);
    await maximumWait.fill('00:20'); await maximumWait.press('Enter'); await settled(page);
    const rail = await dialog.locator('.wait-range-track').boundingBox();
    for (const name of ['Minimum wait', 'Maximum wait']) {
      const slider = dialog.getByRole('slider', { name, exact: true });
      assert.equal(await slider.getAttribute('max'), '300');
      const track = await slider.boundingBox();
      assert.ok(Math.abs(track.y + track.height / 2 - rail.y - rail.height / 2) < 1, `${name} thumb is not vertically centered on the rail.`);
      assert.ok(Math.abs(track.x + 10 - rail.x) < 1 && Math.abs(track.x + track.width - 10 - rail.x - rail.width) < 1, `${name} thumb centers do not align with rail endpoints.`);
    }
    await capture(page, 'random-wait-controls', artifacts);
    assert.equal(await dialog.getByRole('slider', { name: 'Minimum wait', exact: true }).inputValue(), '10');
    assert.equal(await dialog.getByRole('slider', { name: 'Maximum wait', exact: true }).inputValue(), '20');
    await dialog.getByRole('slider', { name: 'Minimum wait', exact: true }).focus();
    await page.keyboard.press('ArrowRight'); await settled(page);
    assert.equal(await minimumWait.inputValue(), '00:11');
    await page.keyboard.press('ArrowLeft'); await settled(page);
    await closeSettings(dialog);
    await page.evaluate(() => { window.feedbackRandom = Math.random; window.feedbackRandomCalls = 0; Math.random = () => { window.feedbackRandomCalls++; return 0.5; }; });
    await advance(page); await phase(page, 'waiting');
    assert.equal(await page.locator('.waiting-number').innerText(), '0:15');
    await page.clock.fastForward(5_000); await phase(page, 'waiting');
    const remaining = Number((await page.locator('.waiting-number').innerText()).split(':')[1]);
    assert.ok(remaining >= 9 && remaining <= 10, 'Random wait should count down from a single sampled duration.');
    await page.keyboard.press('Enter'); await phase(page, 'waiting');
    await page.clock.fastForward(10_000); await phase(page, 'ready');
    assert.equal(await page.evaluate(() => window.feedbackRandomCalls), 1, 'Random wait resampled while counting down.');
    await page.evaluate(() => { Math.random = window.feedbackRandom; });
    const openEventChange = async () => {
      await page.locator('.event-selector').click();
      await page.getByRole('dialog', { name: 'Choose event', exact: true }).getByRole('button', { name: '2×2 Cube', exact: true }).click();
      return page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Confirm', exact: true }) });
    };
    let confirmation = await openEventChange(); await compactCentered(confirmation);
    await confirmation.getByRole('button', { name: 'Close', exact: true }).click(); await phase(page, 'ready');
    confirmation = await openEventChange(); await confirmation.getByRole('button', { name: 'Go back', exact: true }).click(); await phase(page, 'ready');
    confirmation = await openEventChange(); await page.mouse.click(5, 5); await confirmation.waitFor({ state: 'hidden' }); await phase(page, 'ready');
    confirmation = await openEventChange(); await capture(page, 'event-confirmation', artifacts);
    await confirmation.getByRole('button', { name: 'Confirm', exact: true }).click(); await phase(page, 'home');
    assert.match(await page.locator('.event-selector').innerText(), /2×2/);
    assert.equal((await savedAttempts(page)).length, 5, 'Changing event discarded recorded history.');
    await page.getByRole('button', { name: 'View all stats', exact: true }).click();
    const statistics = page.getByRole('dialog', { name: 'Statistics', exact: true });
    await statistics.getByRole('button', { name: 'Export history', exact: true }).waitFor();
    assert.equal(await statistics.getByRole('button', { name: 'Import history', exact: true }).count(), 0);
    await statistics.getByRole('heading', { name: 'Mean of 3 rounds', exact: true }).waitFor();
    await capture(page, 'statistics', artifacts); await statistics.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    const help = page.getByRole('dialog');
    for (const name of ['About This App', 'How WCA Competitions Work', 'About Brandon True']) {
      await help.getByRole('tab', { name, exact: true }).click();
      await help.locator('.help-video-placeholder').waitFor();
    }
    assert.match(await help.getByRole('link', { name: 'Source code & licenses', exact: true }).getAttribute('href'), /github\.com\/Brandonius813\/cubing-comp-sim/);
    await capture(page, 'help', artifacts);
    await help.getByRole('button', { name: 'Close', exact: true }).click();
    await checkRoundExits(page, artifacts);
    assert.deepEqual(errors, [], 'The feedback scenarios emitted an uncaught application error.');
    return 'Feedback: persistent scorecard, integer inspection, red-to-green 550ms hold with/without inspection, keyboard flow/manual submit, penalties, compact dialogs, fixed/random waits, event cancellation, Statistics/Help, editable shortcuts, themes/fonts, aligned desktop dropdowns, stable Settings width, End Round cancellation/deletion/export/reload, and partial-round event-change deletion passed.';
  } catch (error) {
    await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => undefined);
    await writeFile(path.join(artifacts, 'failure.json'), JSON.stringify({ message: String(error), errors, phase: await page.locator('[data-phase]').getAttribute('data-phase').catch(() => null) }, null, 2));
    throw error;
  } finally {
    await context.tracing.stop({ path: path.join(artifacts, 'trace.zip') });
    await context.close();
  }
}
