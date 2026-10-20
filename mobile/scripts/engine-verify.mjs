import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { verifyEngineArtifact } from '../../scripts/assert-engine.mjs';
import { canonicalSvg } from '../../engine/scripts/svg-conformance.mjs';
import { makeEngineDocument } from './engine-bundle.mjs';

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(mobile, '..');
const args = process.argv.slice(2);
let engineDirectory = path.join(root, 'public/engine');
let fixturePath = path.join(root, 'engine/target/reference-fixtures.jsonl');
let smoke = false;
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--smoke') smoke = true;
  else if (args[index] === '--engine-dir' && args[index + 1]) engineDirectory = path.resolve(args[++index]);
  else if (args[index] === '--fixtures' && args[index + 1]) fixturePath = path.resolve(args[++index]);
  else throw new Error('Usage: engine-verify.mjs [--engine-dir path] [--fixtures path] [--smoke]');
}
// Never leave a prior successful report looking like evidence for a failed run.
const reportPath = path.join(mobile, 'assets/engine.verification.generated.json');
await rm(reportPath, { force: true });
const bytes = await readFile(path.join(engineDirectory, 'tnoodle.js'));
const manifest = JSON.parse(await readFile(path.join(engineDirectory, 'manifest.json'), 'utf8'));
const proof = JSON.parse(await readFile(path.join(engineDirectory, 'conformance.json'), 'utf8'));
const lock = JSON.parse(await readFile(path.join(root, 'engine/upstream-lock.json'), 'utf8'));
verifyEngineArtifact({ bytes, manifest, proof, lock });
// Fail before expensive initialization if the exact JVM evidence is unavailable.
const fixtureBytes = smoke ? null : await readFile(fixturePath);
const referenceSha256 = fixtureBytes ? createHash('sha256').update(fixtureBytes).digest('hex') : null;
if (!smoke) assert.equal(referenceSha256, proof.referenceSha256, 'Reference fixtures do not match the engine conformance proof.');
const runtime = await readFile(path.join(mobile, 'src/engine/webview-runtime.js'), 'utf8');
const license = await readFile(path.join(engineDirectory, 'LICENSE.txt'), 'utf8');
const html = makeEngineDocument({ source: bytes.toString('utf8'), runtime, manifest, license });
const script = html.replace('"__CCS_ENGINE_CHANNEL__"', '"verification"').match(/<script>([\s\S]*)<\/script>/)[1];
const messages = [];
const context = vm.createContext({ crypto: webcrypto, performance, setTimeout, clearTimeout,
  ReactNativeWebView: { postMessage: raw => messages.push(JSON.parse(raw)) } });
// The actual production document must boot with no fetch, DOM or network APIs.
vm.runInContext(script, context, { timeout: 15_000 });
assert.equal(messages[0].type, 'ready');
assert.equal(messages[0].engineVersion, manifest.engineVersion);
assert.equal(context.__ccsConformance, undefined);
const events = messages[0].events;
assert.deepEqual([...events].sort(), [...proof.liveEvents].sort());

const timings = [];
const warmTimings = [];
for (const pass of [0, 1]) {
for (const [index, eventId] of events.entries()) {
  vm.runInContext(`__ccsEngineReceive(${JSON.stringify({ version: 1, channel: 'verification', type: 'generate', id: pass * events.length + index + 1, eventId })})`, context, { timeout: 180_000 });
  const response = messages.at(-1);
  assert.equal(response.type, 'result', `${eventId}: production bridge failed`);
  assert.equal(response.scramble.eventId, eventId);
  assert.equal(response.scramble.engineVersion, manifest.engineVersion);
  assert.ok(response.scramble.notation.trim()); assert.match(response.scramble.svg, /^<svg[\s>]/);
  (pass === 0 ? timings : warmTimings).push({ eventId, durationMs: Math.round(response.durationMs) });
  console.log(`PASS production bridge ${pass === 0 ? 'first' : 'repeat'} ${eventId} (${Math.round(response.durationMs)} ms)`);
}
}

let fixtureCount = 0;
if (!smoke) {
  const fixtures = fixtureBytes.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual([...new Set(fixtures.map(value => value.eventId))].sort(), [...events].sort());
  for (const event of events) assert.ok(new Set(fixtures.filter(value => value.eventId === event).map(value => value.seed)).size >= 2);

  // Test-only instrumentation exposes existing conformance exports from the
  // same transformed lexical scope. It is never written into the app asset.
  const exportList = bytes.toString('utf8').match(/export\s*\{([^}]+)\};?\s*$/)[1];
  const names = Object.fromEntries(exportList.split(',').map(entry => { const [local, name] = entry.trim().split(/\s+as\s+/); return [name, local]; }));
  const needed = ['generateForConformance', 'randomVectorForConformance', 'draw', 'meetsMinimumDistance'];
  const instrumentation = `globalThis.__ccsConformance={${needed.map(name => { assert.match(names[name], /^[\w$]+$/); return `${name}:${names[name]}`; }).join(',')}};`;
  const anchor = 'installEngineBridge({engineVersion:';
  assert.equal(script.split(anchor).length, 2);
  const referenceContext = vm.createContext({ crypto: webcrypto, performance, setTimeout, clearTimeout,
    ReactNativeWebView: { postMessage: () => {} } });
  vm.runInContext(script.replace(anchor, instrumentation + anchor), referenceContext, { timeout: 15_000 });
  const engine = referenceContext.__ccsConformance;
  for (const fixture of fixtures) {
    assert.deepEqual(Array.from(engine.randomVectorForConformance(fixture.seed)), fixture.randomVector);
    const [notation, svg] = engine.generateForConformance(fixture.eventId, fixture.seed);
    assert.equal(canonicalSvg(svg, fixture.eventId), canonicalSvg(fixture.svg, fixture.eventId), `${fixture.eventId}: reference state differs`);
    assert.equal(canonicalSvg(engine.draw(fixture.eventId, fixture.notation), fixture.eventId), canonicalSvg(fixture.svg, fixture.eventId), `${fixture.eventId}: reference drawing differs`);
    if (fixture.eventId === 'minx') assert.equal(notation, fixture.notation);
    assert.equal(engine.meetsMinimumDistance(fixture.eventId, notation), true);
    fixtureCount++;
  }
  for (const response of messages.slice(1)) {
    const { eventId, notation, svg } = response.scramble;
    assert.equal(canonicalSvg(engine.draw(eventId, notation), eventId), canonicalSvg(svg, eventId));
    assert.equal(engine.meetsMinimumDistance(eventId, notation), true);
  }
}
await writeFile(reportPath, JSON.stringify({
  outcome: 'passed', scope: smoke ? 'Node VM: exact production bridge fresh generation only; no native-device evidence.'
    : 'Node VM: exact production bridge fresh generation and instrumented transformed engine against JVM fixtures; no native-device evidence.',
  engineSha256: manifest.sha256, documentSha256: createHash('sha256').update(html).digest('hex'),
  referenceSha256, fixtureCount, timings, warmTimings,
  measurementNote: 'First pass shares one engine host across events; related events may share already-initialized tables. Repeat pass uses that same host. Neither is a native-device measurement.',
}, null, 2) + '\n');
console.log(`Mobile bridge verification passed: ${events.length} fresh generators in each of two passes, ${fixtureCount} reference fixtures. Native-device acceptance remains required.`);
