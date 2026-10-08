import { attemptTimeMs, TEN_MINUTES_MS } from './timing';
import type { Round, RoundFormat, Score } from './types';

export function attemptCount(format: RoundFormat): 3 | 5 {
  return format === 'ao5' || format === 'bo5' ? 5 : 3;
}

/** Calculations use already-truncated singles. No floating point seconds are stored. */
function scoreValues(values: Array<number | null>, format: RoundFormat): Score {
  if (values.length !== attemptCount(format)) return { status: 'incomplete', valueMs: null, discardedIndices: [] };
  const sorted = values.map((value, index) => ({ value: value ?? Infinity, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  if (format === 'bo3' || format === 'bo5') {
    const best = sorted[0].value;
    return { status: Number.isFinite(best) ? 'ok' : 'DNF', valueMs: Number.isFinite(best) ? best : null, discardedIndices: [] };
  }
  const discardedIndices = format === 'ao5' ? [sorted[0].index, sorted[sorted.length - 1].index] : [];
  const counted = format === 'ao5' ? sorted.slice(1, -1) : sorted;
  if (counted.some(entry => !Number.isFinite(entry.value))) return { status: 'DNF', valueMs: null, discardedIndices };
  const total = counted.reduce((sum, entry) => sum + entry.value, 0);
  const unit = total >= TEN_MINUTES_MS * counted.length ? 1_000 : 10;
  // WCA 9f1/9f2: nearest hundredth, or nearest second for means >=10 minutes.
  const valueMs = Math.floor((total + counted.length * unit / 2) / (counted.length * unit)) * unit;
  return { status: 'ok', valueMs, discardedIndices };
}

export function scoreRound(round: Pick<Round, 'format' | 'attempts'>): Score {
  return scoreValues(round.attempts.map(attemptTimeMs), round.format);
}

/** Mathematical bounds, not predictions: remaining attempts are 0 or DNF. */
export function possibleResults(round: Pick<Round, 'format' | 'attempts'>): { best: Score; worst: Score } {
  const values = round.attempts.map(attemptTimeMs);
  const remaining = Math.max(0, attemptCount(round.format) - values.length);
  return {
    best: scoreValues([...values, ...Array<number>(remaining).fill(0)], round.format),
    worst: scoreValues([...values, ...Array<null>(remaining).fill(null)], round.format),
  };
}

export function bestSingle(round: Pick<Round, 'attempts'>): number | null {
  const times = round.attempts.map(attemptTimeMs).filter((time): time is number => time !== null);
  return times.length ? Math.min(...times) : null;
}
