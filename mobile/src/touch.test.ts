import assert from 'node:assert/strict';
import test from 'node:test';
import { TimerTouch } from './touch';
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
