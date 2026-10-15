import { isScrambleEvent, ScrambleError, type GeneratedScramble, type ScrambleService } from '../../../src/scramble/types';
import { BRIDGE_VERSION, parseEngineResponse, requestScript, type EngineStatus } from './protocol';

interface Pending {
  id: number;
  eventId: string;
  resolve: (scramble: GeneratedScramble) => void;
  reject: (error: ScrambleError) => void;
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
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: { generationTimeoutMs?: number; bootTimeoutMs?: number } = {}) {}

  bind(engineVersion: string, send: (script: string) => void, status: (status: EngineStatus) => void): EngineBinding {
    if (this.disposed) throw new ScrambleError('DISPOSED', 'The scramble service has closed.');
    this.binding?.dispose();
    const channel = `ccs_${Date.now()}_${++nextHost}`;
    let closed = false;
    const binding: EngineBinding = {
      channel,
      receive: raw => {
        if (closed) return;
        try {
          const response = parseEngineResponse(raw, channel, engineVersion);
          if (!response) return;
          if (response.type === 'ready') {
            if (this.ready) return;
            this.clearTimer(); this.ready = true; status({ phase: 'ready' }); this.pump();
          } else if (response.type === 'error') {
            // A runtime failure invalidates the host. Re-mount to retry cleanly.
            binding.fail();
          } else {
            const active = this.active;
            if (!active || response.id !== active.id) return;
            if (response.scramble.eventId !== active.eventId) throw new Error('Wrong event in engine response.');
            this.clearTimer(); this.active = undefined;
            active.resolve(response.scramble); this.pump();
          }
        } catch { binding.fail(); }
      },
      fail: () => {
        if (closed) return;
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
    this.binding = binding; this.send = send; this.ready = false;
    status({ phase: 'loading' });
    this.timer = setTimeout(binding.fail, this.options.bootTimeoutMs ?? 15_000);
    return binding;
  }

  generate(eventId: string): Promise<GeneratedScramble> {
    if (this.disposed) return Promise.reject(new ScrambleError('DISPOSED', 'The scramble service has closed.'));
    if (!isScrambleEvent(eventId)) return Promise.reject(new ScrambleError('UNSUPPORTED_EVENT', 'This event is not supported.'));
    if (!this.binding || !this.send) return Promise.reject(new ScrambleError('ENGINE_UNAVAILABLE', 'The local engine is not ready.'));
    if (this.queue.length >= 8) return Promise.reject(new ScrambleError('GENERATION_FAILED', 'Too many queued scramble requests.'));
    return new Promise((resolve, reject) => {
      this.queue.push({ id: ++this.nextId, eventId, resolve, reject }); this.pump();
    });
  }

  private pump(): void {
    if (!this.ready || this.active || !this.send || !this.binding) return;
    const pending = this.queue.shift();
    if (!pending) return;
    this.active = pending;
    this.timer = setTimeout(() => this.binding?.fail(), this.options.generationTimeoutMs ?? 180_000);
    try { this.send(requestScript({ version: BRIDGE_VERSION, channel: this.binding.channel, type: 'generate', id: pending.id, eventId: pending.eventId })); }
    catch { this.binding.fail(); }
  }

  private clearTimer(): void { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
  private rejectAll(error: ScrambleError): void {
    this.clearTimer();
    const pending = this.active ? [this.active, ...this.queue] : this.queue;
    this.active = undefined; this.queue = [];
    for (const request of pending) request.reject(error);
  }
  dispose(): void { this.binding?.dispose(); this.disposed = true; }
}
