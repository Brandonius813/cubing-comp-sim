import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSvg } from './svg-conformance.mjs';

function face(index) {
  const x = index * 20;
  const d = `M ${x} 0 L ${x + 8} 0 L ${x + 10} 5 L ${x + 4} 10 L ${x - 2} 5 Z`;
  return Array.from({length: 11}, (_, i) => `<path d="${d}" fill="${i % 2 ? '#ff0000' : '#00ff00'}" stroke="#000000"></path>`).join('');
}
const faces = Array.from({length: 12}, (_, i) => face(i));
const svg = list => '<svg><g>' + list.join('') + '</g></svg>';

test('only complete, disjoint Megaminx face ordering is normalized', () => {
  assert.equal(canonicalSvg(svg(faces), 'minx'), canonicalSvg(svg([...faces].reverse()), 'minx'));
  assert.notEqual(canonicalSvg(svg(faces), '333'), canonicalSvg(svg([...faces].reverse()), '333'));
});

test('sticker colors, geometry and within-face paint order remain significant', () => {
  const original = canonicalSvg(svg(faces), 'minx');
  assert.notEqual(original, canonicalSvg(svg(faces).replace('#00ff00', '#0000ff'), 'minx'));
  assert.notEqual(original, canonicalSvg(svg(faces).replace('M 0 0', 'M 0.01 0'), 'minx'));
  const reordered = [...faces];
  const paths = reordered[0].match(/<path[^>]*><\/path>/g);
  [paths[0], paths[1]] = [paths[1], paths[0]];
  reordered[0] = paths.join('');
  assert.notEqual(original, canonicalSvg(svg(reordered), 'minx'));
});

test('missing, duplicated or overlapping faces fail rather than being normalized', () => {
  assert.throws(() => canonicalSvg(svg(faces.slice(1)), 'minx'));
  assert.throws(() => canonicalSvg(svg([...faces.slice(1), faces[1]]), 'minx'));
  const overlapping = [...faces];
  overlapping[1] = face(0.1);
  assert.throws(() => canonicalSvg(svg(overlapping), 'minx'));
});
