import { isScrambleEvent, SCRAMBLE_EVENTS, type GeneratedScramble } from '../../../src/scramble/types';

export const BRIDGE_VERSION = 1;
export const MAX_MESSAGE_LENGTH = 2_000_000;
export type EngineStatus = { phase: 'loading' | 'ready' | 'error'; message?: string };
export type EngineRequest = { version: 1; channel: string; type: 'generate'; id: number; eventId: string };
export type EngineResponse =
  | { version: 1; channel: string; type: 'ready'; engineVersion: string; events: string[] }
  | { version: 1; channel: string; type: 'result'; id: number; scramble: GeneratedScramble; durationMs: number }
  | { version: 1; channel: string; type: 'error'; id?: number; code: 'ENGINE_UNAVAILABLE' | 'GENERATION_FAILED' | 'UNSUPPORTED_EVENT' };

/** The WebView is a separate runtime. Validate every result before it reaches a solve. */
export function parseEngineResponse(raw: string, channel: string, engineVersion: string): EngineResponse | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_LENGTH) throw new Error('Invalid engine message.');
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object') throw new Error('Invalid engine response.');
  const value = data as Record<string, unknown>;
  // A late response from a retired host cannot settle a newer request.
  if (value.channel !== channel) return null;
  if (value.version !== BRIDGE_VERSION) throw new Error('Unsupported engine bridge.');
  if (value.type === 'ready') {
    const events = value.events;
    if (value.engineVersion !== engineVersion || !Array.isArray(events)
      || events.length !== SCRAMBLE_EVENTS.length || new Set(events).size !== SCRAMBLE_EVENTS.length
      || !SCRAMBLE_EVENTS.every(event => events.includes(event))) throw new Error('Engine does not match this application.');
  } else if (value.type === 'result') {
    if (!Number.isSafeInteger(value.id) || Number(value.id) < 1 || typeof value.durationMs !== 'number'
      || !Number.isFinite(value.durationMs) || value.durationMs < 0) throw new Error('Invalid engine result.');
    const scramble = value.scramble as Partial<GeneratedScramble> | undefined;
    if (!scramble || typeof scramble.eventId !== 'string' || !isScrambleEvent(scramble.eventId)
      || scramble.engineVersion !== engineVersion || typeof scramble.notation !== 'string'
      || !scramble.notation.trim() || scramble.notation.length > 20_000
      || typeof scramble.svg !== 'string' || !scramble.svg.startsWith('<svg') || !scramble.svg.trimEnd().endsWith('</svg>')
      || !Number.isSafeInteger(scramble.generatedAt) || scramble.generatedAt! < 0) throw new Error('Invalid scramble package.');
  } else if (value.type === 'error') {
    if (!['ENGINE_UNAVAILABLE', 'GENERATION_FAILED', 'UNSUPPORTED_EVENT'].includes(String(value.code))
      || (value.id !== undefined && (!Number.isSafeInteger(value.id) || Number(value.id) < 1))) throw new Error('Invalid engine failure.');
  } else throw new Error('Unknown engine response.');
  return value as unknown as EngineResponse;
}

/** Only validated enum input and numeric IDs enter evaluated source. */
export function requestScript(request: EngineRequest): string {
  if (!isScrambleEvent(request.eventId) || !Number.isSafeInteger(request.id) || request.id < 1
    || !/^[a-zA-Z0-9_-]{1,100}$/.test(request.channel)) throw new Error('Invalid engine request.');
  return `globalThis.__ccsEngineReceive(${JSON.stringify(request)});true;`;
}
