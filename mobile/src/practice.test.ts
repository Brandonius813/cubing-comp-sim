import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreRound } from '../../src/core/scoring';
import { parseTimeInput } from '../../src/core/timing';
import type { Scramble } from '../../src/core/types';
import { backDraft, changeEvent, createDraft, confirmScramble, emptySave, manualResult, navigationLocked, pendingInspection, recordResult, recoverDraft, selectedPendingPenalty, selectPendingPenalty, validateMobileSave } from './practice';

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

test('navigation cannot interrupt inspection, holds, solves, or writes', () => {
  assert.equal(navigationLocked('ready', false), false);
  assert.equal(navigationLocked('ready', true), true);
  for (const phase of ['inspection', 'holding', 'running'] as const) assert.equal(navigationLocked(phase, false), true);
});

test('invalid or newer saves fail without silently discarding history', () => {
  assert.throws(() => validateMobileSave({ ...emptySave(), version: 2 }));
  assert.throws(() => validateMobileSave({ ...emptySave(), history: { ...emptySave().history, activeRoundId: 'missing' } }));
});

test('an interrupted timed attempt remains DNF even if its review penalty is changed', () => {
  const save = recordResult(emptySave(), scramble, { rawMs: 10_000, penalty: 'none', inputMethod: 'timer', interrupted: true });
  assert.equal(save.history.rounds[0].attempts[0].penalty, 'DNF');
});

test('legacy saves migrate to zero hold and disabled waits without discarding history', () => {
  const legacy = { ...emptySave(), preferences: { eventId: '333', inspection: true } };
  const migrated = validateMobileSave(legacy);
  assert.equal(migrated.preferences.holdMs, 0);
  assert.equal(migrated.preferences.waitEnabled, false);
  assert.equal(migrated.preferences.waitMode, 'fixed');
  assert.throws(() => validateMobileSave({ ...legacy, preferences: { ...legacy.preferences, holdMs: -1 } }));
});

test('fixed and inclusive random waits are sampled once into a durable draft', () => {
  let samples = 0;
  const fixedPrefs = { ...emptySave().preferences, waitEnabled: true, waitMode: 'fixed' as const, waitSeconds: 15 };
  const fresh = createDraft(scramble, fixedPrefs);
  assert.equal(fresh.phase, 'scramble'); assert.equal(fresh.waitRemainingMs, 0);
  const fixed = confirmScramble(fresh, fixedPrefs, () => { samples++; return 0.5; });
  assert.equal(fixed.phase, 'waiting'); assert.equal(fixed.waitRemainingMs, 15000); assert.equal(samples, 0);
  const preferences = { eventId: '333' as const, inspection: true, waitEnabled: true, waitMode: 'random' as const, waitMinSeconds: 15, waitMaxSeconds: 45 };
  assert.equal(confirmScramble(createDraft(scramble, preferences), preferences, () => 0).waitRemainingMs, 15000);
  assert.equal(confirmScramble(createDraft(scramble, preferences), preferences, () => 0.999999).waitRemainingMs, 45000);
  const save = validateMobileSave({ ...emptySave(), draft: fixed });
  assert.equal(recoverDraft(save).draft?.waitRemainingMs, 0);
  assert.equal(recoverDraft(save).draft?.phase, 'scramble');
  assert.equal(navigationLocked('waiting', false), false);
});

test('unsafe drafts recover as reviewable DNF with the original scramble and stable id', () => {
  for (const phase of ['inspection', 'holding', 'running'] as const) {
    const draft = { ...createDraft(scramble, emptySave().preferences), phase };
    const recovered = recoverDraft({ ...emptySave(), draft });
    assert.equal(recovered.draft?.phase, 'review');
    assert.equal(recovered.draft?.pending?.rawMs, null);
    assert.equal(recovered.draft?.pending?.penalty, 'DNF');
    assert.equal(recovered.draft?.pending?.attemptId, draft.id);
    assert.deepEqual(recovered.draft?.scramble, scramble);
    const stored = recordResult(recovered, scramble, recovered.draft!.pending!);
    assert.equal(stored.history.rounds[0].attempts[0].penalty, 'DNF');
    assert.equal(stored.draft, undefined);
  }
});

test('review drafts survive recovery without changing measured time or explicit correction', () => {
  const draft = createDraft(scramble, emptySave().preferences);
  const pending = { rawMs: 10000, penalty: 'none' as const, inputMethod: 'timer' as const, inspectionMs: 17000, inspectionPenalty: 'none' as const, attemptId: draft.id };
  const save = validateMobileSave({ ...emptySave(), draft: { ...draft, phase: 'review', pending } });
  assert.deepEqual(recoverDraft(save), save);
  assert.equal(recordResult(save, scramble, pending).history.rounds[0].attempts[0].inspectionMs, 17000);
  assert.equal(recordResult(save, scramble, pending).history.rounds[0].attempts[0].inspectionPenalty, 'none');
});

