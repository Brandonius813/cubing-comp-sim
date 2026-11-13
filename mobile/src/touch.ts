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
