export interface TouchPoint { x: number; y: number; at: number }
const validPoint = (point: TouchPoint) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.at) && point.at >= 0;

/** A timer gesture is stationary, single-touch, and must end normally.
 * Native cancellation and a drag are never interpreted as a timer release. */
export class TimerTouch {
  private start: TouchPoint | null = null;
  begin(point: TouchPoint, touches = 1): void { this.start = touches === 1 && validPoint(point) ? point : null; }
  move(point: TouchPoint, touches = 1): boolean {
    if (!this.start) return false;
    if (!validPoint(point) || point.at < this.start.at || touches !== 1 || Math.hypot(point.x - this.start.x, point.y - this.start.y) >= 12) this.cancel();
    return this.start !== null;
  }
  end(point: TouchPoint): number | null {
    if (!this.move(point)) return null;
    const duration = Math.max(0, point.at - this.start!.at);
    this.cancel();
    return duration;
  }
  cancel(): void { this.start = null; }
}

/** The moment the finger actually touched or left the glass, in milliseconds,
 * taken from the native touch event. Unlike performance.now() in a JS handler,
 * this does not include any delay before JavaScript got to handle the touch. */
export function nativeTouchTime(event: { nativeEvent?: { timestamp?: unknown } }): number | null {
  const value = event.nativeEvent?.timestamp;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Largest disagreement tolerated between native touch timing and the JS clock.
 * Beyond this the native timestamps are assumed to be unusable (for example a
 * different clock base) and the JS measurement is kept. */
export const NATIVE_TIMING_TOLERANCE_MS = 1_000;

/** Solve duration from the native start (release) and stop (touch-down) times,
 * falling back to the JS-clock measurement when either is missing or implausible. */
export function solveDuration(nativeStart: number | null, nativeStop: number | null, fallbackMs: number): number {
  if (nativeStart === null || nativeStop === null) return fallbackMs;
  const native = nativeStop - nativeStart;
  if (!Number.isFinite(native) || native < 0 || Math.abs(native - fallbackMs) > NATIVE_TIMING_TOLERANCE_MS) return fallbackMs;
  return native;
}
