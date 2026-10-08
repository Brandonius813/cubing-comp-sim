import { assertAttemptResult, attemptCount, getEvent, isEventId, isValidTime } from '../core';
import type { Attempt, EventId, Round, Scramble } from '../core';

export interface HistorySnapshot {
  app: 'cubing-comp-sim';
  schemaVersion: 1;
  exportedAt: number;
  rounds: Round[];
  activeRoundId: string | null;
}

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export class InvalidSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSaveError';
  }
}

function fail(message: string): never { throw new InvalidSaveError(message); }
function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, max = 200, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max) fail(`Invalid ${name}.`);
  return value;
}
function timestamp(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) fail(`Invalid ${name}.`);
  return value;
}
function time(value: unknown, name: string): number {
  if (!isValidTime(value)) fail(`Invalid ${name}.`);
  return value;
}

export function validateScramble(value: unknown, eventId: EventId): Scramble {
  const source = record(value, 'scramble');
  if (source.eventId !== eventId) fail('Scramble event does not match its round.');
  return {
    eventId,
    notation: text(source.notation, 'scramble notation', 20_000),
    // SVG is data, never trusted markup. UI must render it through an img element.
    svg: text(source.svg, 'scramble drawing', 1_048_576, true),
    engineVersion: text(source.engineVersion, 'scramble engine version'),
    generatedAt: timestamp(source.generatedAt, 'scramble timestamp'),
  };
}

export function validateRound(value: unknown): Round {
  const source = record(value, 'round');
  const id = text(source.id, 'round id');
  if (!isEventId(source.eventId)) fail('Unsupported event in save.');
  const eventId = source.eventId;
  const event = getEvent(eventId);
  if (source.format !== event.format) fail('Round format does not match its event.');
  if (!Array.isArray(source.attempts) || source.attempts.length > event.attemptCount) fail('Invalid number of attempts.');
  const attemptIds = new Set<string>();
  const attempts: Attempt[] = source.attempts.map((value, index) => {
    const attempt = record(value, 'attempt');
    const attemptId = text(attempt.id, 'attempt id');
    if (attemptIds.has(attemptId)) fail('Duplicate attempt id.');
    attemptIds.add(attemptId);
    if (attempt.roundId !== id || attempt.index !== index) fail('Attempt order or round reference is invalid.');
    if (!['none', '+2', 'DNF', 'DNS'].includes(String(attempt.penalty))) fail('Invalid attempt penalty.');
    const penalty = attempt.penalty as Attempt['penalty'];
    // Earlier unreleased v1 saves stored the entire penalty in `penalty`.
    // Do not infer another +2 from inspectionMs and double their old results.
    const inspectionPenalty = attempt.inspectionPenalty === undefined ? 'none' : attempt.inspectionPenalty;
    if (inspectionPenalty !== 'none' && inspectionPenalty !== '+2' && inspectionPenalty !== 'DNF') fail('Invalid inspection penalty.');
    if (!event.inspection && inspectionPenalty !== 'none') fail('This event does not use inspection penalties.');
    const rawMs = attempt.rawMs === null ? null : time(attempt.rawMs, 'solve time');
    try { assertAttemptResult(rawMs, penalty, inspectionPenalty); } catch { fail('Attempt result is invalid.'); }
    if (attempt.inputMethod !== 'timer' && attempt.inputMethod !== 'manual') fail('Invalid input method.');
    return {
      id: attemptId, roundId: id, index, rawMs, penalty, inspectionPenalty, inputMethod: attempt.inputMethod,
      scramble: validateScramble(attempt.scramble, eventId),
      recordedAt: timestamp(attempt.recordedAt, 'attempt timestamp'),
      ...(attempt.inspectionMs !== undefined ? { inspectionMs: time(attempt.inspectionMs, 'inspection time') } : {}),
    };
  });
  if (source.completedAt !== undefined && attempts.length !== attemptCount(event.format)) fail('An unfinished round cannot be marked complete.');
  if (source.completedAt === undefined && attempts.length === attemptCount(event.format)) fail('Completed round is missing its completion time.');
  return {
    id, eventId, format: event.format, attempts,
    createdAt: timestamp(source.createdAt, 'round creation timestamp'),
    updatedAt: timestamp(source.updatedAt, 'round update timestamp'),
    ...(source.completedAt !== undefined ? { completedAt: timestamp(source.completedAt, 'round completion timestamp') } : {}),
    ...(source.goalMs !== undefined ? { goalMs: time(source.goalMs, 'round goal') } : {}),
  };
}

/** Construct fresh allowed fields, rejecting corrupt references before any local writes. */
export function validateHistorySnapshot(value: unknown): HistorySnapshot {
  const source = record(value, 'save');
  if (source.app !== 'cubing-comp-sim') fail('This is not a Cubing Comp Sim save.');
  if (source.schemaVersion !== 1) fail('This save version is not supported. Update the app before importing it.');
  if (!Array.isArray(source.rounds)) fail('Invalid round collection.');
  const rounds = source.rounds.map(validateRound);
  const roundIds = new Set<string>();
  const attemptIds = new Set<string>();
  for (const round of rounds) {
    if (roundIds.has(round.id)) fail('Duplicate round id.');
    roundIds.add(round.id);
    for (const attempt of round.attempts) {
      if (attemptIds.has(attempt.id)) fail('Duplicate attempt id across rounds.');
      attemptIds.add(attempt.id);
    }
  }
  const activeRoundId = source.activeRoundId === null ? null : text(source.activeRoundId, 'active round id');
  if (activeRoundId !== null && !roundIds.has(activeRoundId)) fail('Active round is missing from the save.');
  return { app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: timestamp(source.exportedAt, 'export timestamp'), rounds, activeRoundId };
}

export function parseHistoryJson(json: string): HistorySnapshot {
  if (json.length > MAX_IMPORT_BYTES || new TextEncoder().encode(json).byteLength > MAX_IMPORT_BYTES) fail('This save is larger than the 100 MB import limit.');
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { fail('The save is not valid JSON.'); }
  return validateHistorySnapshot(parsed);
}
