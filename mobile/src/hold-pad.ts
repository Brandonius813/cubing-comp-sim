/**
 * The timer's touch surface, modelled on a competition timing mat.
 *
 * The screen is either touched (one or more fingers down) or not. A gesture
 * begins when the first finger lands and ends when the last finger lifts.
 * Extra fingers, a palm, and a rolling thumb never interrupt a hold.
 *
 * What a gesture means is decided by the caller when it begins:
 * - `hold`:      red until held for `holdMs`, then armed (green). Lifting the
 *                last finger starts the solve if armed, otherwise aborts.
 *                Once armed, the solve always starts on release.
 * - `stop`:      stops a running solve at touch-down.
 * - `tap`:       a press-and-release (page swipes are locked here).
 * - `swipeTap`:  a press-and-release that is ignored if any finger moved far
 *                enough to be a page swipe (screens where paging is allowed).
 * - `ignore`:    nothing happens until every finger has lifted.
 *
 * Pure logic with no React Native imports, so every touch sequence is testable.
 */

export type PressKind = 'hold' | 'stop' | 'tap' | 'swipeTap' | 'ignore';

export type HoldPadEvent =
  | { type: 'stop'; nativeAt: number | null }
  | { type: 'holdStart' }
  | { type: 'armed' }
  | { type: 'start'; nativeAt: number | null }
  | { type: 'holdAbort' }
  | { type: 'tap' };

export interface Contact { id: unknown; x: number; y: number }

export interface PadInput {
  /** Fingers that just went down, moved, or lifted in this event. */
  changed: Contact[];
  /** Fingers still on the screen after this event, according to the OS. */
  remaining: number;
  /** JS clock (performance.now) when the event was handled. */
  at: number;
  /** Native touch timestamp of this event, when available. */
  nativeAt: number | null;
}

/** How far a finger may move before a `swipeTap` counts as a swipe. */
export const SWIPE_DISTANCE = 12;

interface Gesture { kind: PressKind; startedAt: number; armed: boolean; swiped: boolean }

export class HoldPad {
  private fingers = new Map<unknown, { x: number; y: number }>();
  private gesture: Gesture | null = null;

  constructor(private readonly holdMs: () => number) {}

  /** True while a hold has been held long enough to start on release. */
  get armed(): boolean { return this.gesture?.kind === 'hold' && this.gesture.armed; }
  get pressed(): boolean { return this.fingers.size > 0; }

  press(input: PadInput, kind: PressKind): HoldPadEvent[] {
    // If the OS says only these new fingers are down, any fingers we still
    // remember are stale (a lost lift event), so start fresh.
    if (input.remaining <= input.changed.length) { this.fingers.clear(); this.gesture = null; }
    const first = this.fingers.size === 0 && this.gesture === null;
    for (const contact of input.changed) this.fingers.set(contact.id, { x: contact.x, y: contact.y });
    if (!first) return []; // Additional fingers never change an ongoing gesture.

    const armed = kind === 'hold' && this.holdMs() <= 0;
    this.gesture = { kind, startedAt: input.at, armed, swiped: false };
    if (kind === 'stop') return [{ type: 'stop', nativeAt: input.nativeAt }];
    if (kind === 'hold') return armed ? [{ type: 'holdStart' }, { type: 'armed' }] : [{ type: 'holdStart' }];
    return [];
  }

  move(input: PadInput): void {
    const gesture = this.gesture;
    if (!gesture || gesture.kind !== 'swipeTap') return; // Drift only matters where swipes are possible.
    for (const contact of input.changed) {
      const origin = this.fingers.get(contact.id);
      if (origin && Math.hypot(contact.x - origin.x, contact.y - origin.y) >= SWIPE_DISTANCE) gesture.swiped = true;
    }
  }

  /** Call every frame while holding; reports the moment the hold becomes armed. */
  tick(now: number): HoldPadEvent[] {
    const gesture = this.gesture;
    if (!gesture || gesture.kind !== 'hold' || gesture.armed || now - gesture.startedAt < this.holdMs()) return [];
    gesture.armed = true;
    return [{ type: 'armed' }];
  }

  release(input: PadInput): HoldPadEvent[] {
    this.move(input); // A lift-off position can also reveal a swipe.
    for (const contact of input.changed) this.fingers.delete(contact.id);
    if (input.remaining <= 0) this.fingers.clear();
    if (this.fingers.size > 0) return []; // Still touched: the gesture continues.
    return this.finish(input.at, input.nativeAt);
  }

  /** The OS took the touch away (system gesture, interruption). */
  cancel(at: number): HoldPadEvent[] {
    this.fingers.clear();
    const gesture = this.gesture;
    this.gesture = null;
    // Keep the promise that green always starts the solve.
    if (gesture?.kind === 'hold') return gesture.armed ? [{ type: 'start', nativeAt: null }] : [{ type: 'holdAbort' }];
    return [];
  }

  /** Forget the current gesture because the screen changed underneath it.
   * Fingers still down are ignored until they lift. */
  reset(): void {
    this.gesture = this.fingers.size > 0 ? { kind: 'ignore', startedAt: 0, armed: false, swiped: false } : null;
  }

  private finish(at: number, nativeAt: number | null): HoldPadEvent[] {
    const gesture = this.gesture;
    this.gesture = null;
    if (!gesture) return [];
    switch (gesture.kind) {
      case 'hold':
        return gesture.armed || at - gesture.startedAt >= this.holdMs()
          ? [{ type: 'start', nativeAt }]
          : [{ type: 'holdAbort' }];
      case 'tap': return [{ type: 'tap' }];
      case 'swipeTap': return gesture.swiped ? [] : [{ type: 'tap' }];
      default: return [];
    }
  }
}
