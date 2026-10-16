import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreRound } from '../../src/core/scoring';
import { parseTimeInput } from '../../src/core/timing';
import type { Scramble } from '../../src/core/types';
import { changeEvent, emptySave, navigationLocked, recordResult, validateMobileSave } from './practice';

// Synthetic notation is test input only. The application uses bundled TNoodle.
const scramble: Scramble = { eventId: '333', notation: 'R U', svg: '<svg/>', engineVersion: 'test', generatedAt: 1 };

test('five saved attempts complete a portable Ao5 using shared scoring', () => {
  let save = emptySave();
  for (const rawMs of [10_000, 11_000, 12_000, 13_000, 14_000]) {
    save = recordResult(save, scramble, { rawMs, penalty: 'none', inputMethod: 'timer' });
    save = validateMobileSave(JSON.parse(JSON.stringify(save)));
  }
  assert.equal(save.history.rounds.length, 1);
  assert.equal(save.history.activeRoundId, null);
  assert.equal(scoreRound(save.history.rounds[0]).valueMs, 12_000);
});

test('inspection and additional penalties remain separate in the portable save', () => {
  const save = recordResult(emptySave(), scramble, { rawMs: 10_000, inspectionMs: 15_000, penalty: '+2', inputMethod: 'timer' });
  assert.equal(save.history.rounds[0].attempts[0].inspectionPenalty, '+2');
  assert.equal(save.history.rounds[0].attempts[0].penalty, '+2');
  assert.equal(save.history.rounds[0].attempts[0].rawMs, 10_000);
});

test('changing events removes only the unfinished round', () => {
  let save = emptySave();
  for (let i = 0; i < 6; i++) save = recordResult(save, scramble, { rawMs: 10_000, penalty: 'none', inputMethod: 'manual' });
  save = changeEvent(save, '222');
  assert.equal(save.history.rounds.length, 1);
  assert.ok(save.history.rounds[0].completedAt);
  assert.equal(save.history.activeRoundId, null);
});

test('manual entry and event isolation use the website contracts', () => {
  assert.equal(parseTimeInput('10321')?.rawMs, 63_210);
  assert.throws(() => recordResult(emptySave(), { ...scramble, eventId: '222' }, { rawMs: 10_000, penalty: 'none', inputMethod: 'manual' }));
});

test('navigation cannot interrupt inspection, holds, solves, review, or writes', () => {
  assert.equal(navigationLocked('ready', false), false);
  assert.equal(navigationLocked('ready', true), true);
  for (const phase of ['inspection', 'holding', 'running', 'review'] as const) assert.equal(navigationLocked(phase, false), true);
});

test('invalid or newer saves fail without silently discarding history', () => {
  assert.throws(() => validateMobileSave({ ...emptySave(), version: 2 }));
  assert.throws(() => validateMobileSave({ ...emptySave(), history: { ...emptySave().history, activeRoundId: 'missing' } }));
});

test('an interrupted timed attempt remains DNF even if its review penalty is changed', () => {
  const save = recordResult(emptySave(), scramble, { rawMs: 10_000, penalty: 'none', inputMethod: 'timer', interrupted: true });
  assert.equal(save.history.rounds[0].attempts[0].penalty, 'DNF');
});
