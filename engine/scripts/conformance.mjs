import assert from 'node:assert/strict';
import { readFile, copyFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiled = path.join(root, 'target/browser/tnoodle.js');
const modulePath = path.join(root, 'target/browser/tnoodle.mjs');
await copyFile(compiled, modulePath);
const engine = await import(pathToFileURL(modulePath).href);
const lock = JSON.parse(await readFile(path.join(root, 'upstream-lock.json'), 'utf8'));
assert.equal(engine.engineVersion(), `tnoodle-lib@${lock.commit}+webcrypto.1`);
const fixtures = (await readFile(path.join(root, 'target/reference-fixtures.jsonl'), 'utf8'))
  .trim().split('\n').map(line => JSON.parse(line));
const required = ['222', '333', '444', '555', '666', '777', '333oh', '333bf',
  '444bf', '555bf', 'minx', 'pyram', 'skewb', 'sq1', 'fto', 'clock'];
assert.deepEqual([...new Set(fixtures.map(x => x.eventId))].sort(), [...required].sort());

// SVG attribute/style order is not meaningful. JVM and browser HashMaps may
// enumerate differently. Round geometric coordinates only, to 1e-6 pixels.
// Sticker colors, element order, path commands and all other content are exact.
function canonicalSvg(svg) {
  assert.match(svg, /^<svg[\s>]/);
  return svg.replace(/<([A-Za-z][\w:-]*)([^<>]*)>/g, (_, tag, attributes) => {
    const pairs = [...attributes.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => {
      if (key === 'style') {
        value = value.split(';').map(x => x.trim()).filter(Boolean).sort().join(';');
      } else if (/^(x|y|x1|x2|y1|y2|cx|cy|rx|ry|r|width|height|stroke-width|d|points|transform|viewBox)$/.test(key)) {
        value = value.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g,
          number => String(Math.round(Number(number) * 1e6) / 1e6));
      }
      return `${key}="${value}"`;
    }).sort();
    return `<${tag}${pairs.length ? ' ' + pairs.join(' ') : ''}>`;
  }).replace(/>\s+</g, '><').trim();
}

const results = [];
for (const fixture of fixtures) {
  const began = performance.now();
  const [notation, svg] = engine.generateForConformance(fixture.eventId, fixture.seed);
  assert.ok(notation.trim(), fixture.eventId + ': empty scramble');
  // Search timeout may choose another valid notation for the same sampled state.
  assert.equal(canonicalSvg(svg), canonicalSvg(fixture.svg),
    fixture.eventId + ': seeded state differs from JVM reference');
  assert.equal(canonicalSvg(engine.draw(fixture.eventId, fixture.notation)), canonicalSvg(fixture.svg),
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
await writeFile(path.join(root, 'target/conformance-results.json'), JSON.stringify({
  engineVersion: engine.engineVersion(),
  cases: results,
  outcome: 'passed',
  scope: 'Node JavaScript runtime against JVM reference. Browser offline/worker tests still required.',
}, null, 2) + '\n');
console.log(`Conformance passed: ${fixtures.length} seeded fixtures and all ${required.length} live generators.`);
