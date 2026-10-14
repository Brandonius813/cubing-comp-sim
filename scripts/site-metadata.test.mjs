import assert from 'node:assert/strict';
import test from 'node:test';
import { siteMetadata } from './site-metadata.mjs';

test('production metadata is readable without JavaScript and has absolute URLs', () => {
  const metadata = siteMetadata();
  assert.match(metadata.head, /content="Simulate a Cubing Competition"/);
  assert.match(metadata.head, /property="og:image" content="https:\/\/cubingcompsim\.com\/brand\/share\.png"/);
  assert.match(metadata.head, /name="robots" content="index, follow"/);
  assert.match(metadata.robots, /Sitemap: https:\/\/cubingcompsim\.com\/sitemap.xml/);
  assert.match(metadata.sitemap, /<loc>https:\/\/cubingcompsim\.com\/<\/loc>/);
});

test('staging has its own sharing URLs and is excluded from indexing', () => {
  const metadata = siteMetadata('https://staging.cubingcompsim.com');
  assert.match(metadata.head, /og:image" content="https:\/\/staging\.cubingcompsim\.com\/brand\/share\.png/);
  assert.match(metadata.head, /content="noindex, nofollow"/);
  assert.equal(metadata.robots, 'User-agent: *\nDisallow: /\n');
  assert.doesNotMatch(metadata.head, /href="https:\/\/cubingcompsim\.com/);
});

test('reject unsafe or ambiguous canonical origins', () => {
  for (const origin of ['http://cubingcompsim.com', 'https://cubingcompsim.com/', 'https://user:pass@cubingcompsim.com', 'https://cubingcompsim.com/path']) {
    assert.throws(() => siteMetadata(origin), /exact HTTPS origin/);
  }
});
