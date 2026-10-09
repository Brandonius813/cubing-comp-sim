import { describe, expect, it } from 'vitest';
import { getEvent } from './events';
import { getEventRoundStatistics, getRoundStatisticsByEvent } from './statistics';
import type { EventId, Round } from './types';

function round(id: string, value: number, completedAt: number, eventId: EventId = '333'): Round {
  const event = getEvent(eventId);
  return {
    id, eventId, format: event.format, createdAt: completedAt - 100, updatedAt: completedAt, completedAt,
    attempts: Array.from({ length: event.attemptCount }, (_, index) => ({
      id: `${id}-${index}`, roundId: id, index, rawMs: value, penalty: 'none', inspectionPenalty: 'none', inputMethod: 'timer', recordedAt: completedAt,
      scramble: { eventId, notation: 'R U', engineVersion: 'test', generatedAt: completedAt - 100 },
    })),
  };
}

describe('mean of three rounds', () => {
  it('requires three completed rounds, not three attempts', () => {
    const complete = round('one', 10_000, 1_000);
    const unfinished = { ...round('two', 20_000, 2_000), completedAt: undefined, attempts: complete.attempts.slice(0, 3) };
    expect(getEventRoundStatistics([complete, unfinished], '333')).toMatchObject({
      completedRounds: 1, current: { status: 'incomplete', valueMs: null }, best: { status: 'incomplete', valueMs: null },
    });
  });

  it('averages scored round results and respects dropped attempts and penalties', () => {
    const first = round('first', 10_000, 1_000);
    first.attempts[4].rawMs = 500_000; // Discarded by Ao5, not averaged into this statistic.
    const second = round('second', 20_000, 2_000);
    for (const attempt of second.attempts) attempt.penalty = '+2';
    const third = round('third', 30_000, 3_000);
    expect(getEventRoundStatistics([first, second, third], '333').current).toEqual({
      status: 'ok', valueMs: 20_670, roundIds: ['first', 'second', 'third'],
    });
  });

  it('orders by completion time without mutating history and finds a best rolling window', () => {
    const rounds = [round('fourth', 40_000, 4_000), round('second', 20_000, 2_000), round('first', 10_000, 1_000), round('third', 30_000, 3_000)];
    const before = rounds.map(value => value.id);
    const statistics = getEventRoundStatistics(rounds, '333');
    expect(statistics.current).toEqual({ status: 'ok', valueMs: 30_000, roundIds: ['second', 'third', 'fourth'] });
    expect(statistics.best).toEqual({ status: 'ok', valueMs: 20_000, roundIds: ['first', 'second', 'third'] });
    expect(rounds.map(value => value.id)).toEqual(before);
  });

  it('keeps a DNF round in consecutive windows and preserves an earlier valid best', () => {
    const rounds = [1, 2, 3, 4].map(index => round(String(index), index * 10_000, index * 1_000));
    rounds[3].attempts[0].penalty = 'DNF';
    rounds[3].attempts[1].penalty = 'DNS';
    const statistics = getEventRoundStatistics(rounds, '333');
    expect(statistics.current).toEqual({ status: 'DNF', valueMs: null, roundIds: ['2', '3', '4'] });
    expect(statistics.best.valueMs).toBe(20_000);
    expect(getEventRoundStatistics(rounds.slice(1), '333').best.status).toBe('DNF');
  });

  it('recovers once an invalid round leaves the three-round window', () => {
    const rounds = [1, 2, 3, 4].map(index => round(String(index), 10_000, index * 1_000, '666'));
    rounds[0].attempts[0].inspectionPenalty = 'DNF';
    expect(getEventRoundStatistics(rounds, '666')).toMatchObject({ current: { status: 'ok', valueMs: 10_000 }, best: { status: 'ok', valueMs: 10_000 } });
  });

  it('keeps event statistics separate, including in the all-events view', () => {
    const rounds = [round('a', 10_000, 1_000), round('b', 20_000, 2_000), round('c', 100_000, 3_000, '666')];
    expect(getRoundStatisticsByEvent(rounds)).toMatchObject([
      { eventId: '333', completedRounds: 2, current: { status: 'incomplete' } },
      { eventId: '666', completedRounds: 1, current: { status: 'incomplete' } },
    ]);
  });

  it('uses best-of round results for blindfolded events and rounds long means to seconds', () => {
    const rounds = [600_000, 601_000, 601_000].map((value, index) => round(String(index), value, index * 1_000, '444bf'));
    rounds[0].attempts[0].penalty = 'DNF'; // The best valid solve still determines a Best of 3 round.
    rounds[1].attempts[2].rawMs = 800_000;
    expect(getEventRoundStatistics(rounds, '444bf').current.valueMs).toBe(601_000);
  });

  it('recalculates after historical edits and does not silently skip a malformed completed round', () => {
    const rounds = [1, 2, 3].map(index => round(String(index), 10_000, index * 1_000));
    expect(getEventRoundStatistics(rounds, '333').current.valueMs).toBe(10_000);
    for (const attempt of rounds[0].attempts) attempt.penalty = '+2';
    expect(getEventRoundStatistics(rounds, '333').current.valueMs).toBe(10_670);
    rounds[0].attempts.pop();
    expect(getEventRoundStatistics(rounds, '333').current.status).toBe('DNF');
  });
});
