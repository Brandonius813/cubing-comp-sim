import { describe, expect, it } from 'vitest';
import { addAttempt, createAttempt, createRound, editAttempt, EVENTS, formatAttempt, formatTime, getEvent, inspectionPenalty, parseTimeInput, possibleResults, recordedTimeMs, scoreRound } from './index';
import type { EventId, Penalty, Round, Scramble } from './types';

function fixtureScramble(eventId: EventId): Scramble {
  return { eventId, notation: 'R U R\'', svg: '<svg/>', engineVersion: 'unit-test-fixture', generatedAt: 1 };
}
function roundWith(times: Array<number | 'DNF' | 'DNS'>, eventId: EventId = '333'): Round {
  let round = createRound(eventId);
  for (const result of times) round = addAttempt(round, createAttempt(round, { rawMs: typeof result === 'number' ? result : null, penalty: typeof result === 'number' ? 'none' : result, inputMethod: 'manual', scramble: fixtureScramble(eventId) }));
  return round;
}

describe('event scope', () => {
  it('contains 16 supported events with Clock last', () => {
    expect(EVENTS).toHaveLength(16);
    expect(EVENTS.at(-1)?.id).toBe('clock');
    expect(getEvent('fto').format).toBe('ao5');
    expect(getEvent('333bf')).toMatchObject({ format: 'bo5', attemptCount: 5, inspection: false });
    expect(getEvent('444bf')).toMatchObject({ format: 'bo3', inspection: false });
  });
});

describe('time input and precision', () => {
  it.each([
    ['12.345', 12_345, 'none'], ['1:02.30', 62_300, 'none'], ['1:02:03.4', 3_723_400, 'none'],
    ['12.34 +2', 12_340, '+2'], ['dnf', null, 'DNF'], ['DNS', null, 'DNS'], ['DNF(12.34)', 12_340, 'DNF'],
  ] as const)('parses %s without discarding the original time', (text, rawMs, penalty) => {
    expect(parseTimeInput(text)).toEqual({ rawMs, penalty });
  });
  it.each(['', '-1', 'NaN', 'Infinity', '1e5', '1:60', '0:99:00', '1:99:00', '1.2345', '12+', '24:00:00', '12.34 +2 +2', 'DNF(12) +2'])('rejects ambiguous or invalid input %s', text => {
    expect(parseTimeInput(text)).toBeNull();
  });
  it('truncates singles and retains the original value separately', () => {
    expect(recordedTimeMs(12_349)).toBe(12_340);
    expect(recordedTimeMs(599_999)).toBe(599_990);
    expect(recordedTimeMs(600_999)).toBe(600_000);
    expect(recordedTimeMs(599_999, '+2')).toBe(601_000);
    expect(formatAttempt({ rawMs: 12_349, penalty: '+2' })).toBe('14.34+');
    expect(formatTime(3_723_400)).toBe('1:02:03');
  });
  it.each([[14_999, 'none'], [15_000, '+2'], [16_999, '+2'], [17_000, 'DNF']] as const)('enforces inspection boundary %d', (elapsed, expected) => {
    expect(inspectionPenalty(elapsed)).toBe(expected);
  });
});

describe('round scoring', () => {
  it('drops one best and one worst and rounds the remaining mean', () => {
    const round = roundWith([8_000, 10_000, 10_010, 10_010, 20_000]);
    expect(scoreRound(round)).toEqual({ status: 'ok', valueMs: 10_010, discardedIndices: [0, 4] });
  });
  it('counts one failure as the worst result and two as a failed average', () => {
    expect(scoreRound(roundWith([10_000, 11_000, 12_000, 13_000, 'DNF'])).valueMs).toBe(12_000);
    expect(scoreRound(roundWith([10_000, 11_000, 12_000, 'DNF', 'DNS'])).status).toBe('DNF');
  });
  it('does not report an incomplete round as a completed result', () => {
    expect(scoreRound(roundWith([10_000, 11_000]))).toMatchObject({ status: 'incomplete', valueMs: null });
  });
  it('calculates exact best and worst possible outcomes before the fifth solve', () => {
    const bounds = possibleResults(roundWith([10_000, 11_000, 12_000, 13_000]));
    expect(bounds.best.valueMs).toBe(11_000);
    expect(bounds.worst.valueMs).toBe(12_000);
    expect(possibleResults(roundWith([10_000, 11_000, 12_000, 'DNF'])).worst.status).toBe('DNF');
  });
  it('produces identical bounds once a round is complete', () => {
    const round = roundWith([10_000, 11_000, 12_000, 13_000, 14_000]);
    expect(possibleResults(round).best).toEqual(scoreRound(round));
    expect(possibleResults(round).worst).toEqual(scoreRound(round));
  });
  it('uses all 3 results for a mean and fails it on any unsuccessful attempt', () => {
    expect(scoreRound(roundWith([600_000, 601_000, 601_000], '666')).valueMs).toBe(601_000);
    expect(scoreRound(roundWith([100_000, 101_000, 'DNS'], '666')).status).toBe('DNF');
  });
  it('uses best single for blindfolded formats', () => {
    expect(scoreRound(roundWith(['DNF', 20_000, 19_000, 'DNF', 21_000], '333bf')).valueMs).toBe(19_000);
    expect(scoreRound(roundWith(['DNF', 'DNS', 'DNF'], '444bf')).status).toBe('DNF');
  });
});

describe('round mutations', () => {
  it('preserves original raw times and scramble when editing a penalty', () => {
    const original = roundWith([12_349]);
    const revised = editAttempt(original, original.attempts[0].id, { penalty: '+2' });
    expect(original.attempts[0].penalty).toBe('none');
    expect(revised.attempts[0].rawMs).toBe(12_349);
    expect(revised.attempts[0].scramble).toEqual(original.attempts[0].scramble);
  });
  it('rejects the wrong event, reused attempts and extra solves', () => {
    const round = createRound('333');
    expect(() => createAttempt(round, { rawMs: 1_000, inputMethod: 'timer', scramble: fixtureScramble('222') })).toThrow();
    const one = roundWith([1_000]);
    expect(() => addAttempt(one, one.attempts[0])).toThrow();
    const complete = roundWith([1_000, 1_000, 1_000, 1_000, 1_000]);
    expect(() => createAttempt(complete, { rawMs: 1_000, inputMethod: 'timer', scramble: fixtureScramble('333') })).toThrow();
  });
  it('applies inspection only for sighted events', () => {
    for (const [eventId, expected] of [['333', '+2'], ['333bf', 'none']] as Array<[EventId, Penalty]>) {
      const round = createRound(eventId);
      expect(createAttempt(round, { rawMs: 10_000, inputMethod: 'timer', scramble: fixtureScramble(eventId), inspectionMs: 15_000 }).penalty).toBe(expected);
    }
  });
});
