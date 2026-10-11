import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from './config.js';

const env = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-public',
  APP_ORIGINS: 'https://example.test', DATABASE_URL: 'postgresql://test:password@localhost:5432/test', DATABASE_TLS: 'false',
  R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com', R2_BUCKET: 'test', R2_ACCESS_KEY_ID: 'test-key', R2_SECRET_ACCESS_KEY: 'test-secret',
};

test('proxy trust defaults off and accepts only explicit IPv4/IPv6 addresses', () => {
  assert.deepEqual(readConfig(env).trustedProxyIps, []);
  assert.deepEqual(readConfig({ ...env, TRUSTED_PROXY_IPS: ' 192.0.2.10, ::1 ' }).trustedProxyIps, ['192.0.2.10', '::1']);
  for (const value of ['true', '*', '1', 'localhost', '0.0.0.0/0', '192.0.2.10,']) {
    assert.throws(() => readConfig({ ...env, TRUSTED_PROXY_IPS: value }), /explicit proxy IP addresses/);
  }
});
