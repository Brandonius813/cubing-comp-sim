import { EVENTS } from './events';
import { scoreRound } from './scoring';
import { TEN_MINUTES_MS } from './timing';
import type { EventId, Round } from './types';

export interface RoundMean {
  status: 'incomplete' | 'ok' | 'DNF';
  valueMs: number | null;
  /** Chronological round IDs, useful for identifying the contributing results. */
  roundIds: string[];
}

export interface EventRoundStatistics {
  eventId: EventId;
  completedRounds: number;
  current: RoundMean;
  best: RoundMean;
}

const incompleteMean = (): RoundMean => ({ status: 'incomplete', valueMs: null, roundIds: [] });

/** Practice statistic: the mean of three round RESULTS, not three individual solves. */
function meanOfThreeRounds(rounds: readonly Round[]): RoundMean {
  if (rounds.length !== 3) return incompleteMean();
  const scores = rounds.map(scoreRound);
  const roundIds = rounds.map(round => round.id);
  // Keep unsuccessful rounds in their window rather than skipping to faster results.
  if (scores.some(score => score.status !== 'ok' || score.valueMs === null)) {
    return { status: 'DNF', valueMs: null, roundIds };
  }
  const total = scores.reduce((sum, score) => sum + score.valueMs!, 0);
  const unit = total >= TEN_MINUTES_MS * 3 ? 1_000 : 10;
  return { status: 'ok', valueMs: Math.floor((total + 3 * unit / 2) / (3 * unit)) * unit, roundIds };
}

/**
 * Windows follow completion order within ONE event. In-progress/abandoned rounds
 * are excluded. A DNF round invalidates each three-round window containing it.
 * Results are derived on demand, so editing an old attempt updates these statistics.
 */
export function getEventRoundStatistics(rounds: readonly Round[], eventId: EventId): EventRoundStatistics {
  const completed = rounds
    .filter(round => round.eventId === eventId && round.completedAt !== undefined)
    .sort((a, b) => a.completedAt! - b.completedAt! || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  let best = incompleteMean();
  let current = incompleteMean();
  for (let index = 2; index < completed.length; index += 1) {
    current = meanOfThreeRounds(completed.slice(index - 2, index + 1));
    if (best.status === 'incomplete' || (current.status === 'ok' && (best.status !== 'ok' || current.valueMs! < best.valueMs!))) {
      best = current;
    }
  }
  return { eventId, completedRounds: completed.length, current, best };
}

/** All-events views show one statistic per event and never combine unlike events. */
export function getRoundStatisticsByEvent(rounds: readonly Round[]): EventRoundStatistics[] {
  const presentEvents = new Set(rounds.map(round => round.eventId));
  return EVENTS.filter(event => presentEvents.has(event.id)).map(event => getEventRoundStatistics(rounds, event.id));
}
