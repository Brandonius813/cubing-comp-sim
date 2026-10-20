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
