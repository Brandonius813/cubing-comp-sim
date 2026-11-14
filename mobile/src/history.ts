import { editAttempt } from '../../src/core/rounds';
import { scoreRound } from '../../src/core/scoring';
import { attemptTimeMs } from '../../src/core/timing';
import type { Attempt, EventId } from '../../src/core/types';
import { parseHistoryJson, validateHistorySnapshot, type HistorySnapshot } from '../../src/storage/validation';
import { validateMobileSave, type MobileSave } from './practice';

/** Portable web/native history only. Never includes credentials or mobile drafts. */
export function exportHistory(save: MobileSave): string {
  return JSON.stringify(validateHistorySnapshot({ ...save.history, exportedAt: Date.now() }), null, 2);
}

/** Pure preparation: caller confirms replacement and calls replaceSave to commit. */
export function prepareHistoryReplacement(current: MobileSave, source: string | HistorySnapshot): MobileSave {
  const history = typeof source === 'string' ? parseHistoryJson(source) : validateHistorySnapshot(source);
  const active = history.rounds.find(round => round.id === history.activeRoundId);
  // Web keeps the last completed round selected. Native's active pointer means
  // an unfinished round to append to, so clear only that pointer on import.
  const nativeHistory = active?.completedAt !== undefined ? { ...history, activeRoundId: null } : history;
  return validateMobileSave({
    ...current, draft: undefined, history: nativeHistory,
    preferences: { ...current.preferences, eventId: active?.eventId ?? current.preferences.eventId },
  });
}

export function updateHistoryAttempt(save: MobileSave, roundId: string, attemptId: string, patch: Partial<Pick<Attempt, 'rawMs' | 'penalty' | 'inspectionPenalty'>>): MobileSave {
  if (!save.history.rounds.some(round => round.id === roundId)) throw new Error('Round not found.');
  const rounds = save.history.rounds.map(round => {
    if (round.id !== roundId) return round;
    // Core handles time/additional penalty invariants. Apply an explicit inspection
    // correction first, then validate the full portable snapshot before saving.
    const corrected = patch.inspectionPenalty === undefined ? round : { ...round, attempts: round.attempts.map(attempt => attempt.id === attemptId ? { ...attempt, inspectionPenalty: patch.inspectionPenalty! } : attempt) };
    const resultPatch = { ...(patch.rawMs !== undefined ? { rawMs: patch.rawMs } : {}), ...(patch.penalty !== undefined ? { penalty: patch.penalty } : {}) };
    return editAttempt(corrected, attemptId, resultPatch);
  });
  return validateMobileSave({ ...save, history: { ...save.history, rounds, exportedAt: Date.now() } });
}

export function eventSummary(save: MobileSave, eventId: EventId) {
  const rounds = save.history.rounds.filter(round => round.eventId === eventId);
  let bestSingle: number | null = null;
  let bestRound: number | null = null;
  let completed = 0;
  let attempts = 0;
  for (const round of rounds) {
    for (const attempt of round.attempts) {
      attempts++;
      const time = attemptTimeMs(attempt);
      if (time !== null && (bestSingle === null || time < bestSingle)) bestSingle = time;
    }
    if (round.completedAt !== undefined) {
      completed++;
      const score = scoreRound(round);
      if (score.valueMs !== null && (bestRound === null || score.valueMs < bestRound)) bestRound = score.valueMs;
    }
  }
  return { bestSingle, bestRound, completed, attempts };
}

/** Removing a result leaves that historical round incomplete, never refills it with unrelated solves. */
export function deleteHistoryAttempt(save: MobileSave, roundId: string, attemptId: string): MobileSave {
  const round = save.history.rounds.find(item => item.id === roundId);
  if (!round?.attempts.some(attempt => attempt.id === attemptId)) throw new Error('Solve not found.');
  const attempts = round.attempts.filter(attempt => attempt.id !== attemptId).map((attempt, index) => ({ ...attempt, index }));
  if (!attempts.length) return deleteHistoryRound(save, roundId);
  const { completedAt, ...remaining } = round;
  const rounds = save.history.rounds.map(item => item.id === roundId ? { ...remaining, attempts, updatedAt: Date.now() } : item);
  return validateMobileSave({ ...save, history: { ...save.history, rounds, exportedAt: Date.now() } });
}
export function deleteHistoryRound(save: MobileSave, roundId: string): MobileSave {
  if (!save.history.rounds.some(round => round.id === roundId)) throw new Error('Round not found.');
  return validateMobileSave({ ...save, history: { ...save.history, rounds: save.history.rounds.filter(round => round.id !== roundId), activeRoundId: save.history.activeRoundId === roundId ? null : save.history.activeRoundId, exportedAt: Date.now() } });
}
