import { addAttempt, createAttempt, createRound } from '../../src/core/rounds';
import { getEvent, isEventId } from '../../src/core/events';
import type { EventId, InputMethod, Penalty, Scramble } from '../../src/core/types';
import { validateHistorySnapshot, type HistorySnapshot } from '../../src/storage/validation';

export type TimerPhase = 'ready' | 'inspection' | 'holding' | 'running' | 'review';
export interface MobileSave {
  version: 1;
  history: HistorySnapshot;
  preferences: { eventId: EventId; inspection: boolean };
}
export interface PendingResult {
  rawMs: number | null;
  penalty: Penalty;
  inputMethod: InputMethod;
  inspectionMs?: number;
  interrupted?: true;
}

export function emptySave(): MobileSave {
  return {
    version: 1,
    history: { app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: Date.now(), rounds: [], activeRoundId: null },
    preferences: { eventId: '333', inspection: true },
  };
}

export function validateMobileSave(value: unknown): MobileSave {
  if (!value || typeof value !== 'object') throw new Error('Invalid local save.');
  const saved = value as Record<string, unknown>;
  if (saved.version !== 1) throw new Error('This local save needs a newer app version.');
  const history = validateHistorySnapshot(saved.history);
  const preferences = saved.preferences as Record<string, unknown> | undefined;
  if (!preferences || !isEventId(preferences.eventId) || typeof preferences.inspection !== 'boolean') throw new Error('Invalid saved settings.');
  const active = history.rounds.find(round => round.id === history.activeRoundId);
  if (active && (active.completedAt !== undefined || active.eventId !== preferences.eventId)) throw new Error('Invalid active round.');
  return { version: 1, history, preferences: { eventId: preferences.eventId, inspection: preferences.inspection } };
}

export function navigationLocked(phase: TimerPhase, saving: boolean): boolean {
  return saving || phase !== 'ready';
}

/** Uses the website's exact round, penalty and scoring model. */
export function recordResult(save: MobileSave, scramble: Scramble, pending: PendingResult): MobileSave {
  if (scramble.eventId !== save.preferences.eventId) throw new Error('The scramble belongs to a different event.');
  const active = save.history.rounds.find(round => round.id === save.history.activeRoundId);
  const round = active ?? createRound(save.preferences.eventId);
  const attempt = createAttempt(round, {
    rawMs: pending.rawMs, penalty: pending.interrupted ? 'DNF' : pending.penalty,
    inputMethod: pending.inputMethod, inspectionMs: pending.inspectionMs, scramble,
  });
  const updated = addAttempt(round, attempt);
  const rounds = active ? save.history.rounds.map(item => item.id === updated.id ? updated : item) : [...save.history.rounds, updated];
  return validateMobileSave({
    ...save,
    history: { ...save.history, rounds, activeRoundId: updated.completedAt === undefined ? updated.id : null, exportedAt: Date.now() },
  });
}

export function changeEvent(save: MobileSave, eventId: EventId): MobileSave {
  getEvent(eventId);
  return validateMobileSave({
    ...save,
    preferences: { ...save.preferences, eventId },
    history: { ...save.history, rounds: save.history.rounds.filter(round => round.id !== save.history.activeRoundId), activeRoundId: null, exportedAt: Date.now() },
  });
}
