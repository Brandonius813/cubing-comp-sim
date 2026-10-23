import assert from 'node:assert/strict';
import test from 'node:test';
import { pagingLocked } from './navigation';
test('inspection and solving cannot be interrupted by page gestures', () => {
  for (const phase of ['inspection','holding','running'] as const) assert.equal(pagingLocked(phase),true);
});
test('scramble, wait, ready and stopped review permit page gestures', () => {
  for (const phase of ['scramble','waiting','ready','review'] as const) assert.equal(pagingLocked(phase),false);
});
test('slider touch suppresses paging until release in every otherwise unlocked phase', () => {
  for (const phase of ['scramble','waiting','ready','review'] as const) { assert.equal(pagingLocked(phase,true),true); assert.equal(pagingLocked(phase,false),false); }
});
