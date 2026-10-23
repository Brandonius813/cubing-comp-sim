import type { TimerPhase } from './practice';

export type PageDeparture = 'keep' | 'cancel-hold' | 'interrupt';
/** Paging always remains available. Only unsafe active timing is converted to DNF. */
export function pageDeparture(phase: TimerPhase, destination: number, inspectionStarted: boolean): PageDeparture {
  if (destination === 1) return 'keep';
  if (phase === 'running' || phase === 'inspection') return 'interrupt';
  if (phase === 'holding') return inspectionStarted ? 'interrupt' : 'cancel-hold';
  return 'keep';
}
