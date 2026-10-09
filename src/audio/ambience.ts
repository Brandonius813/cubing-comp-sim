export interface AmbienceTrack {
  id: string;
  title: string;
  url: string;
  durationSeconds: number;
  attribution: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
}
export interface AudioCatalog { version: 1; tracks: AmbienceTrack[] }
const MAX_CATALOG_BYTES = 65_536;
function text(value: unknown, max = 200): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
function publicUrl(value: unknown, origin: string, audio: boolean): string | null {
  if (!text(value, 2048)) return null;
  try {
    const url = new URL(value, origin);
    if (url.username || url.password || url.hash || url.search) return null;
    if (url.origin === origin) {
      if (audio && !url.pathname.startsWith('/audio/background/')) return null;
      return url.href;
    }
    // Remote catalog assets must use a public DNS name, never private/local IPs.
    if (url.protocol !== 'https:' || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) || /\.(localhost|local|internal|test|invalid)$/i.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
export function validateAudioCatalog(value: unknown, origin: string): AudioCatalog {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('tracks' in value) || !Array.isArray(value.tracks) || value.tracks.length > 50) throw new Error('INVALID_AUDIO_CATALOG');
  const ids = new Set<string>();
  const tracks = value.tracks.map((raw: unknown): AmbienceTrack => {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_AUDIO_TRACK');
    const track = raw as Record<string, unknown>;
    const url = publicUrl(track.url, origin, true);
    const sourceUrl = publicUrl(track.sourceUrl, origin, false);
    const licenseUrl = publicUrl(track.licenseUrl, origin, false);
    if (!text(track.id, 64) || !/^[a-z0-9][a-z0-9-]*$/.test(track.id) || ids.has(track.id) ||
      !text(track.title, 100) || !url || !sourceUrl || !licenseUrl || !text(track.attribution, 500) ||
      !text(track.license, 100) || typeof track.durationSeconds !== 'number' ||
      !Number.isFinite(track.durationSeconds) || track.durationSeconds < 60 || track.durationSeconds > 3600) throw new Error('INVALID_AUDIO_TRACK');
    ids.add(track.id);
    return { id: track.id, title: track.title, url, durationSeconds: track.durationSeconds, attribution: track.attribution, sourceUrl, license: track.license, licenseUrl };
  });
  return { version: 1, tracks };
}
export async function loadAudioCatalog(signal?: AbortSignal): Promise<AudioCatalog> {
  const response = await fetch('/audio/catalog.json', { signal, credentials: 'omit' });
  if (!response.ok || Number(response.headers.get('content-length') ?? 0) > MAX_CATALOG_BYTES) throw new Error('AUDIO_CATALOG_UNAVAILABLE');
  const body = await response.text();
  if (body.length > MAX_CATALOG_BYTES) throw new Error('INVALID_AUDIO_CATALOG');
  return validateAudioCatalog(JSON.parse(body), location.origin);
}
export interface AmbienceState { status: 'idle' | 'loading' | 'playing' | 'paused' | 'offline' | 'error'; trackId: string | null }
export class AmbiencePlayer {
  private audio: HTMLAudioElement | null = null;
  private request = 0;
  private state: AmbienceState = { status: 'idle', trackId: null };
  private listeners = new Set<() => void>();
  constructor(
    private readonly makeAudio: () => HTMLAudioElement = () => new Audio(),
    private readonly isOnline: () => boolean = () => typeof navigator === 'undefined' || navigator.onLine,
  ) {}
  getSnapshot = (): AmbienceState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(status: AmbienceState['status'], trackId = this.state.trackId) {
    this.state = { status, trackId }; for (const listener of this.listeners) listener();
  }
  volume(volume: number): void { if (this.audio) this.audio.volume = Math.max(0, Math.min(1, volume)); }
  pause(): void {
    this.request++;
    this.audio?.pause();
    this.update(this.isOnline() ? 'paused' : 'offline');
  }
  offline = (): void => {
    // navigator.onLine is only a hint. Buffered media may still play successfully.
    if (this.state.status !== 'playing' && this.state.status !== 'loading') this.update('offline');
  };
  online = (): void => { if (this.state.status === 'offline') this.update('paused'); };
  /** Invoke only from an explicit Play click. No settings read starts playback. */
  async play(track: AmbienceTrack, volume: number): Promise<void> {
    this.pause();
    if (!this.isOnline()) { this.update('offline', track.id); return; }
    const request = ++this.request;
    try {
      const audio = this.audio ??= this.makeAudio();
      audio.preload = 'none'; audio.loop = true; audio.volume = Math.max(0, Math.min(1, volume));
      if (audio.src !== track.url) audio.src = track.url;
      audio.onerror = () => { if (request === this.request) { this.request++; audio.pause(); this.update('error', track.id); } };
      this.update('loading', track.id);
      await audio.play();
      if (request !== this.request) return;
      this.update('playing', track.id);
    } catch { if (request === this.request) this.update(this.isOnline() ? 'error' : 'offline', track.id); }
  }
}
export const ambiencePlayer = new AmbiencePlayer();
if (typeof window !== 'undefined') {
  window.addEventListener('offline', ambiencePlayer.offline);
  window.addEventListener('online', ambiencePlayer.online);
  window.addEventListener('pagehide', () => ambiencePlayer.pause());
}
