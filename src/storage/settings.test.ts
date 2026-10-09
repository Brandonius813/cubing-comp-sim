import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, validateSettings, type Settings } from './settings';

const legacy = {
  eventId: '333', inputMethod: 'timer', inspection: true, waitSeconds: 0, holdMs: 300,
  goalMs: 12_000, audioCallouts: false, ambience: false, showScorecard: false, language: 'ja',
};
const read = (value: unknown) => validateSettings(value as Settings);

describe('settings migration and persistence', () => {
  it('opens the old device format while preserving chosen settings', () => {
    const migrated = read(legacy);
    expect(migrated).toMatchObject(legacy);
    expect(migrated).toMatchObject({ waitEnabled: false, waitMode: 'fixed', waitMinSeconds: 15, waitMaxSeconds: 45, theme: 'dark', textFont: 'geist', numberFont: 'geist-mono', shortcuts: { advance: 'Enter', submit: 'Enter' } });
    expect(read({ ...legacy, waitSeconds: 25 })).toMatchObject({ waitEnabled: true, waitSeconds: 25 });
  });
  it('keeps the new default hold separate from existing saved choices', () => {
    expect(DEFAULT_SETTINGS.holdMs).toBe(550);
    expect(read(legacy).holdMs).toBe(300);
  });
  it('round-trips custom fonts, theme, keybindings and disabled random waits', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, waitEnabled: false, waitMode: 'random', waitMinSeconds: 7, waitMaxSeconds: 9, theme: 'system', numberFont: 'arial', textFont: 'georgia', shortcuts: { advance: 'KeyN', submit: 'ArrowRight' } };
    expect(read(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
    expect(read({ ...settings, waitEnabled: true })).toMatchObject({ waitEnabled: true, waitMinSeconds: 7, waitMaxSeconds: 9 });
  });
  it('allows a single duration range including zero but rejects reversed or invalid endpoints', () => {
    expect(read({ ...DEFAULT_SETTINGS, waitMinSeconds: 0, waitMaxSeconds: 0 }).waitMaxSeconds).toBe(0);
    for (const patch of [
      { waitMinSeconds: 46, waitMaxSeconds: 45 }, { waitMinSeconds: -1 }, { waitMinSeconds: 1.5 },
      { waitMaxSeconds: 601 }, { waitMaxSeconds: Infinity }, { waitMinSeconds: null },
      { waitMode: 'sometimes' }, { waitMode: null }, { waitEnabled: 1 },
    ]) expect(() => read({ ...DEFAULT_SETTINGS, ...patch })).toThrow('Invalid settings');
  });
  it('rejects malformed appearance and shortcut values rather than resetting them', () => {
    for (const patch of [
      { theme: 'blue' }, { theme: null }, { textFont: 'url(https://example.com/font)' }, { numberFont: '' },
      { shortcuts: null }, { shortcuts: {} }, { shortcuts: { advance: 'Meta', submit: 'Enter' } },
      { shortcuts: { advance: 'Escape', submit: 'Enter' } }, { shortcuts: { advance: 'KeyN', submit: 'Ctrl+S' } },
    ]) expect(() => read({ ...DEFAULT_SETTINGS, ...patch })).toThrow('Invalid settings');
  });
  it('returns independent shortcut objects and strips unexpected saved fields', () => {
    const migrated = read({ ...legacy, unexpected: 'not copied' });
    migrated.shortcuts.advance = 'KeyN';
    expect(DEFAULT_SETTINGS.shortcuts.advance).toBe('Enter');
    expect(read(legacy).shortcuts.advance).toBe('Enter');
    expect(migrated).not.toHaveProperty('unexpected');
  });
});
