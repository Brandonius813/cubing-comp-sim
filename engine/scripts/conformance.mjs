import assert from 'node:assert/strict';
import { readFile, copyFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { canonicalSvg } from './svg-conformance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publishedProof = path.join(root, '../public/engine/conformance.json');
await rm(publishedProof, {force: true});
const compiled = path.join(root, 'target/browser/tnoodle.js');
const modulePath = path.join(root, 'target/browser/tnoodle.mjs');
await copyFile(compiled, modulePath);
const engine = await import(pathToFileURL(modulePath).href);
const lock = JSON.parse(await readFile(path.join(root, 'upstream-lock.json'), 'utf8'));
assert.equal(engine.engineVersion(), `tnoodle-lib@${lock.commit}+webcrypto.2`);
const fixtures = (await readFile(path.join(root, 'target/reference-fixtures.jsonl'), 'utf8'))
  .trim().split('\n').map(line => JSON.parse(line));
const required = ['222', '333', '444', '555', '666', '777', '333oh', '333bf',
  '444bf', '555bf', 'minx', 'pyram', 'skewb', 'sq1', 'fto', 'clock'];
assert.deepEqual([...new Set(fixtures.map(x => x.eventId))].sort(), [...required].sort());

const results = [];
for (const fixture of fixtures) {
  const began = performance.now();
  assert.deepEqual(Array.from(engine.randomVectorForConformance(fixture.seed)), fixture.randomVector,
    fixture.eventId + ': bounded entropy differs from the JVM Random contract');
  const [notation, svg] = engine.generateForConformance(fixture.eventId, fixture.seed);
  assert.ok(notation.trim(), fixture.eventId + ': empty scramble');
  if (fixture.eventId === 'minx') {
    assert.equal(notation, fixture.notation, 'Megaminx move sequence differs from JVM');
  }
  // Search timeout may choose another valid notation for the same sampled state.
  assert.equal(canonicalSvg(svg, fixture.eventId), canonicalSvg(fixture.svg, fixture.eventId),
    fixture.eventId + ': seeded state differs from JVM reference');
  assert.equal(canonicalSvg(engine.draw(fixture.eventId, fixture.notation), fixture.eventId), canonicalSvg(fixture.svg, fixture.eventId),
    fixture.eventId + ': drawing differs from JVM reference');
  assert.equal(engine.meetsMinimumDistance(fixture.eventId, notation), true,
    fixture.eventId + ': minimum distance failed');
  results.push({eventId: fixture.eventId, seed: fixture.seed, browserRuntimeMs: Math.round(performance.now() - began)});
  console.log(`PASS ${fixture.eventId} seed ${fixture.seed}`);
}
for (const event of required) {
  const [notation, svg] = engine.generate(event);
  assert.ok(notation.trim());
  assert.match(svg, /^<svg[\s>]/);
  assert.equal(engine.meetsMinimumDistance(event, notation), true);
}
for (const event of ['333fm', '333mbf', 'unknown']) {
  assert.throws(() => engine.generate(event));
}
const engineBytes = await readFile(compiled);
const publishedBytes = await readFile(path.join(root, '../public/engine/tnoodle.js'));
assert.deepEqual(publishedBytes, engineBytes, 'Published engine differs from the tested engine');
const proof = JSON.stringify({
  schemaVersion: 1,
  engineVersion: engine.engineVersion(),
  engineSha256: createHash('sha256').update(engineBytes).digest('hex'),
  referenceSha256: createHash('sha256').update(await readFile(path.join(root, 'target/reference-fixtures.jsonl'))).digest('hex'),
  sourceCommit: process.env.GITHUB_SHA || null,
  liveEvents: required,
  cases: results,
  outcome: 'passed',
  scope: 'Node JavaScript runtime against JVM reference. Browser offline/worker tests still required.',
}, null, 2) + '\n';
await writeFile(path.join(root, 'target/conformance-results.json'), proof);
await writeFile(publishedProof, proof);
console.log(`Conformance passed: ${fixtures.length} seeded fixtures and all ${required.length} live generators.`);
