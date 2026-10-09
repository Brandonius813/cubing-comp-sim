import { describe, expect, it } from 'vitest';
import { resolveTheme } from './appearance';

describe('theme preference', () => {
  it('follows system changes only for the system option', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
