import { isLocale, type Locale } from '../locales';

export interface AudioPreferences {
  version: 1;
  voiceMode: 'beeps' | 'device';
  voiceLanguage: Locale | 'follow';
  inspectionVolume: number;
  ambienceTrack: string | null;
  ambienceVolume: number;
}
export const AUDIO_PREFERENCES_KEY = 'cubing-comp-sim:audio:v1';
export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  version: 1, voiceMode: 'beeps', voiceLanguage: 'follow',
  inspectionVolume: 0.8, ambienceTrack: null, ambienceVolume: 0.25,
};
const volume = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
export function validateAudioPreferences(value: unknown): AudioPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('version' in value) || value.version !== 1) return { ...DEFAULT_AUDIO_PREFERENCES };
  const v = value as Record<string, unknown>;
  return {
    version: 1,
    voiceMode: v.voiceMode === 'device' ? 'device' : 'beeps',
    voiceLanguage: v.voiceLanguage === 'follow' || isLocale(v.voiceLanguage) ? v.voiceLanguage : 'follow',
    inspectionVolume: volume(v.inspectionVolume, DEFAULT_AUDIO_PREFERENCES.inspectionVolume),
    ambienceTrack: typeof v.ambienceTrack === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(v.ambienceTrack) ? v.ambienceTrack : null,
    ambienceVolume: volume(v.ambienceVolume, DEFAULT_AUDIO_PREFERENCES.ambienceVolume),
  };
}
let current: AudioPreferences | undefined;
const listeners = new Set<() => void>();
function read(): AudioPreferences {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(AUDIO_PREFERENCES_KEY);
    return raw ? validateAudioPreferences(JSON.parse(raw)) : { ...DEFAULT_AUDIO_PREFERENCES };
  } catch { return { ...DEFAULT_AUDIO_PREFERENCES }; }
}
export function getAudioPreferences(): AudioPreferences { return current ??= read(); }
export function saveAudioPreferences(patch: Partial<Omit<AudioPreferences, 'version'>>): boolean {
  current = validateAudioPreferences({ ...getAudioPreferences(), ...patch, version: 1 });
  let saved = true;
  try { localStorage.setItem(AUDIO_PREFERENCES_KEY, JSON.stringify(current)); } catch { saved = false; }
  for (const listener of listeners) listener();
  return saved;
}
export function subscribeAudioPreferences(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key !== AUDIO_PREFERENCES_KEY && event.key !== null) return;
  current = read(); for (const listener of listeners) listener();
});
