import assert from 'node:assert/strict';

/** Exercise the built application worker with networking disabled, not a fake generator. */
export async function checkOfflineWorker(page, workerPath) {
  const results = await page.evaluate(async workerUrl => {
    if (navigator.onLine !== false) throw new Error('The offline engine test must run with networking disabled.');
    const events = ['222', '333', '444', '555', '666', '777', '333oh', '333bf', '444bf', '555bf', 'minx', 'pyram', 'skewb', 'sq1', 'fto', 'clock'];
    const worker = new Worker(workerUrl, { type: 'module' });
    let id = 0;
    let prior333;
    async function generate(eventId) {
      const requestId = ++id;
      const begin = performance.now();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`${eventId}: offline generation timed out.`)), 180_000);
        worker.onerror = () => { clearTimeout(timeout); reject(new Error(`${eventId}: offline worker failed.`)); };
        worker.onmessage = async ({ data }) => {
          if (data.id !== requestId) return;
          clearTimeout(timeout);
          if (data.type !== 'result') { reject(new Error(`${eventId}: ${data.code}: ${data.message}`)); return; }
          try {
            const result = data.scramble;
            if (result.eventId !== eventId || !result.notation.trim() || !result.engineVersion.startsWith('tnoodle-lib@')) throw new Error(`${eventId}: engine returned invalid metadata.`);
            // An SVG string is not sufficient evidence that a browser can display it.
            const drawing = new Image();
            drawing.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`;
            await drawing.decode();
            if (!drawing.naturalWidth || !drawing.naturalHeight) throw new Error(`${eventId}: drawing has no visible dimensions.`);
            resolve({ eventId, elapsedMs: Math.round(performance.now() - begin), notation: result.notation });
          } catch (error) { reject(error); }
        };
        worker.postMessage({ type: 'generate', id: requestId, eventId });
      });
    }
    try {
      const outputs = [];
      for (const event of events) {
        const result = await generate(event);
        if (event === '333') prior333 = result.notation;
        outputs.push({ eventId: event, elapsedMs: result.elapsedMs });
      }
      const repeated = await generate('333');
      if (repeated.notation === prior333) throw new Error('A second offline 3×3 request repeated the same scramble.');
      return outputs;
    } finally { worker.terminate(); }
  }, workerPath);
  assert.equal(results.length, 16);
  assert.equal(results.at(-1).eventId, 'clock');
  return results;
}
