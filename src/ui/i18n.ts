import { useSyncExternalStore } from 'react';
import type { EventId } from '../core';
import { en, type MessageKey } from './locales/en';
import { es } from './locales/es';

export type Locale = 'en' | 'es';
export type { MessageKey };
let locale: Locale = 'en';
const listeners = new Set<() => void>();
const catalogs = { en, es };
export function setLocale(next: Locale) {
  if (locale === next) return;
  locale = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const listener of listeners) listener();
}
export function useLocale() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => locale, () => 'en' as Locale);
}
export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  return catalogs[locale][key].replace(/\{(\w+)\}/g, (token, name: string) => name in values ? String(values[name]) : token);
}
export const localizedDate = (date: string | number) => new Date(date).toLocaleString(locale);
const names: Record<Locale, Record<EventId, string>> = {
  en: { '222': '2×2 Cube', '333': '3×3 Cube', '444': '4×4 Cube', '555': '5×5 Cube', '666': '6×6 Cube', '777': '7×7 Cube', '333oh': '3×3 One-Handed', '333bf': '3×3 Blindfolded', '444bf': '4×4 Blindfolded', '555bf': '5×5 Blindfolded', minx: 'Megaminx', pyram: 'Pyraminx', skewb: 'Skewb', sq1: 'Square-1', fto: 'FTO', clock: 'Clock' },
  es: { '222': 'Cubo 2×2', '333': 'Cubo 3×3', '444': 'Cubo 4×4', '555': 'Cubo 5×5', '666': 'Cubo 6×6', '777': 'Cubo 7×7', '333oh': '3×3 a una mano', '333bf': '3×3 a ciegas', '444bf': '4×4 a ciegas', '555bf': '5×5 a ciegas', minx: 'Megaminx', pyram: 'Pyraminx', skewb: 'Skewb', sq1: 'Square-1', fto: 'FTO', clock: 'Clock' },
};
export const localizedEventName = (eventId: EventId) => names[locale][eventId];
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
