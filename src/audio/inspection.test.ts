import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspectionAudio, takeInspectionCue } from './inspection';
import { DEFAULT_AUDIO_PREFERENCES, getAudioPreferences, saveAudioPreferences, selectedInspectionVoice, validateAudioPreferences } from './preferences';
import { LOCALES } from '../locales';
const preferences = { ...DEFAULT_AUDIO_PREFERENCES };
function setup() {
  let now = 0;
  const source = { start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), buffer: null, onended: null };
  const gain = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const context = { state: 'running', resume: vi.fn(async () => {}), close: vi.fn(async () => {}), decodeAudioData: vi.fn(async () => ({ duration: 1 })), createBufferSource: vi.fn(() => source), createGain: vi.fn(() => gain), destination: {} };
  const fetchAudio = vi.fn(async (_url: string) => new Response(new Uint8Array([1])));
  const audio = new InspectionAudio({ context: context as unknown as AudioContext, fetch: fetchAudio as unknown as typeof fetch, now: () => now });
  return { audio, context, source, gain, fetchAudio, setNow: (value: number) => { now = value; } };
}
afterEach(() => { vi.unstubAllGlobals(); });
describe('recorded inspection voices', () => {
  it('preloads both selected clips, applies volume, and interrupts playback', async () => {
    const { audio, fetchAudio, source, gain } = setup();
    const prefs = { ...preferences, inspectionVoices: { ja: 'female-2' as const }, inspectionVolume: 0.35 };
    expect(await audio.prepare('ja', prefs)).toBe(true);
    expect(fetchAudio.mock.calls.map(call => call[0])).toEqual(['/audio/inspection/v1/ja/female-2-8.mp3', '/audio/inspection/v1/ja/female-2-12.mp3']);
    expect(await audio.cue('ja', 8, prefs)).toBe('voice');
    expect(fetchAudio).toHaveBeenCalledTimes(2);
    expect(gain.gain.value).toBe(0.35); expect(source.start).toHaveBeenCalledOnce();
    audio.cancel(); expect(source.stop).toHaveBeenCalledOnce(); audio.dispose();
  });
  it('never mixes mainland and Taiwanese Mandarin packs', async () => {
    const { audio, fetchAudio } = setup();
    await audio.prepare('zh-Hans', preferences); await audio.prepare('zh-Hant', preferences);
    expect(fetchAudio.mock.calls.map(call => call[0])).toEqual([
      '/audio/inspection/v1/zh-Hans/male-1-8.mp3', '/audio/inspection/v1/zh-Hans/male-1-12.mp3',
      '/audio/inspection/v1/zh-Hant/male-1-8.mp3', '/audio/inspection/v1/zh-Hant/male-1-12.mp3',
    ]);
  });
  it('drops a recording that finishes loading too late', async () => {
    const { audio, source, context, setNow } = setup();
    context.decodeAudioData.mockImplementation(async () => { setNow(501); return { duration: 1 }; });
    expect(await audio.cue('ja', 8, preferences)).toBe('muted');
    expect(source.start).not.toHaveBeenCalled();
  });
  it('cannot start after cancellation or after the inspection validity guard fails', async () => {
    const { audio, source } = setup();
    const pending = audio.cue('ja', 8, preferences); audio.cancel();
    expect(await pending).toBe('muted');
    let valid = true;
    const next = audio.cue('ja', 12, preferences, () => valid); valid = false;
    expect(await next).toBe('muted'); expect(source.start).not.toHaveBeenCalled();
  });
  it('stays silent when muted, unsupported, or suspended', async () => {
    const { audio, fetchAudio, context } = setup();
    expect(await audio.cue('ja', 8, { ...preferences, inspectionVolume: 0 })).toBe('muted');
    expect(fetchAudio).not.toHaveBeenCalled();
    context.state = 'suspended';
    expect(await audio.cue('ja', 8, preferences)).toBe('unavailable');
    expect(await new InspectionAudio({ context: null }).prepare('en', preferences)).toBe(false);
  });
  it('handles load failures and permits a later explicit retry', async () => {
    const { audio, fetchAudio, source } = setup();
    fetchAudio.mockRejectedValueOnce(new Error('Offline'));
    expect(await audio.cue('ja', 8, preferences)).toBe('unavailable');
    expect(source.start).not.toHaveBeenCalled();
    expect(await audio.cue('ja', 8, preferences)).toBe('voice');
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
  it('defaults every locale to Male 1 while migrating existing settings', () => {
    const old = validateAudioPreferences({ version: 1, voiceLanguage: 'fr', inspectionVolume: 0.35 });
    for (const { id } of LOCALES) expect(selectedInspectionVoice(old, id)).toBe('male-1');
    expect(old.voiceLanguage).toBe('fr'); expect(old.inspectionVolume).toBe(0.35);
  });
  it('remembers a different voice in each language and rejects corrupt choices', () => {
    const validated = validateAudioPreferences({ ...preferences, inspectionVoices: { fr: 'female-2', ja: 'male-2', en: 'invalid', xx: 'female-1' } });
    expect(validated.inspectionVoices).toEqual({ fr: 'female-2', ja: 'male-2' });
    expect(selectedInspectionVoice(validated, 'en')).toBe('male-1');
    expect(selectedInspectionVoice(validated, 'fr')).toBe('female-2');
  });
  it('migrates the removed beep preference to voice-only settings', () => {
    expect(validateAudioPreferences({ ...preferences, voiceMode: 'beeps' })).toEqual(preferences);
  });
  it('validates all persisted audio preferences independently of solve history', () => {
    expect(validateAudioPreferences({ ...preferences, version: 999 })).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(validateAudioPreferences({ ...preferences, inspectionVolume: Infinity, ambienceVolume: -1, voiceLanguage: 'xx', ambienceTrack: '../../private' })).toEqual({
      ...preferences, inspectionVolume: 0.8, ambienceVolume: 0.25, voiceLanguage: 'follow', ambienceTrack: null,
    });
    expect(validateAudioPreferences({ ...preferences, voiceLanguage: 'zh-Hant', ambienceTrack: 'competition-1', inspectionVolume: 0 })).toMatchObject({ voiceLanguage: 'zh-Hant', ambienceTrack: 'competition-1', inspectionVolume: 0 });
  });
});
