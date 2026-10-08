export const SCRAMBLE_EVENTS = [
  '222', '333', '444', '555', '666', '777', '333oh', '333bf',
  '444bf', '555bf', 'minx', 'pyram', 'skewb', 'sq1', 'fto', 'clock',
] as const;

export type ScrambleEventId = (typeof SCRAMBLE_EVENTS)[number];

export interface GeneratedScramble {
  eventId: ScrambleEventId;
  notation: string;
  svg: string;
  engineVersion: string;
  generatedAt: number;
}

export type ScrambleFailureCode = 'ENGINE_UNAVAILABLE' | 'GENERATION_FAILED' | 'UNSUPPORTED_EVENT' | 'DISPOSED';

export class ScrambleError extends Error {
  constructor(public readonly code: ScrambleFailureCode, message: string) {
    super(message);
    this.name = 'ScrambleError';
  }
}

export interface ScrambleService {
  generate(eventId: string): Promise<GeneratedScramble>;
  dispose(): void;
}

export function isScrambleEvent(event: string): event is ScrambleEventId {
  return (SCRAMBLE_EVENTS as readonly string[]).includes(event);
}
