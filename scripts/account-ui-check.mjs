import { chromium, firefox, webkit } from 'playwright';
import { createServer } from 'vite';
import { checkAccountDialog } from '../tests/e2e/account-check.mjs';
import { checkRealAccountCallbacks } from '../tests/e2e/account-auth-check.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browserName = process.env.BROWSER ?? 'chromium';
const engines = { chromium, firefox, webkit };
if (!Object.hasOwn(engines, browserName)) throw new Error('BROWSER must be chromium, firefox, or webkit.');
if ((process.env.CCS_BROWSER_EXECUTABLE || process.env.CCS_BROWSER_CHANNEL) && browserName !== 'chromium') throw new Error('A custom Chrome executable/channel is supported only with BROWSER=chromium.');
let browser;
let server;
try {
  server = await createServer({ root, define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://account-fixture.supabase.co'),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('test-only-public-key'),
    'import.meta.env.VITE_API_URL': JSON.stringify('https://api.example.test'),
  }, server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  browser = await engines[browserName].launch({ headless: true, ...(process.env.CCS_BROWSER_EXECUTABLE ? { executablePath: process.env.CCS_BROWSER_EXECUTABLE } : {}), ...(process.env.CCS_BROWSER_CHANNEL ? { channel: process.env.CCS_BROWSER_CHANNEL } : {}) });
  console.log(await checkAccountDialog(browser, `http://127.0.0.1:${server.httpServer.address().port}`, process.env.CCS_BROWSER_ARTIFACT_DIR ?? path.join(root, 'test-results/browser')));
  console.log(await checkRealAccountCallbacks(browser, `http://127.0.0.1:${server.httpServer.address().port}`));
} finally { await browser?.close(); await server?.close(); }
