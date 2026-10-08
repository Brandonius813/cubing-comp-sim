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

export interface Scramble {
  eventId: EventId;
  notation: string;
  svg: string;
  engineVersion: string;
  generatedAt: number;
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
  scramble: Scramble;
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
