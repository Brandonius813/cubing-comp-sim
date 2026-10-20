import assert from 'node:assert/strict';
import test from 'node:test';
import { createSaveRepository, type SaveDriver } from './storage-core';
import { emptySave, recordResult, recoverDraft, validateMobileSave } from './practice';
import { exportHistory, prepareHistoryReplacement, updateHistoryAttempt, eventSummary } from './history';

function memoryDriver() {
  let body: string | null = null;
  let recovery: string | null = null;
  let fail = false;
  const writes: string[] = [];
  const driver: SaveDriver = {
    async read() { return body; }, async readRecovery() { return recovery; },
    async write(next, backup) {
      await Promise.resolve();
      if (fail) { fail = false; throw new Error('Disk full'); }
      if (backup) recovery = body;
      body = next; writes.push(next);
    },
  };
  return { repository: createSaveRepository(driver), writes, failNext: () => { fail = true; }, corrupt: () => { body = '{'; } };
}
const scramble = { eventId: '333' as const, notation: 'R U', svg: '<svg/>', engineVersion: 'test', generatedAt: 1 };
const result = { rawMs: 10_000, penalty: 'none' as const, inputMethod: 'manual' as const };

test('queued writes capture immutable snapshots and survive an earlier rejection', async () => {
  const { repository, failNext, writes } = memoryDriver();
  const first = emptySave();
  const next = recordResult(first, scramble, result);
  failNext();
  const a = repository.store(first);
  const b = repository.store(next);
  next.history.rounds.length = 0;
  await assert.rejects(a, /Disk full/); await b;
  assert.equal((await repository.load()).history.rounds.length, 1);
  assert.equal(writes.length, 1);
});

test('replacement preserves recovery and a failed replacement preserves both copies', async () => {
  const { repository, failNext } = memoryDriver();
  const first = recordResult(emptySave(), scramble, result);
  await repository.store(first);
  await repository.replace(emptySave());
  assert.deepEqual(await repository.loadRecovery(), first);
  failNext();
  await assert.rejects(repository.replace(first), /Disk full/);
  assert.equal((await repository.load()).history.rounds.length, 0);
  assert.deepEqual(await repository.loadRecovery(), first);
  assert.deepEqual(await repository.restoreRecovery(), first);
  assert.equal((await repository.loadRecovery())?.history.rounds.length, 0);
});

test('invalid/newer saves and corrupt on-disk saves never silently reset history', async () => {
  const { repository, writes, corrupt } = memoryDriver();
  assert.throws(() => repository.store({ ...emptySave(), version: 999 } as never));
  assert.equal(writes.length, 0);
  corrupt();
  await assert.rejects(repository.load());
  assert.equal(writes.length, 0);
});

test('portable import validates before replacement and selects the imported active event', () => {
  const original = emptySave();
  const source = recordResult(original, scramble, result);
  const differentEvent = { ...original, preferences: { ...original.preferences, eventId: '222' as const } };
  const imported = prepareHistoryReplacement(differentEvent, exportHistory(source));
  assert.equal(imported.preferences.eventId, '333');
  assert.deepEqual(imported.history.rounds, source.history.rounds);
  assert.throws(() => prepareHistoryReplacement(original, '{bad'));
  assert.throws(() => prepareHistoryReplacement(original, JSON.stringify({ ...source.history, activeRoundId: 'missing' })));
  assert.equal(original.history.rounds.length, 0);
});

test('history corrections retain provenance and recompute derived statistics', () => {
  const save = recordResult(emptySave(), scramble, { ...result, inspectionMs: 15_000 });
  const round = save.history.rounds[0];
  const attempt = round.attempts[0];
  const corrected = updateHistoryAttempt(save, round.id, attempt.id, { rawMs: 11_000, penalty: '+2', inspectionPenalty: 'none' });
  assert.deepEqual(corrected.history.rounds[0].attempts[0].scramble, attempt.scramble);
  assert.equal(corrected.history.rounds[0].attempts[0].recordedAt, attempt.recordedAt);
  assert.equal(eventSummary(corrected, '333').bestSingle, 13_000);
  assert.equal(eventSummary(save, '333').bestSingle, 12_000);
  assert.throws(() => updateHistoryAttempt(save, round.id, attempt.id, { rawMs: null, penalty: 'none', inspectionPenalty: 'none' }));
  assert.throws(() => updateHistoryAttempt(save, 'missing', attempt.id, {}));
});


test('durable drafts recover interrupted timing without inventing a result and imports retain a recovery copy', async () => {
  const { repository } = memoryDriver();
  const save = validateMobileSave({ ...emptySave(), draft: { id: 'draft-1', phase: 'running', scramble, manualText: '12.34' } });
  await repository.store(save);
  const loaded = await repository.load();
  assert.equal(loaded.draft?.scramble.notation, scramble.notation);
  assert.equal(loaded.draft?.manualText, '12.34');
  const recovered = recoverDraft(loaded);
  assert.equal(recovered.draft?.phase, 'review');
  assert.equal(recovered.draft?.pending?.rawMs, null);
  assert.equal(recovered.draft?.pending?.penalty, 'DNF');
  assert.equal(recovered.history.rounds.length, 0);
  const replacement = prepareHistoryReplacement(loaded, exportHistory(emptySave()));
  assert.equal(replacement.draft, undefined);
  await repository.replace(replacement);
  assert.deepEqual(await repository.loadRecovery(), save);
});
