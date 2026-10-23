import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativeScrambleSvg } from './scramble-svg';

const drawing = '<svg><path d="M 1 2 L 3 4"/><text dy="5.0px" text-anchor="middle" x="84.196" y="65.541" style="font-family:sans-serif;">U\n\t</text><text x="84.196" y="114.082">F</text></svg>';
test('Megaminx labels become centered vectors without changing face geometry', () => {
  const result = nativeScrambleSvg(drawing, 'minx');
  assert.match(result, /<path d="M 1 2 L 3 4"\/>/);
  assert.match(result, /translate\(84.196 65.541\)/);
  assert.match(result, /translate\(84.196 114.082\)/);
  assert.doesNotMatch(result, /<text/);
});
test('other puzzles and invalid label positions are untouched', () => {
  assert.equal(nativeScrambleSvg(drawing, '333'), drawing);
  const invalid = '<svg><text x="invalid" y="12">U</text><text x="1">F</text></svg>';
  assert.equal(nativeScrambleSvg(invalid, 'minx'), invalid);
});
