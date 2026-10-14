import assert from 'node:assert/strict';

export async function checkInspectionVoices(browser, baseUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.voiceStarts = [];
    window.voiceStops = 0;
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function (...args) {
      window.lastVoiceContext = this;
      return resume.apply(this, args);
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.voiceStarts.push({ time: performance.now(), duration: this.buffer?.duration });
      return start.apply(this, args);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (...args) { window.voiceStops++; return stop.apply(this, args); };
  });
  async function select(label, value) {
    await page.getByRole('combobox', { name: label, exact: true }).click();
    await page.locator(`[role="option"][data-value="${value}"]`).click();
  }
  try {
    await page.goto(baseUrl);
    await page.getByRole('button', { name: 'Start CompSim', exact: true }).waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const manifest = await page.evaluate(async () => (await fetch('/audio/inspection/v1/manifest.json')).json());
    assert.equal(manifest.clips.length, 128);
    await context.setOffline(true);
    // Fresh AudioContext decoding and fetches prove every pack is available offline.
    const decoded = await page.evaluate(async clips => {
      const audio = new AudioContext();
      try {
        for (const clip of clips) {
          const response = await fetch(`/audio/inspection/v1/${clip.file}`);
          if (!response.ok) throw new Error(`Missing ${clip.file}`);
          const buffer = await audio.decodeAudioData(await response.arrayBuffer());
          if (buffer.duration < 0.25 || buffer.duration > 3) throw new Error(`Bad duration: ${clip.file}`);
          let peak = 0;
          for (const value of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(value));
          if (peak < 0.05 || peak > 1.001) throw new Error(`Silent or clipped: ${clip.file}`);
        }
        return clips.length;
      } finally { await audio.close(); }
    }, manifest.clips);
    assert.equal(decoded, 128);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    for (const [index, voice] of ['male-1', 'male-2', 'female-1', 'female-2'].entries()) {
      await select('Inspection voice', voice);
      await page.getByRole('button', { name: 'Test voice', exact: true }).click();
      try {
        await page.waitForFunction(count => window.voiceStarts.length === count, index + 1);
      } catch (error) {
        const diagnostics = await page.evaluate(() => ({
          starts: window.voiceStarts.length,
          audioState: window.lastVoiceContext?.state,
          messages: [...document.querySelectorAll('[role="status"]')].map(element => element.textContent),
        }));
        throw new Error(`Preview ${voice} did not play: ${JSON.stringify(diagnostics)}`, { cause: error });
      }
    }
    const wait = page.getByRole('switch', { name: 'Wait between solves', exact: true });
    if (await wait.getAttribute('aria-checked') === 'true') await wait.click();
    const inspection = page.getByRole('switch', { name: 'Inspection', exact: true });
    if (await inspection.getAttribute('aria-checked') !== 'true') await inspection.click();
    await page.getByLabel('Hold to start', { exact: true }).fill('0');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Start CompSim', exact: true }).click();
    await page.getByRole('button', { name: 'Scramble is good', exact: true }).waitFor({ timeout: 180_000 });
    await page.getByRole('button', { name: 'Scramble is good', exact: true }).click();
    await page.evaluate(() => { window.voiceStarts = []; window.voiceStops = 0; window.inspectionStart = performance.now(); });
    await page.getByRole('button', { name: 'Ready', exact: true }).click();
    await page.locator('[data-phase="inspection"]').waitFor();
    await page.waitForFunction(() => window.voiceStarts.length === 2, null, { timeout: 15_000 });
    const timing = await page.evaluate(() => ({ times: window.voiceStarts.map(item => item.time - window.inspectionStart), spacing: window.voiceStarts[1].time - window.voiceStarts[0].time }));
    assert.ok(timing.times[0] >= 7900 && timing.times[0] < 9000, JSON.stringify(timing));
    assert.ok(timing.spacing > 3800 && timing.spacing < 4200, JSON.stringify(timing));
    await page.keyboard.press('Space');
    await page.locator('[data-phase="solving"]').waitFor();
    assert.ok(await page.evaluate(() => window.voiceStops >= 1), 'Starting the solve did not cancel its current warning.');
    return '128 recordings decode offline; all four previews play; 8/12-second cues and solve-start interruption passed.';
  } finally { await context.close(); }
}
