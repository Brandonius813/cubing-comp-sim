import { addAttempt, assertAttemptResult, createAttempt, createId, createRound } from '../../src/core/rounds';
import { getEvent, isEventId } from '../../src/core/events';
import { inspectionPenalty, isValidTime, parseTimeInput } from '../../src/core/timing';
import type { EventId, InputMethod, InspectionPenalty, Penalty, Scramble } from '../../src/core/types';
import { validateHistorySnapshot, validateScramble, type HistorySnapshot } from '../../src/storage/validation';
import { DEFAULT_SETTINGS, validateSettings, type Settings } from '../../src/storage/settings';
import { isLocale, type Locale } from '../../src/locales';
import { sampleWaitMs } from '../../src/ui/simulatorInput';

export type TimerPhase = 'ready' | 'waiting' | 'inspection' | 'holding' | 'running' | 'review';
export type MobilePreferences = Pick<Settings, 'eventId' | 'inspection'> & Partial<Settings> & {
  inspectionAudio?: boolean;
  voiceLanguage?: Locale;
  voice?: 'male-1' | 'male-2' | 'female-1' | 'female-2';
  voiceVolume?: number;
};
export interface MobileSave {
  version: 1;
  history: HistorySnapshot;
  preferences: MobilePreferences;
  draft?: MobileDraft;
}
export interface PendingResult {
  rawMs: number | null;
  penalty: Penalty;
  inputMethod: InputMethod;
  inspectionMs?: number;
  /** An explicit correction. Never inferred merely because a time was edited. */
  inspectionPenalty?: InspectionPenalty;
  interrupted?: true;
  /** Stable across retries. Use the current draft's id. */
  attemptId?: string;
}
export interface MobileDraft {
  id: string;
  phase: TimerPhase;
  scramble: Scramble;
  pending?: PendingResult;
  manualText?: string;
  inspectionText?: string;
  /** A paused countdown, never a persisted performance.now() timestamp. */
  waitRemainingMs?: number;
}

export function mobileSettings(preferences: MobilePreferences): Settings {
  return validateSettings({ ...DEFAULT_SETTINGS, holdMs: 0, ...preferences });
}

export function validateMobilePreferences(preferences: MobilePreferences): MobilePreferences {
  const settings = mobileSettings(preferences);
  const inspectionAudio = preferences.inspectionAudio ?? true;
  const voiceLanguage = preferences.voiceLanguage ?? 'en';
  const voice = preferences.voice ?? 'male-1';
  const voiceVolume = preferences.voiceVolume ?? 1;
  if (typeof inspectionAudio !== 'boolean' || !isLocale(voiceLanguage)
    || !['male-1', 'male-2', 'female-1', 'female-2'].includes(voice)
    || typeof voiceVolume !== 'number' || !Number.isFinite(voiceVolume) || voiceVolume < 0 || voiceVolume > 1) throw new Error('Invalid inspection audio settings.');
  return { ...settings, inspectionAudio, voiceLanguage, voice, voiceVolume };
}

