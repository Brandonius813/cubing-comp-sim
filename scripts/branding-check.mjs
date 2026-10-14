import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { resolve } from 'node:path';

const server = await preview({ root: resolve(import.meta.dirname, '..'), preview: { host: '127.0.0.1', port: 0 } });
const address = server.httpServer.address();
const origin = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CCS_BROWSER_EXECUTABLE ? { executablePath: process.env.CCS_BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage();
  await page.goto(origin);
  await page.locator('.logo-space').waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 375, 768, 1100, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const layout = await page.evaluate(() => {
        const boxes = ['.logo-space', '.event-selector', '.utilities'].map(selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        });
        const image = [...document.querySelectorAll('.brand-symbol')].find(element => getComputedStyle(element).display !== 'none');
        return { boxes, loaded: image.complete && image.naturalWidth > 0, source: image.getAttribute('src'), scrollWidth: document.documentElement.scrollWidth };
      });
      assert.ok(layout.loaded, `Logo loads at ${width}px in ${theme}`);
      assert.equal(layout.source, `/brand/logo${theme === 'dark' ? '-dark' : ''}.svg`);
      assert.ok(layout.scrollWidth <= width, `No horizontal overflow at ${width}px`);
      assert.ok(layout.boxes[0].right <= layout.boxes[1].left, `Brand does not overlap event selector at ${width}px`);
      assert.ok(layout.boxes[1].right <= layout.boxes[2].left, `Event selector does not overlap utilities at ${width}px`);
    }
  }
  const shareImage = await page.evaluate(async () => { const image = new Image(); image.src = '/brand/share.png'; await image.decode(); return [image.naturalWidth, image.naturalHeight]; });
  assert.deepEqual(shareImage, [1200, 630]);
  const manifest = await (await page.request.get(`${origin}/site.webmanifest`)).json();
  for (const icon of manifest.icons) { const response = await page.request.get(`${origin}${icon.src}`); assert.equal(response.status(), 200); assert.match(response.headers()['content-type'], /image\/png/); }
  assert.equal(await page.locator('meta[name="description"]').getAttribute('content'), 'Simulate a Cubing Competition');
  assert.equal(await page.locator('meta[property="og:image"]').getAttribute('content'), 'https://cubingcompsim.com/brand/share.png');
  console.log('Branding check passed: 12 theme/width combinations, icons, sharing image, and server-readable metadata.');
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
