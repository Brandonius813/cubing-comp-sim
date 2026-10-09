import { useSyncExternalStore } from 'react';
import type { EventId } from '../core';
import { isLocale, type Locale } from '../locales';
import type { MessageKey } from './locales/en';
import { en, enEvents, enInspection } from './locales/en';
import { es, esEvents, esInspection } from './locales/es';
import { fr, frEvents, frInspection } from './locales/fr';
import { de, deEvents, deInspection } from './locales/de';
import { pl, plEvents, plInspection } from './locales/pl';
import { it, itEvents, itInspection } from './locales/it';
import { ptBR, ptBREvents, ptBRInspection } from './locales/pt-BR';
import { nl, nlEvents, nlInspection } from './locales/nl';
import { ru, ruEvents, ruInspection } from './locales/ru';
import { uk, ukEvents, ukInspection } from './locales/uk';
import { tr, trEvents, trInspection } from './locales/tr';
import { ja, jaEvents, jaInspection } from './locales/ja';
import { zhHans, zhHansEvents, zhHansInspection } from './locales/zh-Hans';
import { zhHant, zhHantEvents, zhHantInspection } from './locales/zh-Hant';
import { ko, koEvents, koInspection } from './locales/ko';
import { id, idEvents, idInspection } from './locales/id';

export type { Locale, MessageKey };
let locale: Locale = 'en';
const listeners = new Set<() => void>();
export const catalogs: Record<Locale, Record<MessageKey, string>> = {
  'en': en,
  'es': es,
  'fr': fr,
  'de': de,
  'pl': pl,
  'it': it,
  'pt-BR': ptBR,
  'nl': nl,
  'ru': ru,
  'uk': uk,
  'tr': tr,
  'ja': ja,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  'ko': ko,
  'id': id
};
const names: Record<Locale, Record<EventId, string>> = {
  'en': enEvents,
  'es': esEvents,
  'fr': frEvents,
  'de': deEvents,
  'pl': plEvents,
  'it': itEvents,
  'pt-BR': ptBREvents,
  'nl': nlEvents,
  'ru': ruEvents,
  'uk': ukEvents,
  'tr': trEvents,
  'ja': jaEvents,
  'zh-Hans': zhHansEvents,
  'zh-Hant': zhHantEvents,
  'ko': koEvents,
  'id': idEvents
};
const phrases: Record<Locale, { eight: string; twelve: string }> = {
  'en': enInspection,
  'es': esInspection,
  'fr': frInspection,
  'de': deInspection,
  'pl': plInspection,
  'it': itInspection,
  'pt-BR': ptBRInspection,
  'nl': nlInspection,
  'ru': ruInspection,
  'uk': ukInspection,
  'tr': trInspection,
  'ja': jaInspection,
  'zh-Hans': zhHansInspection,
  'zh-Hant': zhHantInspection,
  'ko': koInspection,
  'id': idInspection
};
export function setLocale(next: Locale) {
  if (!isLocale(next)) return;
  if (typeof document !== 'undefined') { document.documentElement.lang = next; document.documentElement.dir = 'ltr'; }
  if (locale === next) return;
  locale = next;
  for (const listener of listeners) listener();
}
export function useLocale() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => locale, () => 'en' as Locale);
}
export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  return catalogs[locale][key].replace(/\{(\w+)\}/g, (token, name: string) => name in values ? String(values[name]) : token);
}
export const localizedDate = (date: string | number) => new Date(date).toLocaleString(locale);
export const localizedEventName = (eventId: EventId) => names[locale][eventId];
export const inspectionPhrase = (language: Locale, seconds: 8 | 12) => phrases[language][seconds === 8 ? 'eight' : 'twelve'];
/** Accept decimal commas and full-width keyboard characters without changing stored time units. */
export const normalizeTimeInput = (input: string) => input.normalize('NFKC').replace(/,/g, '.');
const errorKeys: Record<string, MessageKey> = {
  not_configured: 'cloudNotConfigured', offline: 'cloudOffline', auth_required: 'cloudAuthRequired',
  email_unverified: 'cloudEmailUnverified', conflict: 'cloudConflict', no_save: 'cloudNoSave',
  invalid_save: 'cloudInvalid', too_large: 'cloudTooLarge', rate_limited: 'cloudRateLimited',
  auth_error: 'cloudAuthError', network_error: 'cloudNetworkError', server_error: 'cloudServerError',
  reauthentication_required: 'cloudReauth', reauth_required: 'cloudReauth',
  account_deleting: 'cloudAccountDeleting', deletion_not_configured: 'cloudDeletionUnavailable',
};
export function errorMessage(cause: unknown, fallback: MessageKey = 'requestError') {
  if (cause && typeof cause === 'object') {
    if ('name' in cause && cause.name === 'StorageConflictError') return t('storageConflict');
    if ('code' in cause && typeof cause.code === 'string' && errorKeys[cause.code]) return t(errorKeys[cause.code]);
  }
  return t(fallback);
}