export function emptySave(): MobileSave {
  return {
    version: 1,
    history: { app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: Date.now(), rounds: [], activeRoundId: null },
    preferences: validateMobilePreferences({ eventId: '333', inspection: true }),
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid local save.');
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error('Invalid attempt identifier.');
  return value;
}
export function pendingInspection(pending: PendingResult, eventId: EventId): InspectionPenalty {
  if (!getEvent(eventId).inspection) return 'none';
  return pending.inspectionPenalty ?? (pending.inspectionMs === undefined ? 'none' : inspectionPenalty(pending.inspectionMs));
}
export function validatePendingResult(value: unknown, eventId: EventId): PendingResult {
  const source = object(value);
  if (source.inputMethod !== 'timer' && source.inputMethod !== 'manual') throw new Error('Invalid input method.');
  if (source.inspectionMs !== undefined && !isValidTime(source.inspectionMs)) throw new Error('Invalid inspection duration.');
  if (source.interrupted !== undefined && source.interrupted !== true) throw new Error('Invalid interruption flag.');
  if (source.inspectionPenalty !== undefined && !['none', '+2', 'DNF'].includes(String(source.inspectionPenalty))) throw new Error('Invalid inspection correction.');
  if (!getEvent(eventId).inspection && source.inspectionPenalty !== undefined && source.inspectionPenalty !== 'none') throw new Error('This event does not use inspection.');
  const pending: PendingResult = {
    rawMs: source.rawMs as number | null, penalty: source.penalty as Penalty, inputMethod: source.inputMethod,
    ...(source.inspectionMs !== undefined ? { inspectionMs: source.inspectionMs as number } : {}),
    ...(source.inspectionPenalty !== undefined ? { inspectionPenalty: source.inspectionPenalty as InspectionPenalty } : {}),
    ...(source.interrupted ? { interrupted: true } : {}),
    ...(source.attemptId !== undefined ? { attemptId: identifier(source.attemptId) } : {}),
  };
  // A persisted interruption cannot be converted into a valid solve by an edit.
  assertAttemptResult(pending.rawMs, pending.penalty, pendingInspection(pending, eventId));
  if (pending.interrupted) pending.penalty = 'DNF';
  return pending;
}
export function validateMobileDraft(value: unknown, eventId: EventId): MobileDraft {
  const source = object(value);
  if (!['ready', 'waiting', 'inspection', 'holding', 'running', 'review'].includes(String(source.phase))) throw new Error('Invalid saved practice stage.');
  const id = identifier(source.id);
  const pending = source.pending === undefined ? undefined : validatePendingResult(source.pending, eventId);
  if (source.phase === 'review' && !pending) throw new Error('Review is missing its result.');
  if (source.phase !== 'review' && pending) throw new Error('Result does not match saved practice stage.');
  if (pending?.attemptId !== undefined && pending.attemptId !== id) throw new Error('Result belongs to another attempt.');
  for (const key of ['manualText', 'inspectionText']) {
    if (source[key] !== undefined && (typeof source[key] !== 'string' || source[key].length > 200)) throw new Error('Invalid saved input.');
  }
  if (source.waitRemainingMs !== undefined && (!Number.isSafeInteger(source.waitRemainingMs) || Number(source.waitRemainingMs) < 0 || Number(source.waitRemainingMs) > 300_000)) throw new Error('Invalid saved wait.');
  if (source.phase === 'waiting' && source.waitRemainingMs === undefined) throw new Error('Waiting draft is missing its countdown.');
  return {
    id, phase: source.phase as TimerPhase, scramble: validateScramble(source.scramble, eventId),
    ...(pending ? { pending: { ...pending, attemptId: id } } : {}),
    ...(source.manualText !== undefined ? { manualText: source.manualText as string } : {}),
    ...(source.inspectionText !== undefined ? { inspectionText: source.inspectionText as string } : {}),
    ...(source.waitRemainingMs !== undefined ? { waitRemainingMs: source.waitRemainingMs as number } : {}),
  };
}
export function validateMobileSave(value: unknown): MobileSave {
  const saved = object(value);
  if (saved.version !== 1) throw new Error('This local save needs a newer app version.');
  const history = validateHistorySnapshot(saved.history);
  const source = object(saved.preferences);
  if (!isEventId(source.eventId) || typeof source.inspection !== 'boolean') throw new Error('Invalid saved settings.');
  const preferences = validateMobilePreferences(source as MobilePreferences);
  const active = history.rounds.find(round => round.id === history.activeRoundId);
  if (active && (active.completedAt !== undefined || active.eventId !== preferences.eventId)) throw new Error('Invalid active round.');
  const draft = saved.draft === undefined ? undefined : validateMobileDraft(saved.draft, preferences.eventId);
  if (draft && history.rounds.some(round => round.attempts.some(attempt => attempt.id === draft.id))) throw new Error('The active attempt is already saved.');
  return { version: 1, history, preferences, ...(draft ? { draft } : {}) };
}

export function navigationLocked(phase: TimerPhase, saving: boolean): boolean {
  return saving || (phase !== 'ready' && phase !== 'waiting');
}

/** Uses the website's exact round, penalty and scoring model. */
export function recordResult(save: MobileSave, scramble: Scramble, input: PendingResult): MobileSave {
  const pending = validatePendingResult(input, save.preferences.eventId);
  if (scramble.eventId !== save.preferences.eventId) throw new Error('The scramble belongs to a different event.');
  // Retried writes and repeated taps refer to one attempt, even across round completion.
  if (pending.attemptId && save.history.rounds.some(round => round.attempts.some(attempt => attempt.id === pending.attemptId))) return save;
  const active = save.history.rounds.find(round => round.id === save.history.activeRoundId);
  const goalMs = mobileSettings(save.preferences).goalMs;
  const round = active ?? createRound(save.preferences.eventId, goalMs === null ? {} : { goalMs });
  const attempt = createAttempt(round, {
    rawMs: pending.rawMs, penalty: pending.interrupted ? 'DNF' : pending.penalty,
    inputMethod: pending.inputMethod, inspectionMs: pending.inspectionMs, scramble,
  });
  if (pending.attemptId) attempt.id = pending.attemptId;
  attempt.inspectionPenalty = pendingInspection(pending, round.eventId);
  const updated = addAttempt(round, attempt);
  const rounds = active ? save.history.rounds.map(item => item.id === updated.id ? updated : item) : [...save.history.rounds, updated];
  return validateMobileSave({
    ...save, draft: undefined,
    history: { ...save.history, rounds, activeRoundId: updated.completedAt === undefined ? updated.id : null, exportedAt: Date.now() },
  });
}

export function changeEvent(save: MobileSave, eventId: EventId): MobileSave {
  getEvent(eventId);
  return validateMobileSave({
    ...save, draft: undefined,
    preferences: { ...save.preferences, eventId },
    history: { ...save.history, rounds: save.history.rounds.filter(round => round.id !== save.history.activeRoundId), activeRoundId: null, exportedAt: Date.now() },
  });
}

/** Sample once, then persist this draft before exposing its timer. */
export function createDraft(scramble: Scramble, preferences: MobilePreferences, random: () => number = Math.random): MobileDraft {
  if (scramble.eventId !== preferences.eventId) throw new Error('The scramble belongs to a different event.');
  const waitRemainingMs = sampleWaitMs(mobileSettings(preferences), random);
  return validateMobileDraft({ id: createId(), scramble, phase: waitRemainingMs > 0 ? 'waiting' : 'ready', waitRemainingMs }, preferences.eventId);
}

/** Process death never resumes a clock or manufactures a measured time. */
export function recoverDraft(save: MobileSave): MobileSave {
  const valid = validateMobileSave(save);
  const draft = valid.draft;
  if (!draft || !['inspection', 'holding', 'running'].includes(draft.phase)) return valid;
  return validateMobileSave({ ...valid, draft: { ...draft, phase: 'review', pending: {
    rawMs: null, penalty: 'DNF', inputMethod: 'timer', interrupted: true, attemptId: draft.id,
  } } });
}

/** Typed inspection uses the same digits-as-hundredths parser as solve entry. */
export function manualResult(time: string, inspectionText: string, eventId: EventId, attemptId?: string): PendingResult {
  const parsed = parseTimeInput(time);
  if (!parsed) throw new Error('Enter a time, DNF, or DNS.');
  const inspection = inspectionText.trim() ? parseTimeInput(inspectionText) : null;
  if (inspectionText.trim() && (!getEvent(eventId).inspection || !inspection || inspection.rawMs === null || inspection.penalty !== 'none')) throw new Error('Enter a valid inspection time without a penalty.');
  return validatePendingResult({ ...parsed, inputMethod: 'manual', ...(inspection ? { inspectionMs: inspection.rawMs } : {}), ...(attemptId ? { attemptId } : {}) }, eventId);
}

/** One user-facing penalty choice. Correcting it is explicit and retains measured inspection. */
export function selectPendingPenalty(pending: PendingResult, penalty: Penalty, eventId: EventId): PendingResult {
  if (pending.interrupted && penalty !== 'DNF') throw new Error('An interrupted attempt must remain DNF.');
  return validatePendingResult({ ...pending, penalty, inspectionPenalty: 'none' }, eventId);
}
export function selectedPendingPenalty(pending: PendingResult, eventId: EventId): Penalty {
  const inspection = pendingInspection(pending, eventId);
  if (pending.interrupted || pending.penalty === 'DNF' || inspection === 'DNF') return 'DNF';
  if (pending.penalty === 'DNS') return 'DNS';
  return pending.penalty === '+2' || inspection === '+2' ? '+2' : 'none';
}

/** Back is only a stage change. It cannot remove or duplicate a confirmed result. */
export function backDraft(draft: MobileDraft): MobileDraft {
  if (draft.phase === 'running' || draft.phase === 'holding') throw new Error('Stop the timer before going back.');
  if (draft.pending?.interrupted) throw new Error('Review the interrupted attempt before continuing.');
  if (draft.phase === 'review' && draft.pending?.inputMethod === 'timer') throw new Error('A measured solve must be reviewed or explicitly abandoned.');
  return { ...draft, phase: 'ready', pending: undefined };
}
