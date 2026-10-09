import { getEvent } from './events';
import { attemptCount } from './scoring';
import { inspectionPenalty, isValidTime } from './timing';
import type { Attempt, EventId, InputMethod, InspectionPenalty, Penalty, Round, Scramble, StoredScramble } from './types';

export function createId(): string {
  return crypto.randomUUID();
}

export function toStoredScramble(scramble: StoredScramble): StoredScramble {
  return { eventId: scramble.eventId, notation: scramble.notation, engineVersion: scramble.engineVersion, generatedAt: scramble.generatedAt };
}

export function createRound(eventId: EventId, options: { goalMs?: number } = {}): Round {
  const now = Date.now();
  if (options.goalMs !== undefined && !isValidTime(options.goalMs)) throw new Error('Invalid round goal.');
  return { id: createId(), eventId, format: getEvent(eventId).format, attempts: [], createdAt: now, updatedAt: now, ...options };
}

export function createAttempt(round: Round, input: {
  rawMs: number | null;
  penalty?: Penalty;
  inputMethod: InputMethod;
  scramble: Scramble;
  inspectionMs?: number;
}): Attempt {
  if (round.attempts.length >= attemptCount(round.format)) throw new Error('This round is already complete.');
  if (input.scramble.eventId !== round.eventId) throw new Error('The scramble does not match this event.');
  if (!input.scramble.notation.trim() || !input.scramble.engineVersion.trim()) throw new Error('A generated scramble is required.');
  const penalty = input.penalty ?? 'none';
  const inspection = input.inspectionMs !== undefined && getEvent(round.eventId).inspection ? inspectionPenalty(input.inspectionMs) : 'none';
  assertAttemptResult(input.rawMs, penalty, inspection);
  return { id: createId(), roundId: round.id, index: round.attempts.length, ...input, scramble: toStoredScramble(input.scramble), penalty, inspectionPenalty: inspection, recordedAt: Date.now() };
}

export function addAttempt(round: Round, attempt: Attempt): Round {
  if (round.attempts.length >= attemptCount(round.format)) throw new Error('This round is already complete.');
  if (attempt.roundId !== round.id || attempt.index !== round.attempts.length || attempt.scramble.eventId !== round.eventId) throw new Error('Attempt does not belong in this position.');
  if (round.attempts.some(previous => previous.id === attempt.id)) throw new Error('Attempt already recorded.');
  assertAttemptResult(attempt.rawMs, attempt.penalty, attempt.inspectionPenalty);
  const attempts = [...round.attempts, { ...attempt, scramble: toStoredScramble(attempt.scramble) }];
  const now = Date.now();
  return { ...round, attempts, updatedAt: now, ...(attempts.length === attemptCount(round.format) ? { completedAt: now } : {}) };
}

export function editAttempt(round: Round, attemptId: string, patch: Partial<Pick<Attempt, 'rawMs' | 'penalty'>>): Round {
  if (!round.attempts.some(attempt => attempt.id === attemptId)) throw new Error('Attempt not found.');
  return {
    ...round,
    attempts: round.attempts.map(attempt => {
      if (attempt.id !== attemptId) return attempt;
      const updated = { ...attempt, ...patch };
      assertAttemptResult(updated.rawMs, updated.penalty, updated.inspectionPenalty);
      return updated;
    }),
    updatedAt: Date.now(),
  };
}

export function assertAttemptResult(rawMs: number | null, penalty: Penalty, inspection: InspectionPenalty = 'none'): void {
  if (!['none', '+2', 'DNF', 'DNS'].includes(penalty)) throw new Error('Invalid penalty.');
  if (!['none', '+2', 'DNF'].includes(inspection)) throw new Error('Invalid inspection penalty.');
  if (rawMs !== null && !isValidTime(rawMs)) throw new Error('Invalid solve time.');
  if (rawMs === null && penalty !== 'DNF' && penalty !== 'DNS' && inspection !== 'DNF') throw new Error('A completed solve needs a time.');
}
