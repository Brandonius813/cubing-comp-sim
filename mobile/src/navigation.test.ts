import assert from 'node:assert/strict';
import test from 'node:test';
import { pageDeparture } from './navigation';
import type { TimerPhase } from './practice';

test('review navigation preserves the pending result on both adjacent pages', () => {
  for (const page of [0, 2]) assert.equal(pageDeparture('review', page, true), 'keep');
});
test('ready and waiting permit navigation without inventing interrupted solves', () => {
  for (const page of [0, 2]) for (const phase of ['ready', 'waiting'] as const) assert.equal(pageDeparture(phase, page, false), 'keep');
});
test('leaving either active clock interrupts; an unstarted hold just cancels', () => {
  for (const page of [0, 2]) {
    assert.equal(pageDeparture('running', page, false), 'interrupt');
    assert.equal(pageDeparture('inspection', page, true), 'interrupt');
    assert.equal(pageDeparture('holding', page, true), 'interrupt');
    assert.equal(pageDeparture('holding', page, false), 'cancel-hold');
  }
});
test('selecting practice never changes an active or pending solve', () => {
  for (const phase of ['ready', 'waiting', 'inspection', 'holding', 'running', 'review'] as TimerPhase[]) {
    assert.equal(pageDeparture(phase, 1, false), 'keep');
    assert.equal(pageDeparture(phase, 1, true), 'keep');
  }
});
