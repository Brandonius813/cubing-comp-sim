import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addAttempt, createAttempt, createRound, possibleResults, type EventId, type Round } from '../core';
import { Scorecard } from './Scorecard';
import { setLocale } from './i18n';

vi.mock('../core', async importOriginal => {
  const core = await importOriginal<typeof import('../core')>();
  return { ...core, possibleResults: vi.fn(core.possibleResults) };
});

afterEach(() => {
  vi.clearAllMocks();
  setLocale('en');
});

function roundWith(times: Array<number | 'DNF'>, eventId: EventId = '333'): Round {
  let round = createRound(eventId);
  for (const time of times) {
    round = addAttempt(round, createAttempt(round, {
      rawMs: typeof time === 'number' ? time : null,
      penalty: typeof time === 'number' ? 'none' : time,
      inputMethod: 'manual',
      scramble: { eventId, notation: 'R U', svg: '<svg/>', engineVersion: 'unit-test-fixture', generatedAt: 1 },
    }));
  }
  return round;
}

function renderScorecard(round: Round | null) {
  return renderToStaticMarkup(<Scorecard round={round} eventId={round?.eventId ?? '333'} roundNumber={1} onHide={() => undefined} onEdit={() => undefined} onStats={() => undefined} />);
}

function expectBounds(markup: string, best: string, worst: string) {
  expect(markup).toContain(`<span>Best Possible</span><span>${best}</span>`);
  expect(markup).toContain(`<span>Worst Possible</span><span>${worst}</span>`);
}

describe('scorecard possible-result visibility', () => {
  it('shows dashes without computing bounds before a round starts', () => {
    expectBounds(renderScorecard(null), '—', '—');
    expect(possibleResults).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2, 3])('shows dashes without computing Ao5 bounds after %i solves', count => {
    const round = roundWith([10_000, 11_000, 12_000].slice(0, count));
    expectBounds(renderScorecard(round), '—', '—');
    expect(possibleResults).not.toHaveBeenCalled();
  });

  it('shows both Ao5 bounds after the fourth solve', () => {
    expectBounds(renderScorecard(roundWith([10_000, 11_000, 12_000, 13_000])), '11.00', '12.00');
    expect(possibleResults).toHaveBeenCalledTimes(1);
  });

  it('retains the pre-final bounds after the fifth solve', () => {
    const markup = renderScorecard(roundWith([10_000, 11_000, 12_000, 13_000, 14_000]));
    expectBounds(markup, '11.00', '12.00');
    expect(markup).toContain('<span>Ao5</span><strong>12.00</strong>');
    expect(possibleResults).toHaveBeenCalledTimes(1);
  });

  it('counts a recorded DNF as the fourth solve', () => {
    expectBounds(renderScorecard(roundWith([10_000, 11_000, 12_000, 'DNF'])), '11.00', 'DNF');
    expect(possibleResults).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1])('shows dashes without computing Mo3 bounds after %i solves', count => {
    expectBounds(renderScorecard(roundWith([30_000].slice(0, count), '666')), '—', '—');
    expect(possibleResults).not.toHaveBeenCalled();
  });

  it.each([2, 3])('shows pre-final Mo3 bounds after %i solves', count => {
    expectBounds(renderScorecard(roundWith([30_000, 60_000, 90_000].slice(0, count), '666')), '30.00', 'DNF');
    expect(possibleResults).toHaveBeenCalledTimes(1);
  });
});
