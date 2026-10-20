import assert from 'node:assert/strict';
import test from 'node:test';
import { EVENTS } from '../../src/core/events';
import { scoreRound } from '../../src/core/scoring';
import { formatAttempt } from '../../src/core/timing';
import { changeEvent, createDraft, emptySave, manualResult, recordResult, recoverDraft, selectPendingPenalty, validateMobileSave, type MobileSave, type PendingResult } from './practice';

// Contract integration, not a native UI or TNoodle test. Synthetic notation is
// deliberately marked test-only; engine correctness is verified separately.
const restart = (save: MobileSave) => recoverDraft(validateMobileSave(JSON.parse(JSON.stringify(save))));

for (const event of EVENTS) {
  for (const inputMethod of ['timer', 'manual'] as const) {
    test(`${event.id}: ${inputMethod} round survives draft/review restarts and repeated confirmation`, () => {
      let save = changeEvent(emptySave(), event.id);
      for (let i = 0; i < event.attemptCount; i++) {
        const scramble = { eventId: event.id, notation: `synthetic-${i}`, svg: '<svg/>', engineVersion: 'contract-test-only', generatedAt: i };
        const draft = createDraft(scramble, save.preferences);
        save = restart({ ...save, draft });
        assert.equal(save.draft?.phase, 'ready');
        assert.equal(save.history.rounds.flatMap(round => round.attempts).length, i);
        const pending: PendingResult = inputMethod === 'manual'
          ? manualResult('12.34', event.inspection ? '1000' : '', event.id, draft.id)
          : { rawMs: 12340, penalty: 'none', inputMethod, attemptId: draft.id, ...(event.inspection ? { inspectionMs: 10000 } : {}) };
        save = restart({ ...save, draft: { ...draft, phase: 'review', pending } });
        assert.equal(save.draft?.pending?.rawMs, 12340);
        const committed = recordResult(save, scramble, save.draft!.pending!);
        assert.equal(recordResult(committed, scramble, pending), committed);
        save = restart(committed);
        assert.equal(save.draft, undefined);
        assert.equal(save.history.rounds.length, 1);
        assert.equal(save.history.rounds[0].attempts.length, i + 1);
        assert.equal(save.history.rounds[0].attempts[i].scramble.notation, scramble.notation);
      }
      assert.equal(save.history.activeRoundId, null);
      assert.equal(scoreRound(save.history.rounds[0]).valueMs, 12340);
    });
  }
}

test('review correction, interruption, abandonment and subsequent round remain isolated', () => {
  const scramble = { eventId: '333' as const, notation: 'synthetic', svg: '<svg/>', engineVersion: 'contract-test-only', generatedAt: 1 };
  let save = emptySave();
  let draft = createDraft(scramble, save.preferences);
  const correction = selectPendingPenalty(manualResult('12.34', '1700', '333', draft.id), 'none', '333');
  save = restart({ ...save, draft: { ...draft, phase: 'review', pending: correction } });
  save = recordResult(save, scramble, save.draft!.pending!);
  assert.equal(formatAttempt(save.history.rounds[0].attempts[0]), '12.34');
  assert.equal(save.history.rounds[0].attempts[0].inspectionMs, 17000);
  draft = createDraft(scramble, save.preferences);
  save = restart({ ...save, draft: { ...draft, phase: 'running' } });
  const interrupted = save.draft!.pending!;
  assert.equal(interrupted.rawMs, null);
  save = recordResult(save, scramble, interrupted);
  assert.equal(formatAttempt(save.history.rounds[0].attempts[1]), 'DNF');
  save = changeEvent(save, '222');
  assert.equal(save.history.rounds.length, 0);
  assert.equal(save.draft, undefined);
  assert.equal(save.preferences.eventId, '222');
});
