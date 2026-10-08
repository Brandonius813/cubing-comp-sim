import type { Attempt, ParsedTime, Penalty } from './types';

export const TEN_MINUTES_MS = 600_000;
export const MAX_TIME_MS = 86_399_999;

export function isValidTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIME_MS;
}

/** WCA A4d1/A4d2: exact 15.00 is +2, exact 17.00 is DNF. */
export function inspectionPenalty(elapsedMs: number): Penalty {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Invalid inspection time.');
  if (elapsedMs >= 17_000) return 'DNF';
  if (elapsedMs >= 15_000) return '+2';
  return 'none';
}

/** WCA 9f1/9f2: truncate singles; round means separately in scoring.ts. */
export function recordedTimeMs(rawMs: number, penalty: Penalty = 'none'): number | null {
  if (!isValidTime(rawMs)) throw new Error('Invalid solve time.');
  if (penalty === 'DNF' || penalty === 'DNS') return null;
  const total = rawMs + (penalty === '+2' ? 2_000 : 0);
  const unit = total >= TEN_MINUTES_MS ? 1_000 : 10;
  return Math.floor(total / unit) * unit;
}

export function attemptTimeMs(attempt: Pick<Attempt, 'rawMs' | 'penalty'>): number | null {
  if (attempt.rawMs === null) return null;
  return recordedTimeMs(attempt.rawMs, attempt.penalty);
}

/** Seconds, m:ss, or h:mm:ss, with an optional decimal fraction of up to 3 digits. */
export function parseTimeInput(input: string): ParsedTime | null {
  let text = input.trim().toUpperCase();
  if (text === 'DNF' || text === 'DNS') return { rawMs: null, penalty: text };
  let penalty: Penalty = 'none';
  if (/\s*\+2$/.test(text)) {
    penalty = '+2';
    text = text.replace(/\s*\+2$/, '').trim();
  }
  const dnf = /^DNF\((.+)\)$/.exec(text);
  if (dnf) {
    if (penalty !== 'none') return null;
    penalty = 'DNF';
    text = dnf[1];
  }
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(text)) return null;
  const pieces = text.split(':');
  const hasHours = pieces.length === 3;
  const secondsText = pieces.pop()!;
  const [secondsWhole, fraction = ''] = secondsText.split('.');
  const seconds = Number(secondsWhole);
  if (pieces.length > 0 && seconds >= 60) return null;
  const minutes = pieces.length > 0 ? Number(pieces.pop()) : 0;
  const hours = pieces.length > 0 ? Number(pieces.pop()) : 0;
  if (hasHours && minutes >= 60) return null;
  const rawMs = ((hours * 60 + minutes) * 60 + seconds) * 1_000 + Number(fraction.padEnd(3, '0'));
  return isValidTime(rawMs) ? { rawMs, penalty } : null;
}

export function formatTime(ms: number | null, options: { precision?: 'hundredths' | 'milliseconds' } = {}): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  const value = Math.max(0, Math.floor(ms));
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor(value / 60_000) % 60;
  const seconds = Math.floor(value / 1_000) % 60;
  let whole: string;
  if (hours > 0) whole = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  else if (value >= 60_000) whole = `${minutes}:${String(seconds).padStart(2, '0')}`;
  else whole = String(seconds);
  if (options.precision === 'milliseconds') return `${whole}.${String(value % 1_000).padStart(3, '0')}`;
  if (value >= TEN_MINUTES_MS) return whole;
  return `${whole}.${String(Math.floor(value % 1_000 / 10)).padStart(2, '0')}`;
}

export function formatAttempt(attempt: Pick<Attempt, 'rawMs' | 'penalty'>): string {
  if (attempt.penalty === 'DNF' || attempt.penalty === 'DNS') return attempt.penalty;
  return `${formatTime(attemptTimeMs(attempt))}${attempt.penalty === '+2' ? '+' : ''}`;
}
