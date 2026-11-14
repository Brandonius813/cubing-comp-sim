export type InspectionCue = 8 | 12;

/** Audio follows the monotonic timer, never controls it. Delayed cues expire. */
export class InspectionCueClock {
  private consumed = new Set<InspectionCue>();
  constructor(private readonly startedAt: number, private readonly graceMs = 500) {}

  tick(now: number, play: (cue: InspectionCue) => boolean): void {
    if (!Number.isFinite(now) || now < this.startedAt) return;
    for (const cue of [8, 12] as const) {
      if (this.consumed.has(cue)) continue;
      const late = now - this.startedAt - cue * 1000;
      if (late < 0) continue;
      if (late > this.graceMs) this.consumed.add(cue);
      else if (play(cue)) this.consumed.add(cue);
    }
  }
}

export interface InspectionPlayer {
  readonly isLoaded: boolean;
  volume: number;
  play(): void;
  pause(): void;
  release(): void;
}

/** One inspection owns its players. Stop/reconfigure disposes them, including queued playback. */
export class InspectionPlayback {
  private clock: InspectionCueClock | null = null;
  private players: Partial<Record<InspectionCue, InspectionPlayer>> = {};
  private volume = 0;

  get ready(): boolean {
    return Boolean(this.players[8]?.isLoaded && this.players[12]?.isLoaded);
  }

  prepare(players: Record<InspectionCue, InspectionPlayer>, volume: number): void {
    this.stop();
    this.players = players;
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
    for (const player of Object.values(players)) player.volume = this.volume;
  }
  start(startedAt: number): void {
    this.clock = Number.isFinite(startedAt) ? new InspectionCueClock(startedAt) : null;
  }
  tick(now: number): void {
    this.clock?.tick(now, cue => {
      const player = this.players[cue];
      if (this.volume === 0) return true;
      if (!player?.isLoaded) return false;
      try { player.play(); return true; } catch { return false; }
    });
  }
  stop(): void {
    this.clock = null;
    for (const player of Object.values(this.players)) {
      try { player.pause(); } catch { /* A native interruption may already have disposed it. */ }
      try { player.release(); } catch { /* Release each remaining player even after an error. */ }
    }
    this.players = {};
  }
}