test('repeated save taps are idempotent even on the last attempt of a round', () => {
  let save = emptySave();
  for (let i = 0; i < 5; i++) save = recordResult(save, scramble, { rawMs: 10000, penalty: 'none', inputMethod: 'timer', attemptId: `attempt-${i}` });
  const retried = recordResult(save, scramble, { rawMs: 10000, penalty: 'none', inputMethod: 'timer', attemptId: 'attempt-4' });
  assert.equal(retried, save);
  assert.equal(retried.history.rounds.length, 1);
  assert.equal(retried.history.rounds[0].attempts.length, 5);
});

test('draft validation rejects wrong events, already saved attempts, malformed waits and missing reviews', () => {
  const draft = createDraft(scramble, emptySave().preferences);
  assert.throws(() => validateMobileSave({ ...emptySave(), draft: { ...draft, scramble: { ...scramble, eventId: '222' } } }));
  assert.throws(() => validateMobileSave({ ...emptySave(), draft: { ...draft, phase: 'review' } }));
  assert.throws(() => validateMobileSave({ ...emptySave(), draft: { ...draft, phase: 'waiting', waitRemainingMs: NaN } }));
  assert.throws(() => validateMobileSave({ ...emptySave(), draft: { ...draft, phase: 'waiting', waitRemainingMs: undefined } }));
  const saved = recordResult(emptySave(), scramble, { rawMs: 10000, penalty: 'none', inputMethod: 'timer', attemptId: draft.id });
  assert.throws(() => validateMobileSave({ ...saved, draft }));
});

test('manual inspection uses shared parsing and exact penalty boundaries', () => {
  assert.equal(pendingInspection(manualResult('12.34', '1499', '333'), '333'), 'none');
  assert.equal(pendingInspection(manualResult('12.34', '1500', '333'), '333'), '+2');
  assert.equal(pendingInspection(manualResult('12.34', '1700', '333'), '333'), 'DNF');
  assert.equal(manualResult('10321', '', '333').rawMs, 63210);
  for (const text of ['DNF', 'DNS', '1500+2', 'bad']) assert.throws(() => manualResult('12.34', text, '333'));
  assert.throws(() => manualResult('12.34', '1500', '333bf'));
});

test('unified penalty correction is explicit, retains inspection evidence and cannot clear an interruption', () => {
  const original = manualResult('12.34', '1700', '333');
  assert.equal(selectedPendingPenalty(original, '333'), 'DNF');
  assert.equal(recordResult(emptySave(), scramble, { ...original, rawMs: 10000 }).history.rounds[0].attempts[0].inspectionPenalty, 'DNF');
  const corrected = selectPendingPenalty(original, '+2', '333');
  const attempt = recordResult(emptySave(), scramble, corrected).history.rounds[0].attempts[0];
  assert.equal(attempt.inspectionMs, 17000); assert.equal(attempt.inspectionPenalty, 'none'); assert.equal(attempt.penalty, '+2');
  assert.throws(() => selectPendingPenalty({ ...original, interrupted: true }, 'none', '333'));
  assert.throws(() => selectPendingPenalty(manualResult('DNF', '', '333'), 'none', '333'));
});

test('back preserves the scramble and typed draft, never resumes running clocks', () => {
  const draft = { ...createDraft(scramble, emptySave().preferences), phase: 'review' as const, manualText: '12.34', inspectionText: '1500', pending: manualResult('12.34', '1500', '333') };
  const previous = backDraft(draft);
  assert.equal(previous.phase, 'ready'); assert.equal(previous.manualText, '12.34'); assert.deepEqual(previous.scramble, scramble);
  assert.equal(previous.pending, undefined);
  assert.throws(() => backDraft({ ...draft, phase: 'running' }));
  assert.throws(() => backDraft({ ...draft, pending: { ...draft.pending, inputMethod: 'timer' } }));
});

test('event changes and explicit round abandonment clear only active drafts/unfinished rounds', () => {
  const draft = createDraft(scramble, emptySave().preferences);
  const save = changeEvent({ ...emptySave(), draft }, '222');
  assert.equal(save.draft, undefined); assert.equal(save.preferences.eventId, '222');
});

