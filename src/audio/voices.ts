import type { Locale } from '../locales';

export const INSPECTION_VOICES = ['male-1', 'male-2', 'female-1', 'female-2'] as const;
export type InspectionVoice = typeof INSPECTION_VOICES[number];
export function isInspectionVoice(value: unknown): value is InspectionVoice {
  return INSPECTION_VOICES.some(voice => voice === value);
}
export function inspectionClipUrl(locale: Locale, voice: InspectionVoice, seconds: 8 | 12): string {
  // Immutable pack directory: new recordings require a new version.
  return `/audio/inspection/v1/${locale}/${voice}-${seconds}.mp3`;
}
