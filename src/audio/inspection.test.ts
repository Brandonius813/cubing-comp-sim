import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspectionAudio, selectLocalVoice, takeInspectionCue } from './inspection';
import { DEFAULT_AUDIO_PREFERENCES, getAudioPreferences, saveAudioPreferences, validateAudioPreferences } from './preferences';

const voice = (lang: string, localService = true) => ({ lang, localService, name: lang, voiceURI: lang, default: false }) as SpeechSynthesisVoice;
const preferences = { ...DEFAULT_AUDIO_PREFERENCES, voiceMode: 'device' as const };
function setup(voices = [voice('ja-JP')]) {
  let now = 0;
  const utterances: SpeechSynthesisUtterance[] = [];
  const synthesis = {
    getVoices: vi.fn(() => voices), speak: vi.fn(), cancel: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  };
  const beep = vi.fn();
  const audio = new InspectionAudio({
    synthesis: synthesis as unknown as SpeechSynthesis, beep, now: () => now,
    utterance: text => { const value = { text } as SpeechSynthesisUtterance; utterances.push(value); return value; },
  });
  return { audio, synthesis, beep, utterances, setNow: (value: number) => { now = value; } };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('inspection voice selection', () => {
  it('uses matching local voices and never remote or unrelated voices', () => {
    expect(selectLocalVoice([voice('ja-JP', false), voice('en-US')], 'ja')).toBeUndefined();
    expect(selectLocalVoice([voice('fr-CA'), voice('fr-FR')], 'fr')?.lang).toBe('fr-FR');
    expect(selectLocalVoice([voice('de-AT')], 'de')?.lang).toBe('de-AT');
  });
  it('does not substitute Cantonese or an ambiguous Chinese voice for Mandarin', () => {
    const voices = [voice('yue-HK'), voice('zh-HK'), voice('zh')];
    expect(selectLocalVoice(voices, 'zh-Hans')).toBeUndefined();
    expect(selectLocalVoice(voices, 'zh-Hant')).toBeUndefined();
    expect(selectLocalVoice([...voices, voice('zh-CN')], 'zh-Hans')?.lang).toBe('zh-CN');
    expect(selectLocalVoice([...voices, voice('zh-TW')], 'zh-Hant')?.lang).toBe('zh-TW');
  });
  it('falls back to beeps without speaking when the selected local voice is absent', () => {
    const { audio, beep, synthesis } = setup([]);
    expect(audio.cue('ja', '8秒', preferences)).toBe('beep');
    expect(beep).toHaveBeenCalledWith(preferences.inspectionVolume);
    expect(synthesis.speak).not.toHaveBeenCalled();
    audio.dispose();
  });
  it('sets the requested phrase, voice and volume, and cancels on leaving inspection', () => {
    vi.useFakeTimers();
    const { audio, synthesis, utterances, beep } = setup();
    expect(audio.cue('ja', '8秒', preferences)).toBe('voice');
    expect(utterances[0].text).toBe('8秒');
    expect(utterances[0].voice?.lang).toBe('ja-JP');
    expect(utterances[0].volume).toBe(preferences.inspectionVolume);
    audio.cancel();
    utterances[0].onerror?.({} as SpeechSynthesisErrorEvent);
    vi.runAllTimers();
    expect(synthesis.cancel).toHaveBeenCalledOnce();
    expect(beep).not.toHaveBeenCalled();
    audio.dispose();
  });
  it('expires queued speech instead of playing a stale callout', () => {
    vi.useFakeTimers();
    const { audio, synthesis, utterances, setNow, beep } = setup();
    audio.cue('ja', '8秒', preferences);
    setNow(501); vi.advanceTimersByTime(501);
    utterances[0].onstart?.({} as SpeechSynthesisEvent);
    expect(synthesis.cancel).toHaveBeenCalledOnce();
    expect(beep).not.toHaveBeenCalled();
    audio.dispose();
  });
  it('does not speak or beep after the timer validity guard fails', () => {
    const { audio, synthesis, beep } = setup();
    expect(audio.cue('ja', '8秒', preferences, () => false)).toBe('muted');
    expect(synthesis.speak).not.toHaveBeenCalled();
    expect(beep).not.toHaveBeenCalled();
    audio.dispose();
  });
  it('uses an immediate beep on device speech failure without replaying cancelled errors', () => {
    vi.useFakeTimers();
    const { audio, utterances, beep } = setup();
    audio.cue('ja', '8秒', preferences);
    utterances[0].onerror?.({} as SpeechSynthesisErrorEvent);
    expect(beep).toHaveBeenCalledOnce();
    audio.dispose();
    utterances[0].onerror?.({} as SpeechSynthesisErrorEvent);
    expect(beep).toHaveBeenCalledOnce();
  });
});
describe('inspection scheduling and preferences', () => {
  it('consumes missed thresholds and emits only a fresh callout', () => {
    const consumed = new Set<number>();
    expect(takeInspectionCue(7900, consumed)).toBeNull();
    expect(takeInspectionCue(12_010, consumed)).toBe(12);
    expect([...consumed]).toEqual([8000, 12000]);
    expect(takeInspectionCue(12_020, consumed)).toBeNull();
    expect(takeInspectionCue(17_000, new Set())).toBeNull();
  });
  it('keeps controls usable when preference persistence is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Blocked'); }, setItem: () => { throw new Error('Quota'); } });
    expect(saveAudioPreferences({ voiceLanguage: 'fr', inspectionVolume: 0.4 })).toBe(false);
    expect(getAudioPreferences()).toMatchObject({ voiceLanguage: 'fr', inspectionVolume: 0.4 });
  });
  it('validates all persisted audio preferences independently of solve history', () => {
    expect(validateAudioPreferences({ ...preferences, version: 999 })).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(validateAudioPreferences({ ...preferences, inspectionVolume: Infinity, ambienceVolume: -1, voiceLanguage: 'xx', ambienceTrack: '../../private' })).toEqual({
      ...preferences, inspectionVolume: 0.8, ambienceVolume: 0.25, voiceLanguage: 'follow', ambienceTrack: null,
    });
    expect(validateAudioPreferences({ ...preferences, voiceLanguage: 'zh-Hant', ambienceTrack: 'competition-1', inspectionVolume: 0 })).toMatchObject({ voiceLanguage: 'zh-Hant', ambienceTrack: 'competition-1', inspectionVolume: 0 });
  });
});
