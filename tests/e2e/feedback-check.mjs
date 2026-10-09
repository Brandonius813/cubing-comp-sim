import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactRoot = process.env.CCS_BROWSER_ARTIFACT_DIR ?? path.join(root, 'test-results/browser');
const phase = (page, value) => page.locator(`[data-phase="${value}"]`).waitFor({ state: 'visible', timeout: 180_000 });
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

/** User-feedback regressions against the built app and its real offline engine. */
export async function checkFeedbackApp(browser, baseUrl, { browserName = 'chromium' } = {}) {
  const artifacts = path.join(artifactRoot, browserName, 'feedback');
  await mkdir(artifacts, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await context.newPage();
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
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('.timer-number')?.classList.contains('error-text'));
    await page.waitForTimeout(150);
    await page.keyboard.up('Space');
    await phase(page, 'inspection');
    await page.keyboard.down('Space');
    await page.getByText('Release to start', { exact: true }).first().waitFor();
    assert.ok(await page.locator('.timer-number').evaluate(element => element.classList.contains('error-text')), 'Armed timer must remain red until release.');
    await capture(page, 'armed-inspection', artifacts);
    await page.keyboard.up('Space'); await phase(page, 'solving'); await assertCard(page);
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
    await advance(page, 'Enter'); await phase(page, 'ready');
    await advance(page, 'Space'); await phase(page, 'inspection');
    await page.keyboard.down('Space'); await page.getByText('Release to start', { exact: true }).first().waitFor(); await page.keyboard.up('Space');
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
    await dialog.getByRole('spinbutton', { name: 'Wait duration', exact: true }).fill('10'); await settled(page); await closeSettings(dialog);
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
    await dialog.getByRole('spinbutton', { name: 'Minimum wait (s)', exact: true }).fill('10'); await settled(page);
    await dialog.getByRole('spinbutton', { name: 'Maximum wait (s)', exact: true }).fill('20'); await settled(page);
    assert.equal(await dialog.getByRole('slider', { name: 'Minimum wait', exact: true }).inputValue(), '10');
    assert.equal(await dialog.getByRole('slider', { name: 'Maximum wait', exact: true }).inputValue(), '20');
    await dialog.getByRole('slider', { name: 'Minimum wait', exact: true }).focus();
    await page.keyboard.press('ArrowRight'); await settled(page);
    assert.equal(await dialog.getByRole('spinbutton', { name: 'Minimum wait (s)', exact: true }).inputValue(), '11');
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
    assert.deepEqual(errors, [], 'The feedback scenarios emitted an uncaught application error.');
    return 'Feedback: persistent scorecard, integer inspection, red 550ms hold, keyboard flow/manual submit, penalties, compact dialogs, fixed/random waits, event cancellation, Statistics/Help, editable shortcuts, themes/fonts, aligned desktop dropdowns passed.';
  } catch (error) {
    await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => undefined);
    await writeFile(path.join(artifacts, 'failure.json'), JSON.stringify({ message: String(error), errors, phase: await page.locator('[data-phase]').getAttribute('data-phase').catch(() => null) }, null, 2));
    throw error;
  } finally {
    await context.tracing.stop({ path: path.join(artifacts, 'trace.zip') });
    await context.close();
  }
}
