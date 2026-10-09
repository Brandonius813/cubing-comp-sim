import type { EngineResponse, GenerateRequest } from './protocol';
import { isScrambleEvent, ScrambleError } from './types';
import type { GeneratedScramble, ScrambleService } from './types';

const FIRST_GENERATION_TIMEOUT_MS = 180_000;

/** Generation runs only in a local worker. There is no online scramble fallback. */
export function createScrambleService(): ScrambleService {
  let worker: Worker | undefined;
  let disposed = false;
  let nextId = 0;
  const pending = new Map<number, {
    resolve(value: GeneratedScramble): void;
    reject(error: ScrambleError): void;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  function stopWith(error: ScrambleError) {
    worker?.terminate();
    worker = undefined;
    for (const task of pending.values()) {
      clearTimeout(task.timeout);
      task.reject(error);
    }
    pending.clear();
  }

  function getWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('./worker.ts', import.meta.url), {type: 'module', name: 'tnoodle'});
    worker.onmessage = ({data}: MessageEvent<EngineResponse>) => {
      const task = pending.get(data.id);
      if (!task) return;
      clearTimeout(task.timeout);
      pending.delete(data.id);
      if (data.type === 'result') task.resolve(data.scramble);
      else task.reject(new ScrambleError(data.code, data.message));
    };
    worker.onerror = () => stopWith(new ScrambleError('ENGINE_UNAVAILABLE', 'The offline scramble engine could not start. Reload and try again.'));
    worker.onmessageerror = () => stopWith(new ScrambleError('GENERATION_FAILED', 'The scramble engine returned an unreadable result.'));
    return worker;
  }

  return {
    generate(eventId) {
      if (disposed) return Promise.reject(new ScrambleError('DISPOSED', 'The scramble service is closed.'));
      if (!isScrambleEvent(eventId)) return Promise.reject(new ScrambleError('UNSUPPORTED_EVENT', 'This event is not supported.'));
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        try {
          const active = getWorker();
          const timeout = setTimeout(() => stopWith(new ScrambleError('GENERATION_FAILED',
            'Scramble generation took too long. Try again.')), FIRST_GENERATION_TIMEOUT_MS);
          pending.set(id, {resolve, reject, timeout});
          const request: GenerateRequest = {type: 'generate', id, eventId};
          active.postMessage(request);
        } catch {
          const task = pending.get(id);
          if (task) clearTimeout(task.timeout);
          pending.delete(id);
          reject(new ScrambleError('ENGINE_UNAVAILABLE', 'Offline scramble generation is unavailable in this browser.'));
        }
      });
    },
    dispose() {
      disposed = true;
      stopWith(new ScrambleError('DISPOSED', 'The scramble service is closed.'));
    },
  };
}