test('stale result callbacks cannot replace a newer active draft', () => {
  const draft = createDraft(scramble, emptySave().preferences);
  const save = { ...emptySave(), draft };
  assert.throws(() => recordResult(save, scramble, { rawMs: 10000, penalty: 'none', inputMethod: 'timer', attemptId: 'old-attempt' }));
  assert.throws(() => recordResult(save, { ...scramble, generatedAt: 2 }, { rawMs: 10000, penalty: 'none', inputMethod: 'timer', attemptId: draft.id }));
  const result = recordResult(save, scramble, { rawMs: 10000, penalty: 'none', inputMethod: 'timer' });
  assert.equal(result.history.rounds[0].attempts[0].id, draft.id);
});

test('audio defaults are migrated but corrupt explicit values fail closed', () => {
  assert.equal(emptySave().preferences.inspectionAudio, true);
  assert.equal(emptySave().preferences.voiceLanguage, 'en');
  for (const patch of [{ inspectionAudio: null }, { voice: 'robot' }, { voiceVolume: 2 }, { voiceLanguage: 'missing' }]) {
    assert.throws(() => validateMobileSave({ ...emptySave(), preferences: { ...emptySave().preferences, ...patch } }));
  }
});

test('visual preference migrates off and appearance/input controls survive a saved round trip', () => {
  const legacy = emptySave();
  delete legacy.preferences.showScrambleDrawing;
  assert.equal(validateMobileSave(legacy).preferences.showScrambleDrawing, false);
  assert.equal(validateMobileSave({ ...legacy, preferences: { ...legacy.preferences, holdMs: 300 } }).preferences.holdMs, 550);
  const next = validateMobileSave({ ...legacy, preferences: { ...legacy.preferences, showScrambleDrawing: true, theme: 'light', inputMethod: 'manual', holdMs: 550, waitMode: 'random', waitMinSeconds: 0, waitMaxSeconds: 180, voiceVolume: .37, textFont: 'georgia', numberFont: 'system-mono' } });
  const restored = validateMobileSave(JSON.parse(JSON.stringify(next)));
  assert.deepEqual(restored.preferences, next.preferences);
  assert.throws(() => validateMobileSave({ ...next, preferences: { ...next.preferences, showScrambleDrawing: 'yes' } }));
});

test('Ready Screen preserves explicit confirmation and Ready in every event',()=>{
 for(const eventId of ['222','333','444','555','666','777','333oh','333bf','444bf','555bf','minx','pyram','skewb','sq1','fto','clock'] as const){
  const preferences={...emptySave().preferences,eventId,readyScreen:true};const fresh=createDraft({...scramble,eventId},preferences);
  assert.equal(fresh.phase,'scramble');assert.equal(confirmScramble(fresh,preferences).phase,'ready');
 }
});
test('random wait samples on confirmation only and cannot resample an already confirmed draft',()=>{
 const preferences={...emptySave().preferences,waitEnabled:true,waitMode:'random' as const,waitMinSeconds:10,waitMaxSeconds:20};
 const draft=createDraft(scramble,preferences);let calls=0;const random=()=>{calls++;return .5};
 const confirmed=confirmScramble(draft,preferences,random);assert.equal(confirmed.waitRemainingMs,15000);assert.equal(calls,1);
 assert.equal(confirmScramble(confirmed,preferences,random),confirmed);assert.equal(calls,1);
});
test('display preferences migrate and validate without losing custom values',()=>{
 assert.equal(emptySave().preferences.scrambleFontSize,24);assert.equal(emptySave().preferences.timerDisplay,'decimal');
 const save=emptySave();save.preferences={...save.preferences,scrambleFontSize:32,timerDisplay:'solve'};assert.equal(validateMobileSave(save).preferences.scrambleFontSize,32);
 assert.throws(()=>validateMobileSave({...save,preferences:{...save.preferences,scrambleFontSize:200}}));
});


test('no wait and no Ready Screen enters inspection directly, while no-inspection stays armed at zero', () => {
  for (const inspection of [true, false]) {
    const preferences = {...emptySave().preferences, inspection, waitEnabled: false, readyScreen: false};
    assert.equal(confirmScramble(createDraft(scramble, preferences), preferences).phase, inspection ? 'inspection' : 'ready');
    const blind = {...preferences, eventId: '333bf' as const};
    assert.equal(confirmScramble(createDraft({...scramble, eventId: '333bf'}, blind), blind).phase, 'ready');
    const waiting = {...preferences, waitEnabled: true, waitSeconds: 1};
    assert.equal(confirmScramble(createDraft(scramble, waiting), waiting).phase, 'waiting');
  }
  const save = emptySave();
  assert.equal(save.preferences.readyScreen, false);
  assert.equal(validateMobileSave({...save, preferences: {...save.preferences, readyScreen: true}}).preferences.readyScreen, true);
  assert.throws(() => validateMobileSave({...save, preferences: {...save.preferences, readyScreen: 'yes'}}));
});
