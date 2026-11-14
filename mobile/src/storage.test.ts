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


test('draft writes preserve newer preferences committed before their queued read', async () => {
  const { repository } = memoryDriver();
  const initial = emptySave();
  await repository.store(initial);
  const newer = { ...initial, preferences: { ...initial.preferences, holdMs: 550, inspection: false } };
  const settingsWrite = repository.store(newer);
  const draftWrite = repository.storeDraft({ id: 'new-draft', phase: 'ready', scramble }, initial.history);
  await settingsWrite;
  assert.equal(await draftWrite, true);
  const loaded = await repository.load();
  assert.equal(loaded.preferences.holdMs, 550);
  assert.equal(loaded.preferences.inspection, false);
  assert.equal(loaded.draft?.id, 'new-draft');
});

test('stale draft writes cannot overwrite history edits, replacements, or confirmed IDs', async () => {
  const { repository } = memoryDriver();
  const initial = emptySave();
  await repository.store(initial);
  const confirmed = recordResult(initial, scramble, { ...result, attemptId: 'confirmed' });
  await repository.store(confirmed);
  assert.equal(await repository.storeDraft({ id: 'stale', phase: 'ready', scramble }, initial.history), false);
  assert.equal(await repository.storeDraft({ id: 'confirmed', phase: 'ready', scramble }, confirmed.history), false);
  const round = confirmed.history.rounds[0];
  const edited = updateHistoryAttempt(confirmed, round.id, round.attempts[0].id, { rawMs: 15000 });
  await repository.store(edited);
  assert.equal(await repository.storeDraft({ id: 'before-edit', phase: 'ready', scramble }, confirmed.history), false);
  assert.deepEqual(await repository.load(), edited);
  const replacement = prepareHistoryReplacement(edited, exportHistory(initial));
  await repository.replace(replacement);
  assert.equal(await repository.storeDraft({ id: 'before-replace', phase: 'ready', scramble }, edited.history), false);
  assert.deepEqual(await repository.load(), replacement);
});

test('draft writes require initialized storage and the currently selected event', async () => {
  const { repository } = memoryDriver();
  const initial = emptySave();
  const draft = { id: 'event-333', phase: 'ready' as const, scramble };
  assert.equal(await repository.storeDraft(draft, initial.history), false);
  const other = { ...initial, preferences: { ...initial.preferences, eventId: '222' as const } };
  await repository.store(other);
  assert.equal(await repository.storeDraft(draft, initial.history), false);
  assert.deepEqual(await repository.load(), other);
});


test('same-history stale callbacks cannot replace a newer unsaved draft', async () => {
  const { repository } = memoryDriver();
  const initial = emptySave();
  await repository.store(initial);
  assert.equal(await repository.storeDraft({ id: 'current', phase: 'ready', scramble }, initial.history), true);
  assert.equal(await repository.storeDraft({ id: 'retired', phase: 'ready', scramble }, initial.history), false);
  assert.equal((await repository.load()).draft?.id, 'current');
  assert.equal(await repository.storeDraft({ id: 'current', phase: 'inspection', scramble }, initial.history), true);
  assert.equal((await repository.load()).draft?.phase, 'inspection');
});
