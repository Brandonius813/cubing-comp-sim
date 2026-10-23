import type { TimerPhase } from './practice';
export function pagingLocked(phase: TimerPhase, interacting = false): boolean {
  return interacting || ['inspection', 'holding', 'running'].includes(phase);
}
