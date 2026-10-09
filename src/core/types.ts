export type EventId = '222' | '333' | '444' | '555' | '666' | '777' | '333oh' | '333bf' | '444bf' | '555bf' | 'minx' | 'pyram' | 'skewb' | 'sq1' | 'fto' | 'clock';
export type RoundFormat = 'ao5' | 'mo3' | 'bo5' | 'bo3';
export type Penalty = 'none' | '+2' | 'DNF' | 'DNS';
export type InspectionPenalty = 'none' | '+2' | 'DNF';
export type InputMethod = 'timer' | 'manual';

export interface EventDefinition {
  id: EventId;
  name: string;
  format: RoundFormat;
  attemptCount: 3 | 5;
  inspection: boolean;
}

/** Portable history stores the exact notation and engine identity, not drawings. */
export interface StoredScramble {
  eventId: EventId;
  notation: string;
  engineVersion: string;
  generatedAt: number;
}

/** Active scrambles retain their drawing while the solve is in progress. */
export interface Scramble extends StoredScramble {
  svg: string;
}

export interface Attempt {
  id: string;
  roundId: string;
  /** Zero-based position within the round. */
  index: number;
  /** Original measured value. Never replaced by a formatted or penalized value. */
  rawMs: number | null;
  /** User-selected additional penalty, independent of inspection. */
  penalty: Penalty;
  inspectionPenalty: InspectionPenalty;
  inputMethod: InputMethod;
  scramble: StoredScramble;
  recordedAt: number;
  inspectionMs?: number;
}

export interface Round {
  id: string;
  eventId: EventId;
  format: RoundFormat;
  attempts: Attempt[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  goalMs?: number;
}

export interface Score {
  status: 'incomplete' | 'ok' | 'DNF';
  valueMs: number | null;
  discardedIndices: number[];
}

export interface ParsedTime {
  rawMs: number | null;
  penalty: Penalty;
}
