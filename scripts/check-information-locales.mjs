import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const catalogs = JSON.parse(await readFile(new URL('../public/information-locales.json', import.meta.url), 'utf8'));
const locales = ['en','es','fr','de','pl','it','pt-BR','nl','ru','uk','tr','ja','zh-Hans','zh-Hant','ko','id'];
assert.deepEqual(Object.keys(catalogs).sort(), [...locales].sort());
const expected = Object.keys(catalogs.en).sort();
for (const locale of locales) {
  assert.deepEqual(Object.keys(catalogs[locale]).sort(), expected, `Missing information text: ${locale}`);
  for (const [key, value] of Object.entries(catalogs[locale])) {
    assert.equal(typeof value, 'string');
    assert.ok(value.trim(), `Empty ${locale}: ${key}`);
    assert.ok(!/ZXQ|QXZ/.test(value));
  }
}
for (const name of ['about','privacy','terms']) {
  const html = await readFile(new URL(`../public/${name}/index.html`, import.meta.url), 'utf8');
  assert.ok(html.includes('/information-language.js'));
  const ignored = new Set(['Cubing Comp Sim','CUBING COMP SIM','openid','userinfo.email','userinfo.profile']);
  const strings = html.split(/<[^>]+>/).map(value => value.trim().replaceAll('&amp;', '&')).filter(value => /[A-Za-z]/.test(value) && !ignored.has(value));
  for (const string of strings) assert.ok(Object.hasOwn(catalogs.en, string), `Untranslated text in ${name}: ${string}`);
}
console.log('PASS: every information-page text block has all 16 language versions.');
