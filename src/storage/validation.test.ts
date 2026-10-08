import { describe, expect, it } from 'vitest';
import { addAttempt, attemptTimeMs, createAttempt, createRound } from '../core';
import { InvalidSaveError, parseHistoryJson, validateHistorySnapshot } from './validation';
import type { HistorySnapshot } from './validation';
import { DEFAULT_SETTINGS, validateDraft, validateSettings } from './settings';

function validSnapshot(): HistorySnapshot {
  let round = createRound('333');
  round = addAttempt(round, createAttempt(round, { rawMs: 12_345, inputMethod: 'timer', scramble: { eventId: '333', notation: 'R U', svg: '<svg/>', engineVersion: 'unit-test-fixture', generatedAt: 100 } }));
  return { app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: 200, rounds: [round], activeRoundId: round.id };
}

describe('portable save validation', () => {
  it('round-trips a valid save, including original millisecond precision', () => {
    const original = validSnapshot();
    expect(parseHistoryJson(JSON.stringify(original))).toEqual(original);
    expect(original.rounds[0].attempts[0].rawMs).toBe(12_345);
  });
  it('rejects corruption instead of replacing data with defaults', () => {
    expect(() => parseHistoryJson('broken')).toThrow(InvalidSaveError);
    expect(() => parseHistoryJson('{}')).toThrow(InvalidSaveError);
    expect(() => validateHistorySnapshot({ ...validSnapshot(), schemaVersion: 2 })).toThrow(/version/);
  });
  it('rejects broken round references and duplicate IDs', () => {
    const data = validSnapshot();
    expect(() => validateHistorySnapshot({ ...data, activeRoundId: 'missing' })).toThrow(/missing/);
    expect(() => validateHistorySnapshot({ ...data, rounds: [...data.rounds, ...data.rounds] })).toThrow(/Duplicate/);
    data.rounds[0].attempts[0].roundId = 'not-this-round';
    expect(() => validateHistorySnapshot(data)).toThrow(/reference/);
  });
  it('rejects incomplete, invalid, or mismatched attempts', () => {
    const data = validSnapshot();
    data.rounds[0].attempts[0].rawMs = NaN;
    expect(() => validateHistorySnapshot(data)).toThrow(/time/);
    data.rounds[0].attempts[0].rawMs = null;
    expect(() => validateHistorySnapshot(data)).toThrow(/result/);
    data.rounds[0].attempts[0].penalty = 'DNF';
    expect(validateHistorySnapshot(data).rounds[0].attempts[0].rawMs).toBeNull();
    data.rounds[0].attempts[0].scramble.eventId = '222';
    expect(() => validateHistorySnapshot(data)).toThrow(/event/);
  });
  it('strips unrelated fields rather than restoring account or device state', () => {
    const clean = validateHistorySnapshot({ ...validSnapshot(), password: 'never-restore', settings: { language: 'other' } });
    expect('password' in clean).toBe(false);
    expect('settings' in clean).toBe(false);
  });
  it('accepts an explicitly empty history', () => {
    expect(validateHistorySnapshot({ app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: 0, activeRoundId: null, rounds: [] }).rounds).toEqual([]);
  });
  it('round-trips cumulative penalties as separate values', () => {
    const data = validSnapshot();
    const attempt = data.rounds[0].attempts[0];
    attempt.penalty = '+2';
    attempt.inspectionPenalty = '+2';
    attempt.inspectionMs = 15_000;
    const restored = parseHistoryJson(JSON.stringify(data)).rounds[0].attempts[0];
    expect(restored.penalty).toBe('+2');
    expect(restored.inspectionPenalty).toBe('+2');
    expect(attemptTimeMs(restored)).toBe(16_340);
  });
  it('preserves old v1 totals without inferring a second inspection penalty', () => {
    const data = validSnapshot();
    const legacy = JSON.parse(JSON.stringify(data));
    legacy.rounds[0].attempts[0].penalty = '+2';
    legacy.rounds[0].attempts[0].inspectionMs = 15_000;
    delete legacy.rounds[0].attempts[0].inspectionPenalty;
    const restored = validateHistorySnapshot(legacy).rounds[0].attempts[0];
    expect(restored.inspectionPenalty).toBe('none');
    expect(attemptTimeMs(restored)).toBe(14_340);
  });
  it('rejects unsupported inspection penalty values', () => {
    const data = validSnapshot();
    const invalid = JSON.parse(JSON.stringify(data));
    invalid.rounds[0].attempts[0].inspectionPenalty = '+4';
    expect(() => validateHistorySnapshot(invalid)).toThrow(/inspection penalty/);
  });
  it('removes historical SVG from legacy imports and keeps active-draft drawings', () => {
    const data = JSON.parse(JSON.stringify(validSnapshot()));
    data.rounds[0].attempts[0].scramble.svg = '<svg><script>untrusted()</script></svg>';
    const normalized = validateHistorySnapshot(data);
    expect('svg' in normalized.rounds[0].attempts[0].scramble).toBe(false);
    expect(JSON.stringify(normalized)).not.toContain('untrusted');
    const draft = validateDraft({ roundId: data.rounds[0].id, scramble: data.rounds[0].attempts[0].scramble, stage: 'ready', savedAt: 200 }, '333');
    expect(draft.scramble.svg).toContain('<svg>');
  });
});

describe('device settings validation', () => {
  it('keeps the approved defaults and rejects out-of-range timing controls', () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS })).toEqual(DEFAULT_SETTINGS);
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, holdMs: -1 })).toThrow();
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, waitSeconds: Infinity })).toThrow();
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, goalMs: 1.5 })).toThrow();
    expect(validateSettings({ ...DEFAULT_SETTINGS, language: 'es' }).language).toBe('es');
  });
});
