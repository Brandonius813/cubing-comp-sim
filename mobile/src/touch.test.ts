import assert from 'node:assert/strict';
import test from 'node:test';
import { TimerTouch, nativeTouchTime, solveDuration } from './touch';
const point = (at: number, x = 100, y = 100) => ({ at, x, y });

test('a stationary release measures its actual hold, never displayed animation ticks', () => {
  const touch = new TimerTouch();
  touch.begin(point(100));
  assert.equal(touch.end(point(650)), 550);
  assert.equal(touch.end(point(900)), null);
});

test('a horizontal page swipe cannot become inspection or a timed release', () => {
  const touch = new TimerTouch();
  touch.begin(point(0));
  assert.equal(touch.move(point(50, 113)), false);
  assert.equal(touch.end(point(600)), null);
});

test('native cancellation and additional fingers invalidate an armed hold', () => {
  const touch = new TimerTouch();
  touch.begin(point(0)); touch.cancel();
  assert.equal(touch.end(point(600)), null);
  touch.begin(point(0)); touch.move(point(100), 2);
  assert.equal(touch.end(point(600)), null);
});

test('invalid coordinates and a reversed monotonic clock cancel rather than starting a solve', () => {
  const touch = new TimerTouch();
  touch.begin(point(100)); assert.equal(touch.end(point(50)), null);
  touch.begin(point(0)); assert.equal(touch.move(point(10, NaN)), false);
  touch.begin(point(Infinity)); assert.equal(touch.end(point(100)), null);
});

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
