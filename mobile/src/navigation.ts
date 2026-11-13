import type { TimerPhase } from './practice';
/** Page swipes are off whenever a touch on the timer can start or stop a solve.
 * "ready" is included because iOS otherwise lets the pager claim a slightly
 * drifting hold, cancelling it before the timer starts. */
export function pagingLocked(phase: TimerPhase, interacting = false): boolean {
  return interacting || ['ready', 'inspection', 'holding', 'running'].includes(phase);
}
