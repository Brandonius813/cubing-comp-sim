import type { EngineResponse, GenerateRequest } from './protocol';
import { isScrambleEvent } from './types';

interface EngineModule {
  generate(event: string): string[];
  engineVersion(): string;
}

const EXPECTED_VERSION = 'tnoodle-lib@d01a947d9f028f38085cda9b0507a9cf3d3f38a8+webcrypto.2';
let enginePromise: Promise<EngineModule> | undefined;

async function getEngine(): Promise<EngineModule> {
  enginePromise ??= (async () => {
    if (!globalThis.crypto?.getRandomValues) throw new Error('Secure random generation is unavailable.');
    const base = new URL(import.meta.env.BASE_URL, globalThis.location.origin);
    const url = new URL('engine/tnoodle.js', base).href;
    const engine: EngineModule = await import(/* @vite-ignore */ url);
    if (typeof engine.generate !== 'function' || engine.engineVersion?.() !== EXPECTED_VERSION) {
      throw new Error('Engine version does not match this app.');
    }
    return engine;
  })();
  try {
    return await enginePromise;
  } catch (error) {
    enginePromise = undefined;
    throw error;
  }
}

function respond(response: EngineResponse) {
  globalThis.postMessage(response);
}

// Promise chaining keeps requests ordered across the asynchronous first import.
let queue = Promise.resolve();
globalThis.onmessage = ({data}: MessageEvent<GenerateRequest>) => {
  queue = queue.then(async () => {
    if (data?.type !== 'generate' || !Number.isSafeInteger(data.id)) return;
    if (!isScrambleEvent(data.eventId)) {
      respond({type: 'error', id: data.id, code: 'UNSUPPORTED_EVENT', message: 'This event is not supported.'});
      return;
    }
    let engine: EngineModule;
    try {
      engine = await getEngine();
    } catch {
      respond({type: 'error', id: data.id, code: 'ENGINE_UNAVAILABLE',
        message: 'The offline scramble engine is not installed. This build cannot generate scrambles yet.'});
      return;
    }
    try {
      const [notation, svg] = engine.generate(data.eventId);
      if (!notation?.trim() || !svg?.startsWith('<svg') || !svg.includes('</svg>')) {
        throw new Error('Invalid generated result.');
      }
      respond({type: 'result', id: data.id, scramble: {
        eventId: data.eventId, notation, svg, engineVersion: EXPECTED_VERSION, generatedAt: Date.now(),
      }});
    } catch {
      respond({type: 'error', id: data.id, code: 'GENERATION_FAILED',
        message: 'Scramble generation failed. No substitute scramble was used. Try again.'});
    }
  });
};
