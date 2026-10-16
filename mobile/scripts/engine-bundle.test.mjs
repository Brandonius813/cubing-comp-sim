import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
import { makeEngineDocument } from './engine-bundle.mjs';

const runtime = await readFile(new URL('../src/engine/webview-runtime.js', import.meta.url), 'utf8');
const source = 'function version(){return "fixture";} function generate(event){return [event+" R", "<svg></svg>"];} export{version as engineVersion,generate as generate};';
const manifest = { engineVersion: 'fixture', sha256: 'fixture', source: 'https://example.org/corresponding-source' };

function boot(withRandomness = true) {
  const messages = [];
  const html = makeEngineDocument({ source, runtime, manifest, license: 'fixture license' }).replace('"__CCS_ENGINE_CHANNEL__"', '"test"');
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const context = vm.createContext({ ReactNativeWebView: { postMessage: raw => messages.push(JSON.parse(raw)) },
    crypto: withRandomness ? { getRandomValues: () => {} } : undefined, performance: { now: () => 1 } });
  vm.runInContext(script, context);
  return { context, messages, html };
}

test('static document hosts the production boundary with no external resource requirement', () => {
  const { context, messages, html } = boot();
  assert.equal(messages[0].type, 'ready'); assert.equal(messages[0].events.length, 16);
  vm.runInContext('__ccsEngineReceive({version:1,channel:"test",type:"generate",id:1,eventId:"333"})', context);
  assert.equal(messages[1].scramble.eventId, '333');
  assert.equal(messages[1].scramble.notation, '333 R');
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /<script\s+src|<iframe|<link\s/);
});

test('runtime refuses missing secure randomness, wrong channels, duplicate requests and unsupported events', () => {
  assert.equal(boot(false).messages[0].code, 'ENGINE_UNAVAILABLE');
  const { context, messages } = boot();
  vm.runInContext('__ccsEngineReceive({version:1,channel:"old",type:"generate",id:1,eventId:"333"})', context);
  assert.equal(messages.length, 1);
  vm.runInContext('__ccsEngineReceive({version:1,channel:"test",type:"generate",id:1,eventId:"333"})', context);
  vm.runInContext('__ccsEngineReceive({version:1,channel:"test",type:"generate",id:1,eventId:"333"})', context);
  assert.equal(messages.length, 2);
  vm.runInContext('__ccsEngineReceive({version:1,channel:"test",type:"generate",id:2,eventId:"333fm"})', context);
  assert.equal(messages[2].code, 'UNSUPPORTED_EVENT');
});

test('unexpected compiler module formats and inline script breakouts fail bundling', () => {
  assert.throws(() => makeEngineDocument({ source: 'export default {}', runtime, manifest, license: '' }), /format/);
  assert.throws(() => makeEngineDocument({ source: source.replace('function version', 'const bad="</script>"; function version'), runtime, manifest, license: '' }), /closing script/);
});
