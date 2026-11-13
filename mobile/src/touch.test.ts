import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeTouchTime, solveDuration } from './touch';
test('native touch times measure the solve without JavaScript handling delay', () => {
  // Finger released at 1000 and touched down at 9230 (native clock). JS handled the stop 80 ms late.
  assert.equal(solveDuration(1_000, 9_230, 8_310), 8_230);
});

test('missing or implausible native times fall back to the JavaScript clock', () => {
  assert.equal(solveDuration(null, 9_230, 9_310), 9_310);
  assert.equal(solveDuration(1_000, null, 9_310), 9_310);
  assert.equal(solveDuration(9_230, 1_000, 9_310), 9_310);
  assert.equal(solveDuration(1_000, 900_000, 9_310), 9_310);
});

test('only finite positive native timestamps are used', () => {
  assert.equal(nativeTouchTime({ nativeEvent: { timestamp: 1234.5 } }), 1234.5);
  for (const timestamp of [undefined, 0, -1, Number.NaN, '12']) assert.equal(nativeTouchTime({ nativeEvent: { timestamp } }), null);
  assert.equal(nativeTouchTime({}), null);
});
