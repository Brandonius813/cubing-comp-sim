import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { Locale } from '../../../src/locales';
import type { InspectionVoice } from '../../../src/audio/voices';
import { INSPECTION_ASSETS } from './assets';
import { InspectionPlayback } from './cues';

export interface InspectionAudioSelection {
  language: Locale;
  voice: InspectionVoice;
  volume: number;
}

/** Foreground-only native playback. No microphone, remote audio, TTS or beep fallback. */
export class NativeInspectionAudio {
  private playback = new InspectionPlayback();
  private interval: ReturnType<typeof setInterval> | null = null;
  private previewEnd: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private prepared = false;
  private startedAt: number | null = null;

  async prepare(selection: InspectionAudioSelection): Promise<void> {
    this.stop();
    const generation = this.generation;
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'doNotMix',
    });
    if (generation !== this.generation) return;
    const pair = INSPECTION_ASSETS[selection.language]?.[selection.voice];
    if (!pair) throw new Error('This inspection voice is unavailable.');
    const eight = createAudioPlayer(pair[8]);
    try {
      const twelve = createAudioPlayer(pair[12]);
      this.playback.prepare({ 8: eight, 12: twelve }, selection.volume);
      this.prepared = true;
      if (this.startedAt !== null) this.playback.start(this.startedAt);
    } catch (error) { eight.release(); throw error; }
  }

  /** Supply the SAME performance.now() origin used by the practice timer. */
  start(startedAt: number): void {
    this.startedAt = startedAt;
    if (this.interval) clearInterval(this.interval);
    this.playback.start(startedAt);
    this.interval = setInterval(() => this.playback.tick(performance.now()), 25);
  }

  /** Preview both selected clips, bounded to the same cue deadlines as inspection. */
  async preview(selection: InspectionAudioSelection): Promise<void> {
    await this.prepare(selection);
    if (!this.prepared) return;
    const generation = this.generation;
    const deadline = performance.now() + 3000;
    while (!this.playback.ready && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 25));
      if (generation !== this.generation) return;
    }
    if (!this.playback.ready) {
      this.stop();
      throw new Error('The inspection recording could not be loaded.');
    }
    this.start(performance.now() - 8000);
    this.previewEnd = setTimeout(() => this.stop(), 6500);
  }

  /** Call synchronously when leaving inspection, backgrounding, cancelling, or unmounting. */
  stop(): void {
    this.generation++;
    this.prepared = false;
    this.startedAt = null;
    if (this.interval) clearInterval(this.interval);
    if (this.previewEnd) clearTimeout(this.previewEnd);
    this.interval = null;
    this.previewEnd = null;
    this.playback.stop();
  }
}
