import type { GeneratedScramble, ScrambleEventId, ScrambleFailureCode } from './types';

export interface GenerateRequest {
  type: 'generate';
  id: number;
  eventId: ScrambleEventId;
}

export type EngineResponse =
  | { type: 'result'; id: number; scramble: GeneratedScramble }
  | { type: 'error'; id: number; code: ScrambleFailureCode; message: string };
