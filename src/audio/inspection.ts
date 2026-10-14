import type { Locale } from '../locales';
import { selectedInspectionVoice, type AudioPreferences } from './preferences';
import { inspectionClipUrl } from './voices';

export type InspectionSeconds = 8 | 12;
const MAX_CUE_DELAY_MS = 500;
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
  context?: AudioContext | null;
  fetch?: typeof fetch;
  now?: () => number;
}
/** Small recordings are decoded ahead of inspection; audio never controls the clock. */
export class InspectionAudio {
  private token = 0;
  private context: AudioContext | null | undefined;
  private source: AudioBufferSourceNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private readonly fetchAudio: typeof fetch;
  private readonly now: () => number;
  constructor(dependencies: AudioDependencies = {}) {
    this.context = dependencies.context;
    this.fetchAudio = dependencies.fetch ?? ((...args) => fetch(...args));
    this.now = dependencies.now ?? (() => performance.now());
  }
  private getContext(): AudioContext | null {
    if (this.context === undefined) {
      try { this.context = new AudioContext(); } catch { this.context = null; }
    }
    return this.context;
  }
  private load(url: string, context: AudioContext): Promise<AudioBuffer> {
    let buffer = this.buffers.get(url);
    if (!buffer) {
      buffer = this.fetchAudio(url).then(response => {
        if (!response.ok) throw new Error('Inspection recording unavailable');
        return response.arrayBuffer();
      }).then(bytes => context.decodeAudioData(bytes)).catch(error => {
        this.buffers.delete(url); throw error;
      });
      this.buffers.set(url, buffer);
    }
    return buffer;
  }
  async prepare(locale: Locale, preferences: AudioPreferences): Promise<boolean> {
    const context = this.getContext();
    if (!context) return false;
    try {
      // Call resume synchronously from the initiating click/key gesture.
      const resume = context.state === 'running' ? Promise.resolve() : context.resume();
      const voice = selectedInspectionVoice(preferences, locale);
      await Promise.all([resume, ...([8, 12] as const).map(seconds => this.load(inspectionClipUrl(locale, voice, seconds), context))]);
      return context.state === 'running';
    } catch { return false; }
  }
  cancel(): void {
    this.token++;
    if (this.source) {
      try { this.source.stop(); } catch { /* Already ended. */ }
      this.source.disconnect(); this.source = null;
    }
  }
  async cue(locale: Locale, seconds: InspectionSeconds, preferences: AudioPreferences, stillValid: () => boolean = () => true): Promise<'voice' | 'unavailable' | 'muted'> {
    this.cancel();
    if (!stillValid() || preferences.inspectionVolume <= 0) return 'muted';
    const context = this.getContext();
    if (!context || context.state !== 'running') return 'unavailable';
    const token = this.token;
    const requestedAt = this.now();
    try {
      const buffer = await this.load(inspectionClipUrl(locale, selectedInspectionVoice(preferences, locale), seconds), context);
      if (token !== this.token || !stillValid() || this.now() - requestedAt > MAX_CUE_DELAY_MS) return 'muted';
      if (context.state !== 'running') return 'unavailable';
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer; gain.gain.value = preferences.inspectionVolume;
      source.connect(gain); gain.connect(context.destination);
      source.onended = () => {
        source.disconnect(); gain.disconnect();
        if (this.source === source) this.source = null;
      };
      this.source = source; source.start();
      return 'voice';
    } catch { return 'unavailable'; }
  }
  dispose(): void {
    this.cancel(); this.buffers.clear();
    const context = this.context; this.context = undefined;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }
}
