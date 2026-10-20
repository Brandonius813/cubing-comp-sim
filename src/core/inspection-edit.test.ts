import { describe, expect, it } from 'vitest';
import { addAttempt, createAttempt, createRound, editAttempt, formatAttempt, scoreRound } from './index';
import { validateRound } from '../storage/validation';

describe('correcting inspection penalties', () => {
  const withInspection = (inspectionMs: number, rawMs: number | null = 12000) => {
    const round = createRound('333');
    return addAttempt(round, createAttempt(round, { rawMs, inspectionMs, inputMethod: 'timer', scramble: { eventId: '333', notation: 'R U', svg: '<svg/>', engineVersion: 'test', generatedAt: 1 } }));
  };
  it('keeps automatic DNF unless explicitly corrected, then persists the correction', () => {
    const round = withInspection(17000);
    const id = round.attempts[0].id;
    expect(formatAttempt(editAttempt(round, id, { rawMs: 10000 }).attempts[0])).toBe('DNF');
    const edited = validateRound(JSON.parse(JSON.stringify(editAttempt(round, id, { rawMs: 10000, inspectionPenalty: 'none' }))));
    expect(formatAttempt(edited.attempts[0])).toBe('10.00');
    expect(edited.attempts[0].inspectionMs).toBe(17000);
    expect(round.attempts[0].inspectionPenalty).toBe('DNF');
  });
  it('can change DNF to +2 and preserve an independent manual penalty', () => {
    const round = withInspection(18000);
    const corrected = editAttempt(round, round.attempts[0].id, { inspectionPenalty: '+2', penalty: '+2' });
    expect(formatAttempt(corrected.attempts[0])).toBe('16.00+4');
    const cleared = editAttempt(corrected, corrected.attempts[0].id, { inspectionPenalty: 'none' });
    expect(formatAttempt(cleared.attempts[0])).toBe('14.00+');
  });
  it('requires a time before removing a time-less DNF', () => {
    const round = withInspection(17000, null);
    expect(() => editAttempt(round, round.attempts[0].id, { inspectionPenalty: 'none' })).toThrow();
    expect(formatAttempt(editAttempt(round, round.attempts[0].id, { inspectionPenalty: 'none', rawMs: 12340 }).attempts[0])).toBe('12.34');
  });
  it('recalculates a completed average after an inspection DNF is corrected', () => {
    let round = withInspection(17000);
    while (round.attempts.length < 5) round = addAttempt(round, createAttempt(round, { rawMs: 12000, inspectionMs: round.attempts.length === 1 ? 17000 : 10000, inputMethod: 'timer', scramble: { eventId: '333', notation: 'R U', svg: '<svg/>', engineVersion: 'test', generatedAt: 1 } }));
    expect(scoreRound(round).status).toBe('DNF');
    const edited = editAttempt(round, round.attempts[0].id, { inspectionPenalty: 'none' });
    expect(scoreRound(edited).valueMs).toBe(12000);
    expect(edited.completedAt).toBe(round.completedAt);
  });
});
