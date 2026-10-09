import { LOCALES, type Locale } from '../locales';
import type { AudioPreferences } from './preferences';

export type InspectionSeconds = 8 | 12;
const MAX_CUE_DELAY_MS = 500;
function normalized(tag: string): string { return tag.replace(/_/g, '-').toLowerCase(); }

/** Local voices only. Mandarin never falls back to Cantonese or ambiguous zh. */
export function selectLocalVoice(voices: readonly SpeechSynthesisVoice[], locale: Locale): SpeechSynthesisVoice | undefined {
  const wanted = normalized(LOCALES.find(item => item.id === locale)!.speechTag);
  const local = voices.filter(voice => voice.localService === true);
  const exact = local.find(voice => normalized(voice.lang) === wanted);
  if (exact) return exact;
  if (locale === 'zh-Hans' || locale === 'zh-Hant') {
    const permitted = locale === 'zh-Hans' ? ['zh-cn', 'zh-sg', 'cmn-cn', 'cmn-hans-cn'] : ['zh-tw', 'cmn-tw', 'cmn-hant-tw'];
    return local.find(voice => permitted.includes(normalized(voice.lang)));
  }
  const language = wanted.split('-')[0];
  return local.find(voice => normalized(voice.lang).split('-')[0] === language);
}

/** Consume missed thresholds without replaying both callouts after a suspended tab. */
export function takeInspectionCue(elapsedMs: number, consumed: Set<number>): InspectionSeconds | null {
  let cue: InspectionSeconds | null = null;
  for (const seconds of [8, 12] as const) {
    const threshold = seconds * 1000;
    if (elapsedMs < threshold || consumed.has(threshold)) continue;
    consumed.add(threshold);
    if (elapsedMs - threshold <= MAX_CUE_DELAY_MS) cue = seconds;
  }
  return cue;
}
interface AudioDependencies {
  synthesis?: SpeechSynthesis | null;
  utterance?: (text: string) => SpeechSynthesisUtterance;
  now?: () => number;
  beep?: (volume: number) => void;
}
export class InspectionAudio {
  private context: AudioContext | null = null;
  private token = 0;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private ownsSpeech = false;
  private readonly synthesis: SpeechSynthesis | null;
  private readonly makeUtterance: (text: string) => SpeechSynthesisUtterance;
  private readonly now: () => number;
  constructor(private readonly dependencies: AudioDependencies = {}) {
    this.synthesis = dependencies.synthesis === undefined
      ? (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)
      : dependencies.synthesis;
    this.makeUtterance = dependencies.utterance ?? (text => new SpeechSynthesisUtterance(text));
    this.now = dependencies.now ?? (() => performance.now());
  }
  prepare(): Promise<void> {
    try {
      this.context ??= new AudioContext();
      return this.context.resume().catch(() => undefined);
    } catch { return Promise.resolve(); /* The monotonic timer does not depend on sound. */ }
  }
  voices(): SpeechSynthesisVoice[] {
    try { return this.synthesis?.getVoices() ?? []; } catch { return []; }
  }
  onVoicesChanged(listener: () => void): () => void {
    this.synthesis?.addEventListener('voiceschanged', listener);
    return () => this.synthesis?.removeEventListener('voiceschanged', listener);
  }
  private beep(volume: number): void {
    if (volume <= 0) return;
    if (this.dependencies.beep) { this.dependencies.beep(volume); return; }
    try {
      const context = this.context;
      if (!context || context.state !== 'running') return;
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(Math.max(0.001, volume * 0.1), context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(); oscillator.stop(context.currentTime + 0.17);
    } catch { /* Audio failures never change timing or scoring. */ }
  }
  cancel(): void {
    this.token++;
    if (this.pending !== null) clearTimeout(this.pending);
    this.pending = null;
    if (this.ownsSpeech) { this.ownsSpeech = false; try { this.synthesis?.cancel(); } catch { /* Unsupported device. */ } }
  }
  cue(locale: Locale, phrase: string, preferences: AudioPreferences, stillValid: () => boolean = () => true): 'voice' | 'beep' | 'muted' {
    this.cancel();
    if (!stillValid() || preferences.inspectionVolume <= 0) return 'muted';
    const voice = preferences.voiceMode === 'device' ? selectLocalVoice(this.voices(), locale) : undefined;
    if (!voice || !this.synthesis) { this.beep(preferences.inspectionVolume); return 'beep'; }
    const token = this.token;
    const requestedAt = this.now();
    const valid = () => this.token === token && stillValid() && this.now() - requestedAt <= MAX_CUE_DELAY_MS;
    let started = false;
    const finishPending = () => { if (this.pending !== null) clearTimeout(this.pending); this.pending = null; };
    try {
      const utterance = this.makeUtterance(phrase);
      utterance.voice = voice; utterance.lang = voice.lang; utterance.volume = preferences.inspectionVolume;
      utterance.rate = 1; utterance.pitch = 1;
      utterance.onstart = () => { if (!valid()) { if (token === this.token) this.cancel(); return; } started = true; finishPending(); };
      utterance.onend = () => { if (token === this.token) { finishPending(); this.ownsSpeech = false; } };
      utterance.onerror = () => {
        if (token !== this.token) return;
        finishPending(); this.ownsSpeech = false;
        if (!started && valid()) this.beep(preferences.inspectionVolume);
      };
      this.ownsSpeech = true;
      this.pending = setTimeout(() => { if (token === this.token && !started) this.cancel(); }, MAX_CUE_DELAY_MS);
      this.synthesis.speak(utterance);
      return 'voice';
    } catch {
      this.cancel();
      if (stillValid() && this.now() - requestedAt <= MAX_CUE_DELAY_MS) this.beep(preferences.inspectionVolume);
      return 'beep';
    }
  }
  dispose(): void {
    this.cancel();
    try { void this.context?.close().catch(() => undefined); } catch { /* Already closed. */ }
    this.context = null;
  }
}
