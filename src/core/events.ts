import type { EventDefinition, EventId } from './types';

// Format reference: https://www.worldcubeassociation.org/regulations/#9b
// FTO uses the planned Average of 5 format; Clock is an ordinary supported event.
export const EVENTS: readonly EventDefinition[] = [
  { id: '222', name: '2×2×2', format: 'ao5', attemptCount: 5, inspection: true },
  { id: '333', name: '3×3×3', format: 'ao5', attemptCount: 5, inspection: true },
  { id: '444', name: '4×4×4', format: 'ao5', attemptCount: 5, inspection: true },
  { id: '555', name: '5×5×5', format: 'ao5', attemptCount: 5, inspection: true },
  { id: '666', name: '6×6×6', format: 'mo3', attemptCount: 3, inspection: true },
  { id: '777', name: '7×7×7', format: 'mo3', attemptCount: 3, inspection: true },
  { id: '333oh', name: '3×3×3 One-Handed', format: 'ao5', attemptCount: 5, inspection: true },
  { id: '333bf', name: '3×3×3 Blindfolded', format: 'bo5', attemptCount: 5, inspection: false },
  { id: '444bf', name: '4×4×4 Blindfolded', format: 'bo3', attemptCount: 3, inspection: false },
  { id: '555bf', name: '5×5×5 Blindfolded', format: 'bo3', attemptCount: 3, inspection: false },
  { id: 'minx', name: 'Megaminx', format: 'ao5', attemptCount: 5, inspection: true },
  { id: 'pyram', name: 'Pyraminx', format: 'ao5', attemptCount: 5, inspection: true },
  { id: 'skewb', name: 'Skewb', format: 'ao5', attemptCount: 5, inspection: true },
  { id: 'sq1', name: 'Square-1', format: 'ao5', attemptCount: 5, inspection: true },
  { id: 'fto', name: 'FTO', format: 'ao5', attemptCount: 5, inspection: true },
  { id: 'clock', name: 'Clock', format: 'ao5', attemptCount: 5, inspection: true },
];

export function isEventId(value: unknown): value is EventId {
  return typeof value === 'string' && EVENTS.some(event => event.id === value);
}

export function getEvent(eventId: EventId): EventDefinition {
  const event = EVENTS.find(candidate => candidate.id === eventId);
  if (!event) throw new Error(`Unsupported event: ${String(eventId)}`);
  return event;
}

export const FORMAT_LABELS = { ao5: 'Average of 5', mo3: 'Mean of 3', bo5: 'Best of 5', bo3: 'Best of 3' } as const;
