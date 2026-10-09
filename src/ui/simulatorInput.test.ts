import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../storage';
import { sampleWaitMs, simulatorKeyAction } from './simulatorInput';

const shortcuts = { advance: 'KeyA', submit: 'KeyC' };
describe('competition keyboard controls', () => {
  it.each(['Space', 'Enter', 'NumpadEnter'])('%s advances every non-timing stage despite custom shortcuts', code => {
    for (const phase of ['home', 'scramble', 'ready', 'complete', 'engine-error']) {
      expect(simulatorKeyAction(code, phase, 'manual', false, shortcuts)).toBe('primary');
    }
    expect(simulatorKeyAction(code, 'inspection', 'manual', false, shortcuts)).toBe('primary');
    for (const phase of ['entry', 'confirm']) expect(simulatorKeyAction(code, phase, 'manual', false, shortcuts)).toBe('submit');
  });
  it('keeps timed solve start on Space and permits any key to stop', () => {
    expect(simulatorKeyAction('Space', 'inspection', 'timer', true, shortcuts)).toBe('hold');
    expect(simulatorKeyAction('Enter', 'inspection', 'timer', true, shortcuts)).toBeNull();
    expect(simulatorKeyAction('KeyA', 'inspection', 'timer', true, shortcuts)).toBeNull();
    for (const code of ['Space', 'Enter', 'KeyQ', 'ShiftLeft']) expect(simulatorKeyAction(code, 'solving', 'timer', false, shortcuts)).toBe('stop');
  });
  it('supports additional advance and submit keys but never skips waits or loading', () => {
    expect(simulatorKeyAction('KeyA', 'scramble', 'timer', false, shortcuts)).toBe('primary');
    expect(simulatorKeyAction('KeyC', 'confirm', 'timer', false, shortcuts)).toBe('submit');
    expect(simulatorKeyAction('KeyA', 'confirm', 'timer', false, shortcuts)).toBeNull();
    for (const phase of ['waiting', 'loading']) {
      for (const code of ['Space', 'Enter', 'KeyA', 'KeyC']) expect(simulatorKeyAction(code, phase, 'timer', false, shortcuts)).toBeNull();
    }
  });
});

describe('per-solve wait selection', () => {
  it('does not draw randomness for disabled or fixed waits', () => {
    const random = vi.fn(() => 0.5);
    expect(sampleWaitMs({ ...DEFAULT_SETTINGS, waitEnabled: false, waitMode: 'random' }, random)).toBe(0);
    expect(sampleWaitMs({ ...DEFAULT_SETTINGS, waitEnabled: true, waitMode: 'fixed', waitSeconds: 20 }, random)).toBe(20_000);
    expect(random).not.toHaveBeenCalled();
  });
  it('includes both endpoints and produces only whole seconds', () => {
    const settings = { ...DEFAULT_SETTINGS, waitEnabled: true, waitMode: 'random' as const, waitMinSeconds: 10, waitMaxSeconds: 15 };
    expect(sampleWaitMs(settings, () => 0)).toBe(10_000);
    expect(sampleWaitMs(settings, () => 0.5)).toBe(13_000);
    expect(sampleWaitMs(settings, () => 0.99999)).toBe(15_000);
    expect(sampleWaitMs(settings, () => 1)).toBe(15_000);
    expect(sampleWaitMs({ ...settings, waitMinSeconds: 15 }, () => 0.6)).toBe(15_000);
  });
});
