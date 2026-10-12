import { chromium, firefox, webkit } from 'playwright';
import { fileURLToPath } from 'node:url';
import { checkOfflineNavigation } from '../tests/e2e/offline-navigation-check.mjs';
const browserName = process.env.BROWSER ?? 'chromium';
const engine = { chromium, firefox, webkit }[browserName];
if (!engine) throw new Error('Unsupported browser.');
const browser = await engine.launch({ headless: true,
  ...(process.env.CCS_BROWSER_EXECUTABLE ? { executablePath: process.env.CCS_BROWSER_EXECUTABLE } : {}) });
try {
  console.log(`[${browserName}] ${await checkOfflineNavigation(browser, fileURLToPath(new URL('../', import.meta.url)), browserName)}`);
} finally { await browser.close(); }
