import { extendedEn } from './locales/extended-en';
import { afterEach, describe, expect, it } from 'vitest';
import { EVENTS, parseTimeInput } from '../core';
import { LOCALES, isLocale } from '../locales';
import { DEFAULT_SETTINGS, validateSettings, type Settings } from '../storage/settings';
import { extendedCatalogs, errorKey, callbackErrorKey, catalogs, inspectionPhrase, localizedEventName, normalizeTimeInput, setLocale, t } from './i18n';
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
  it('accepts digit-only entry from full-width keyboards', () => {
    expect(parseTimeInput(normalizeTimeInput('１０３２１'))).toEqual({ rawMs: 63210, penalty: 'none' });
    expect(parseTimeInput(normalizeTimeInput('３２７'))).toEqual({ rawMs: 3270, penalty: 'none' });
  });
  it('does not treat thousands separators or malformed times as valid', () => {
    for (const input of ['1,234,567', '12,.34', '1:99,00']) expect(parseTimeInput(normalizeTimeInput(input))).toBeNull();
  });
});

describe('new controls and transient messages', () => {
  for (const { id } of LOCALES) {
    it(`${id} covers all newer messages without English fallback`, () => {
      const catalog = extendedCatalogs[id];
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(extendedEn).sort());
      setLocale(id);
      for (const key of Object.keys(extendedEn) as Array<keyof typeof extendedEn>) {
        expect(catalog[key].trim()).not.toBe('');
        expect(placeholders(catalog[key])).toEqual(placeholders(extendedEn[key]));
        expect(t(key, { min: '00:00', max: '05:00', value: 7, action: 'test' })).not.toMatch(/ZXQ|QXZ|\{\w+\}/);
      }
      if (id !== 'en') for (const key of ['endRound', 'helpDescription', 'continueGoogle', 'inspectionPenaltyLabel'] as const) expect(catalog[key]).not.toBe(extendedEn[key]);
    });
  }
  it('retains a language-independent error key and translates on render', () => {
    setLocale('en');
    const key = errorKey({ code: 'identity_conflict' });
    const before = t(key);
    setLocale('es');
    expect(t(key)).toBe(extendedCatalogs.es.accountIdentityConflict);
    expect(t(key)).not.toBe(before);
    expect(callbackErrorKey('expired')).toBe('accountCallbackExpired');
  });
});
