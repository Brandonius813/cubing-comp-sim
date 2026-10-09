import { isLocale, type Locale } from '../locales';
import { isEventId, isValidTime } from '../core';
import type { EventId, InputMethod, Scramble } from '../core';
import { InvalidSaveError, validateScramble } from './validation';

export interface Settings {
  eventId: EventId;
  inputMethod: InputMethod;
  inspection: boolean;
  waitSeconds: number;
  holdMs: number;
  goalMs: number | null;
  audioCallouts: boolean;
  ambience: boolean;
  showScorecard: boolean;
  language: Locale;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  eventId: '333', inputMethod: 'timer', inspection: true, waitSeconds: 0, holdMs: 300,
  goalMs: null, audioCallouts: true, ambience: false, showScorecard: true, language: 'en',
};

export interface SolveDraft {
  roundId: string;
  scramble: Scramble;
  stage: 'scramble' | 'waiting' | 'ready' | 'inspection' | 'solving';
  savedAt: number;
}

export function validateSettings(value: Settings): Settings {
  if (!value || !isEventId(value.eventId) || !['timer', 'manual'].includes(value.inputMethod)
    || !Number.isInteger(value.waitSeconds) || value.waitSeconds < 0 || value.waitSeconds > 600
    || !Number.isInteger(value.holdMs) || value.holdMs < 0 || value.holdMs > 5_000
    || (value.goalMs !== null && !isValidTime(value.goalMs)) || !isLocale(value.language)
    || ['inspection', 'audioCallouts', 'ambience', 'showScorecard'].some(key => typeof value[key as keyof Settings] !== 'boolean')) {
    throw new InvalidSaveError('Invalid settings.');
  }
  return {
    eventId: value.eventId, inputMethod: value.inputMethod, inspection: value.inspection,
    waitSeconds: value.waitSeconds, holdMs: value.holdMs, goalMs: value.goalMs,
    audioCallouts: value.audioCallouts, ambience: value.ambience,
    showScorecard: value.showScorecard, language: value.language,
  };
}

export function validateDraft(value: SolveDraft, eventId: EventId): SolveDraft {
  if (!value || typeof value.roundId !== 'string' || !value.roundId
    || !['scramble', 'waiting', 'ready', 'inspection', 'solving'].includes(value.stage)
    || !Number.isSafeInteger(value.savedAt) || value.savedAt < 0) throw new InvalidSaveError('Invalid in-progress solve.');
  return { roundId: value.roundId, scramble: validateScramble(value.scramble, eventId), stage: value.stage, savedAt: value.savedAt };
}
