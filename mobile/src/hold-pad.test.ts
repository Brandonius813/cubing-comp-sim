import assert from 'node:assert/strict';
import test from 'node:test';
import { HoldPad, type HoldPadEvent, type PadInput } from './hold-pad';

const types = (events: HoldPadEvent[]) => events.map(event => event.type);
const finger = (id: number, x = 100, y = 600) => ({ id, x, y });
/** One event: `changed` fingers, `remaining` fingers on screen afterwards, JS time, native time. */
const input = (changed: ReturnType<typeof finger>[], remaining: number, at: number, nativeAt: number | null = at + 5000): PadInput =>
  ({ changed, remaining, at, nativeAt });

function pad(holdMs = 550) { return new HoldPad(() => holdMs); }

test('a normal hold goes red, turns green after the hold time, and starts at lift-off', () => {
  const p = pad();
  assert.deepEqual(types(p.press(input([finger(1)], 1, 0), 'hold')), ['holdStart']);
  assert.deepEqual(p.tick(300), []);
  assert.equal(p.armed, false);
  assert.deepEqual(types(p.tick(560)), ['armed']);
  assert.equal(p.armed, true);
  assert.deepEqual(p.tick(600), [], 'armed is reported once');
  assert.deepEqual(p.release(input([finger(1)], 0, 900, 5900)), [{ type: 'start', nativeAt: 5900 }]);
});

test('releasing before the hold time aborts instead of starting', () => {
  const p = pad();
  p.press(input([finger(1)], 1, 0), 'hold');
  p.tick(200);
  assert.deepEqual(types(p.release(input([finger(1)], 0, 300))), ['holdAbort']);
});

test('with no hold time the press is green immediately and release starts', () => {
  const p = pad(0);
  assert.deepEqual(types(p.press(input([finger(1)], 1, 0), 'hold')), ['holdStart', 'armed']);
  assert.deepEqual(types(p.release(input([finger(1)], 0, 50))), ['start']);
});

test('a thumb drifting and rolling while held never cancels the hold (seen on device)', () => {
  const p = pad();
  p.press(input([finger(1, 100, 600)], 1, 0), 'hold');
  for (let i = 1; i <= 20; i++) p.move(input([finger(1, 100 + i * 4, 600 - i * 3)], 1, i * 30));
  assert.deepEqual(types(p.tick(600)), ['armed']);
  // Lift-off lands 80 points away from where the thumb first touched.
  assert.deepEqual(types(p.release(input([finger(1, 180, 540)], 0, 700))), ['start']);
});

test('green always starts: lift-off just after green, even with a different lift position', () => {
  const p = pad();
  p.press(input([finger(1)], 1, 0), 'hold');
  p.tick(551);
  assert.deepEqual(types(p.release(input([finger(1, 300, 300)], 0, 552))), ['start']);
});

test('a palm or second finger touching and lifting during a hold changes nothing', () => {
  const p = pad();
  p.press(input([finger(1)], 1, 0), 'hold');
  assert.deepEqual(p.press(input([finger(2, 350, 780)], 2, 100), 'hold'), [], 'second finger ignored');
  assert.deepEqual(p.release(input([finger(2, 350, 780)], 1, 200)), [], 'palm lifting does not end the hold');
  p.tick(600);
  assert.deepEqual(types(p.release(input([finger(1)], 0, 800))), ['start']);
});

test('the solve starts only when the last finger lifts, whichever finger that is', () => {
  const p = pad();
  p.press(input([finger(1)], 1, 0), 'hold');
  p.press(input([finger(2)], 2, 50), 'hold');
  p.tick(600);
  assert.deepEqual(p.release(input([finger(1)], 1, 700)), [], 'first finger up, second still down');
  assert.deepEqual(types(p.release(input([finger(2)], 0, 750))), ['start']);
});

test('two fingers landing in the same event start one hold', () => {
  const p = pad();
  assert.deepEqual(types(p.press(input([finger(1), finger(2)], 2, 0), 'hold')), ['holdStart']);
  p.tick(600);
  assert.deepEqual(types(p.release(input([finger(1), finger(2)], 0, 700))), ['start']);
});

