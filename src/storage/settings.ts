import { isLocale, type Locale } from '../locales';
import { isEventId, isValidTime } from '../core';
import type { EventId, InputMethod, Scramble } from '../core';
import { InvalidSaveError, validateScramble } from './validation';

const SYSTEM_FALLBACK = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", sans-serif';
/** Only bundled fonts and device fonts: all options continue working offline. */
export const FONT_OPTIONS = [
  { value: 'geist', label: 'Geist', family: `Geist, ${SYSTEM_FALLBACK}` },
  { value: 'geist-mono', label: 'Geist Mono', family: `"Geist Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace, ${SYSTEM_FALLBACK}` },
  { value: 'system', label: 'System sans-serif', family: SYSTEM_FALLBACK },
  { value: 'system-mono', label: 'System monospace', family: `ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace, ${SYSTEM_FALLBACK}` },
  { value: 'arial', label: 'Arial / Helvetica', family: `Arial, Helvetica, ${SYSTEM_FALLBACK}` },
  { value: 'verdana', label: 'Verdana', family: `Verdana, Geneva, ${SYSTEM_FALLBACK}` },
  { value: 'trebuchet', label: 'Trebuchet MS', family: `"Trebuchet MS", ${SYSTEM_FALLBACK}` },
  { value: 'tahoma', label: 'Tahoma', family: `Tahoma, Geneva, ${SYSTEM_FALLBACK}` },
  { value: 'georgia', label: 'Georgia', family: 'Georgia, "Noto Serif", "Times New Roman", serif' },
  { value: 'times', label: 'Times New Roman', family: '"Times New Roman", Times, "Noto Serif", serif' },
  { value: 'courier', label: 'Courier New', family: `"Courier New", Courier, monospace, ${SYSTEM_FALLBACK}` },
] as const;
export type FontFamily = typeof FONT_OPTIONS[number]['value'];
export type Theme = 'dark' | 'light' | 'system';
export const MAX_WAIT_SECONDS = 300;
// Existing previews allowed up to ten minutes. Read those settings safely, then
// cap them to the current five-minute limit without discarding other preferences.
const LEGACY_MAX_WAIT_SECONDS = 600;
export function isShortcutCode(value: unknown): value is string {
  return typeof value === 'string' && /^(Enter|Space|Key[A-Z]|Digit[0-9]|Numpad[0-9]|NumpadEnter|Arrow(Up|Down|Left|Right)|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash)$/.test(value);
}

export interface Settings {
  eventId: EventId;
  inputMethod: InputMethod;
  inspection: boolean;
  waitSeconds: number;
  waitEnabled: boolean;
  waitMode: 'fixed' | 'random';
  waitMinSeconds: number;
  waitMaxSeconds: number;
  holdMs: number;
  goalMs: number | null;
  audioCallouts: boolean;
  ambience: boolean;
  showScorecard: boolean;
  language: Locale;
  theme: Theme;
  textFont: FontFamily;
  numberFont: FontFamily;
  shortcuts: { advance: string; submit: string };
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  eventId: '333', inputMethod: 'timer', inspection: true, waitSeconds: 0, holdMs: 550,
  waitEnabled: false, waitMode: 'fixed', waitMinSeconds: 15, waitMaxSeconds: 45,
  goalMs: null, audioCallouts: true, ambience: false, showScorecard: true, language: 'en',
  theme: 'dark', textFont: 'geist', numberFont: 'geist-mono', shortcuts: { advance: 'Enter', submit: 'Enter' },
};

export interface SolveDraft {
  roundId: string;
  scramble: Scramble;
  stage: 'scramble' | 'waiting' | 'ready' | 'inspection' | 'solving';
  savedAt: number;
}

export function validateSettings(value: Settings): Settings {
  if (!value || !isEventId(value.eventId) || !['timer', 'manual'].includes(value.inputMethod)
    || !Number.isInteger(value.waitSeconds) || value.waitSeconds < 0 || value.waitSeconds > LEGACY_MAX_WAIT_SECONDS
    || !Number.isInteger(value.holdMs) || value.holdMs < 0 || value.holdMs > 5_000
    || (value.goalMs !== null && !isValidTime(value.goalMs)) || !isLocale(value.language)
    || ['inspection', 'audioCallouts', 'ambience', 'showScorecard'].some(key => typeof value[key as keyof Settings] !== 'boolean')) {
    throw new InvalidSaveError('Invalid settings.');
  }
  // Older saves have no appearance, wait-mode, or shortcut fields. Migrate only
  // missing fields; reject present-but-invalid values instead of resetting data.
  const waitEnabled = value.waitEnabled === undefined ? value.waitSeconds > 0 : value.waitEnabled;
  const waitMode = value.waitMode === undefined ? 'fixed' : value.waitMode;
  const waitMinSeconds = value.waitMinSeconds === undefined ? DEFAULT_SETTINGS.waitMinSeconds : value.waitMinSeconds;
  const waitMaxSeconds = value.waitMaxSeconds === undefined ? DEFAULT_SETTINGS.waitMaxSeconds : value.waitMaxSeconds;
  const theme = value.theme === undefined ? DEFAULT_SETTINGS.theme : value.theme;
  const textFont = value.textFont === undefined ? DEFAULT_SETTINGS.textFont : value.textFont;
  const numberFont = value.numberFont === undefined ? DEFAULT_SETTINGS.numberFont : value.numberFont;
  const shortcuts = value.shortcuts === undefined ? DEFAULT_SETTINGS.shortcuts : value.shortcuts;
  if (typeof waitEnabled !== 'boolean' || !['fixed', 'random'].includes(waitMode)
    || ![waitMinSeconds, waitMaxSeconds].every(seconds => Number.isInteger(seconds) && seconds >= 0 && seconds <= LEGACY_MAX_WAIT_SECONDS)
    || waitMinSeconds > waitMaxSeconds || !['dark', 'light', 'system'].includes(theme)
    || !FONT_OPTIONS.some(font => font.value === textFont) || !FONT_OPTIONS.some(font => font.value === numberFont)
    || !shortcuts || !isShortcutCode(shortcuts.advance) || !isShortcutCode(shortcuts.submit)) {
    throw new InvalidSaveError('Invalid settings.');
  }
  return {
    eventId: value.eventId, inputMethod: value.inputMethod, inspection: value.inspection,
    waitSeconds: Math.min(value.waitSeconds, MAX_WAIT_SECONDS), holdMs: value.holdMs, goalMs: value.goalMs,
    audioCallouts: value.audioCallouts, ambience: value.ambience,
    showScorecard: value.showScorecard, language: value.language,
    waitEnabled, waitMode, waitMinSeconds: Math.min(waitMinSeconds, MAX_WAIT_SECONDS),
    waitMaxSeconds: Math.min(waitMaxSeconds, MAX_WAIT_SECONDS), theme, textFont, numberFont,
    shortcuts: { advance: shortcuts.advance, submit: shortcuts.submit },
  };
}

export function validateDraft(value: SolveDraft, eventId: EventId): SolveDraft {
  if (!value || typeof value.roundId !== 'string' || !value.roundId
    || !['scramble', 'waiting', 'ready', 'inspection', 'solving'].includes(value.stage)
    || !Number.isSafeInteger(value.savedAt) || value.savedAt < 0) throw new InvalidSaveError('Invalid in-progress solve.');
  return { roundId: value.roundId, scramble: validateScramble(value.scramble, eventId), stage: value.stage, savedAt: value.savedAt };
}
