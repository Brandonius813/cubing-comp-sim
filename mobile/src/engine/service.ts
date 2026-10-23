import { isScrambleEvent, ScrambleError, type GeneratedScramble, type ScrambleService } from '../../../src/scramble/types';
import { BRIDGE_VERSION, parseEngineResponse, requestScript, type EngineStatus } from './protocol';

interface Pending {
  id: number;
  eventId: string;
  notation?: string;
  resolve: (scramble: GeneratedScramble) => void;
  reject: (error: ScrambleError) => void;
  cleanup?: () => void;
  cancelled?: boolean;
}
export interface EngineBinding {
  channel: string;
  receive(raw: string): void;
  fail(): void;
  dispose(): void;
}
let nextHost = 0;

/** Native JS coordinates messages only. TNoodle never executes in this runtime. */
export class MobileScrambleService implements ScrambleService {
  private nextId = 0;
  private queue: Pending[] = [];
  private active: Pending | undefined;
  private binding: EngineBinding | undefined;
  private send: ((script: string) => void) | undefined;
  private ready = false;
  private disposed = false;
  private report: ((status: EngineStatus) => void) | undefined;
  private progressTimer: ReturnType<typeof setInterval> | undefined;
  private startedAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private restartHost: (() => void) | undefined;

  constructor(private readonly options: { generationTimeoutMs?: number; bootTimeoutMs?: number } = {}) {}

  bind(engineVersion: string, send: (script: string) => void, status: (status: EngineStatus) => void, restart?: () => void): EngineBinding {
    if (this.disposed) throw new ScrambleError('DISPOSED', 'The scramble service has closed.');
    this.binding?.dispose();
    const channel = `ccs_${Date.now()}_${++nextHost}`;
    let closed = false;
    const binding: EngineBinding = {
      channel,
      receive: raw => {
        if (closed || this.binding !== binding) return;
        try {
          const response = parseEngineResponse(raw, channel, engineVersion);
          if (!response) return;
          if (response.type === 'ready') {
            if (this.ready) return;
            this.clearTimer(); this.ready = true; status({ phase: 'ready' }); this.pump();
          } else if (response.type === 'error') {
            // A runtime failure invalidates the host. Re-mount to retry cleanly.
            if (response.id === this.active?.id && this.active?.notation !== undefined) {
              const active = this.active; this.clearTimer(); this.active = undefined; active.cleanup?.();
              if (!active.cancelled) active.reject(new ScrambleError('GENERATION_FAILED', 'Could not draw this scramble.'));
              this.progress(); this.pump();
            } else if (response.id === undefined || response.id === this.active?.id) binding.fail();
          } else {
            const active = this.active;
            if (!active || response.id !== active.id) return;
            if (response.scramble.eventId !== active.eventId || (active.notation !== undefined && active.notation !== response.scramble.notation)) throw new Error('Wrong event in engine response.');
            this.clearTimer(); this.active = undefined;
            active.cleanup?.();
            if (!active.cancelled) active.resolve(response.scramble);
            this.progress(); this.pump();
          }
        } catch { binding.fail(); }
      },
      fail: () => {
        if (closed || this.binding !== binding) return;
        closed = true; this.ready = false; this.send = undefined;
        this.rejectAll(new ScrambleError('ENGINE_UNAVAILABLE', 'The local scramble engine stopped. Retry to restart it.'));
        status({ phase: 'error', message: 'The local scramble engine stopped. Retry to restart it.' });
      },
      dispose: () => {
        closed = true;
        if (this.binding !== binding) return;
        this.ready = false; this.send = undefined; this.binding = undefined;
        this.rejectAll(new ScrambleError('DISPOSED', 'The scramble engine was closed.'));
      },
    };
    this.binding = binding; this.send = send; this.ready = false; this.report = status;
    this.restartHost = restart;
    status({ phase: 'loading' });
    this.timer = setTimeout(binding.fail, this.options.bootTimeoutMs ?? 15_000);
    return binding;
  }

  draw(eventId: string, notation: string, signal?: AbortSignal): Promise<string> {
    return this.request(eventId, { signal, notation }).then(result => result.svg);
  }
  generate(eventId: string, options: { signal?: AbortSignal } = {}): Promise<GeneratedScramble> {
    return this.request(eventId, options);
  }
  private request(eventId: string, options: { signal?: AbortSignal; notation?: string }): Promise<GeneratedScramble> {
    if (options.signal?.aborted) return Promise.reject(new ScrambleError('DISPOSED', 'Scramble request cancelled.'));
    if (this.disposed) return Promise.reject(new ScrambleError('DISPOSED', 'The scramble service has closed.'));
    if (!isScrambleEvent(eventId)) return Promise.reject(new ScrambleError('UNSUPPORTED_EVENT', 'This event is not supported.'));
    if (!this.binding || !this.send) return Promise.reject(new ScrambleError('ENGINE_UNAVAILABLE', 'The local engine is not ready.'));
    if (this.queue.length >= 8) return Promise.reject(new ScrambleError('GENERATION_FAILED', 'Too many queued scramble requests.'));
    return new Promise((resolve, reject) => {
      const pending: Pending = { id: ++this.nextId, eventId, notation: options.notation, resolve, reject };
      const cancel = () => {
        pending.cancelled = true;
        this.queue = this.queue.filter(request => request !== pending);
        pending.cleanup?.();
        reject(new ScrambleError('DISPOSED', 'Scramble request cancelled.'));
        // An injected message cannot interrupt synchronous TNoodle. Retire the
        // WebView instead, so a cancelled event cannot block the selected event.
        if (this.active === pending && this.restartHost) {
          this.clearTimer(); this.active = undefined; this.ready = false;
          this.send = undefined; this.binding = undefined;
          this.report?.({ phase: 'loading' });
          this.restartHost();
        } else this.progress();
      };
      pending.cleanup = () => options.signal?.removeEventListener('abort', cancel);
      options.signal?.addEventListener('abort', cancel, { once: true });
      this.queue.push(pending); this.pump(); this.progress();
    });
  }

  private pump(): void {
    if (!this.ready || this.active || !this.send || !this.binding) return;
    const pending = this.queue.shift();
    if (!pending) return;
    this.active = pending;
    this.startedAt = performance.now();
    this.progressTimer = setInterval(() => this.progress(), 1_000);
    this.progress();
    this.timer = setTimeout(() => this.binding?.fail(), this.options.generationTimeoutMs ?? 180_000);
    try { this.send(requestScript({ version: BRIDGE_VERSION, channel: this.binding.channel, type: 'generate', id: pending.id, eventId: pending.eventId, ...(pending.notation !== undefined ? { notation: pending.notation } : {}) })); }
    catch { this.binding.fail(); }
  }

  private progress(): void {
    if (!this.ready) return;
    this.report?.({ phase: 'ready', generation: this.active ? {
      eventId: this.active.eventId,
      elapsedMs: Math.max(0, performance.now() - this.startedAt),
      queued: this.queue.length,
    } : undefined });
  }
  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    if (this.progressTimer) clearInterval(this.progressTimer); this.progressTimer = undefined;
  }
  private rejectAll(error: ScrambleError): void {
    this.clearTimer();
    const pending = this.active ? [this.active, ...this.queue] : this.queue;
    this.active = undefined; this.queue = [];
    for (const request of pending) { request.cleanup?.(); if (!request.cancelled) request.reject(error); }
  }
  dispose(): void {
    this.disposed = true;
    this.binding?.dispose();
    this.restartHost = undefined;
    this.rejectAll(new ScrambleError('DISPOSED', 'The scramble service has closed.'));
  }
}