test('if the OS cancels an armed hold, the solve still starts; an unarmed one aborts', () => {
  const armed = pad();
  armed.press(input([finger(1)], 1, 0), 'hold');
  armed.tick(600);
  assert.deepEqual(types(armed.cancel(650)), ['start']);
  const early = pad();
  early.press(input([finger(1)], 1, 0), 'hold');
  assert.deepEqual(types(early.cancel(100)), ['holdAbort']);
});

test('a lost lift event cannot jam the pad: a fresh single touch starts over', () => {
  const p = pad();
  p.press(input([finger(1)], 1, 0), 'hold');
  // The lift for finger 1 never arrives. The OS reports only the new finger is down.
  assert.deepEqual(types(p.press(input([finger(7)], 1, 5000), 'hold')), ['holdStart']);
  p.tick(5600);
  assert.deepEqual(types(p.release(input([finger(7)], 0, 5700))), ['start']);
});

test('stop fires at touch-down with the native time, and fingers left down do nothing more', () => {
  const p = pad();
  assert.deepEqual(p.press(input([finger(1)], 1, 0, 12345), 'stop'), [{ type: 'stop', nativeAt: 12345 }]);
  assert.deepEqual(p.press(input([finger(2)], 2, 10), 'hold'), [], 'second hand slapping down is ignored');
  assert.deepEqual(p.release(input([finger(1)], 1, 100)), []);
  assert.deepEqual(p.release(input([finger(2)], 0, 150)), [], 'lifting after a stop does nothing');
});

test('after a stop, the next fresh press is a new gesture', () => {
  const p = pad();
  p.press(input([finger(1)], 1, 0), 'stop');
  p.release(input([finger(1)], 0, 100));
  assert.deepEqual(types(p.press(input([finger(2)], 1, 2000), 'hold')), ['holdStart']);
});

test('tap fires on release; swipeTap is dropped if a finger moved like a page swipe', () => {
  const tap = pad();
  tap.press(input([finger(1)], 1, 0), 'tap');
  assert.deepEqual(types(tap.release(input([finger(1, 160)], 0, 100))), ['tap'], 'paging is locked, so drift is fine');
  const still = pad();
  still.press(input([finger(1)], 1, 0), 'swipeTap');
  still.move(input([finger(1, 105)], 1, 50));
  assert.deepEqual(types(still.release(input([finger(1, 106)], 0, 100))), ['tap']);
  const swipe = pad();
  swipe.press(input([finger(1)], 1, 0), 'swipeTap');
  swipe.move(input([finger(1, 160)], 1, 50));
  assert.deepEqual(swipe.release(input([finger(1, 220)], 0, 100)), []);
  const liftSwipe = pad();
  liftSwipe.press(input([finger(1)], 1, 0), 'swipeTap');
  assert.deepEqual(liftSwipe.release(input([finger(1, 200)], 0, 80)), [], 'a fast flick seen only at lift-off is a swipe');
});

test('reset ignores fingers already down, then accepts the next fresh press', () => {
  const p = pad();
  p.press(input([finger(1)], 1, 0), 'hold');
  p.reset();
  assert.deepEqual(p.release(input([finger(1)], 0, 900)), [], 'the abandoned hold does not start');
  assert.deepEqual(types(p.press(input([finger(2)], 1, 1000), 'hold')), ['holdStart']);
});

test('ignore swallows the whole gesture', () => {
  const p = pad();
  p.press(input([finger(1)], 1, 0), 'ignore');
  assert.deepEqual(p.tick(1000), []);
  assert.deepEqual(p.release(input([finger(1)], 0, 1000)), []);
});

test('a missing finger count from the OS never splits a hold in two', () => {
  const p = pad();
  p.press(input([finger(1)], 1, 0), 'hold');
  assert.deepEqual(p.press(input([finger(2)], Number.NaN, 100), 'hold'), []);
  p.tick(600);
  assert.deepEqual(p.release(input([finger(2)], Number.NaN, 700)), [], 'finger 1 is still down');
  assert.deepEqual(types(p.release(input([finger(1)], Number.NaN, 750))), ['start']);
});
