import { afterEach, describe, expect, it } from 'vitest';
import { EVENTS, parseTimeInput } from '../core';
import { LOCALES, isLocale } from '../locales';
import { DEFAULT_SETTINGS, validateSettings, type Settings } from '../storage/settings';
import { catalogs, inspectionPhrase, localizedEventName, normalizeTimeInput, setLocale, t } from './i18n';
import { en, type MessageKey } from './locales/en';

afterEach(() => setLocale('en'));
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
describe('complete language catalogs', () => {
  for (const { id } of LOCALES) {
    it(`${id} covers every message, placeholder, event and inspection callout`, () => {
      const catalog = catalogs[id];
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort());
      setLocale(id);
      for (const key of Object.keys(en) as MessageKey[]) {
        expect(catalog[key].trim().length).toBeGreaterThan(0);
        expect(placeholders(catalog[key])).toEqual(placeholders(en[key]));
      }
      for (const event of EVENTS) expect(localizedEventName(event.id).trim().length).toBeGreaterThan(0);
      expect(inspectionPhrase(id, 8).trim().length).toBeGreaterThan(0);
      expect(inspectionPhrase(id, 12)).not.toBe(inspectionPhrase(id, 8));
      expect(validateSettings({ ...DEFAULT_SETTINGS, language: id }).language).toBe(id);
    });
  }
  it('rejects unknown saved language codes instead of silently clearing settings', () => {
    expect(isLocale('unknown')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, language: 'unknown' } as unknown as Settings)).toThrow();
    setLocale('unknown' as Settings['language']);
    expect(t('settings')).toBe('Settings');
  });
});
describe('localized time input preserves integer millisecond scoring', () => {
  for (const input of ['12.345', '12,345', '１２．３４５', '１２，３４５']) {
    it(`accepts ${input}`, () => expect(parseTimeInput(normalizeTimeInput(input))).toEqual({ rawMs: 12345, penalty: 'none' }));
  }
  it('accepts full-width minute separators and preserves penalties', () => {
    expect(parseTimeInput(normalizeTimeInput('１：０２，３４＋２'))).toEqual({ rawMs: 62340, penalty: '+2' });
  });
  it('does not treat thousands separators or malformed times as valid', () => {
    for (const input of ['1,234,567', '12,.34', '1:99,00']) expect(parseTimeInput(normalizeTimeInput(input))).toBeNull();
  });
});
