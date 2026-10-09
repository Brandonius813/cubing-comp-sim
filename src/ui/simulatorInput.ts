import type { InputMethod } from '../core';
import type { Settings } from '../storage';

export type SimulatorKeyAction = 'hold' | 'primary' | 'submit' | 'stop' | null;

/** Space and Enter stay available even when the user adds another shortcut. */
export function simulatorKeyAction(code: string, phase: string, inputMethod: InputMethod, canStart: boolean, shortcuts: Settings['shortcuts']): SimulatorKeyAction {
  if (phase === 'solving') return 'stop';
  if (code === 'Space' && canStart) return 'hold';
  const builtIn = code === 'Space' || code === 'Enter' || code === 'NumpadEnter';
  if (phase === 'entry' || phase === 'confirm') return builtIn || code === shortcuts.submit ? 'submit' : null;
  if ((builtIn || code === shortcuts.advance)
    && (['home', 'complete', 'scramble', 'ready', 'engine-error'].includes(phase)
      || (phase === 'inspection' && inputMethod === 'manual'))) return 'primary';
  return null;
}

/** Pick a whole-second wait once per solve. Fixed waits do not consume randomness. */
export function sampleWaitMs(settings: Pick<Settings, 'waitEnabled' | 'waitMode' | 'waitSeconds' | 'waitMinSeconds' | 'waitMaxSeconds'>, random: () => number = Math.random): number {
  if (!settings.waitEnabled) return 0;
  if (settings.waitMode === 'fixed') return settings.waitSeconds * 1000;
  const { waitMinSeconds: min, waitMaxSeconds: max } = settings;
  if (min === max) return min * 1000;
  const sample = Math.min(1 - Number.EPSILON, Math.max(0, random()));
  return (min + Math.floor(sample * (max - min + 1))) * 1000;
}
