import { chromium, firefox, webkit } from 'playwright';
import { createServer, preview } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkBrowserStorage } from '../tests/e2e/storage-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browserName = process.env.BROWSER ?? 'chromium';
const engines = { chromium, firefox, webkit };
if (!Object.hasOwn(engines, browserName)) throw new Error('BROWSER must be chromium, firefox, or webkit.');
if (process.env.CCS_BROWSER_CHANNEL && browserName !== 'chromium') throw new Error('CCS_BROWSER_CHANNEL is supported only with BROWSER=chromium.');
let browser;
let dev;
let production;
try {
  browser = await engines[browserName].launch({
    headless: true,
    ...(process.env.CCS_BROWSER_CHANNEL ? { channel: process.env.CCS_BROWSER_CHANNEL } : {}),
    ...(process.env.CCS_BROWSER_EXECUTABLE ? { executablePath: process.env.CCS_BROWSER_EXECUTABLE } : {}),
  });
  dev = await createServer({ root, server: { host: '127.0.0.1', port: 0, strictPort: false } });
  await dev.listen();
  const devAddress = dev.httpServer.address();
  console.log(`[${browserName}] ${await checkBrowserStorage(browser, `http://127.0.0.1:${devAddress.port}`)}`);
  await dev.close();
  dev = undefined;

  if (!process.argv.includes('--storage-only')) {
    // The production build is intentional: development does not install a service worker.
    // Build the real engine and run npm run build before this acceptance command.
    const { checkDesktopApp } = await import('../tests/e2e/app-check.mjs');
    production = await preview({ root, preview: { host: '127.0.0.1', port: 0, strictPort: false } });
    const address = production.httpServer.address();
    console.log(`[${browserName}] ${await checkDesktopApp(browser, `http://127.0.0.1:${address.port}`, { browserName })}`);
  }
} finally {
  await browser?.close();
  await dev?.close();
  if (production) await new Promise(resolve => production.httpServer.close(resolve));
}
