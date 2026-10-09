/** Stable locale identifiers are shared by settings, text, and audio. */
export const LOCALES = [
  {
    "id": "en",
    "nativeName": "English",
    "speechTag": "en-US"
  },
  {
    "id": "es",
    "nativeName": "Español",
    "speechTag": "es-ES"
  },
  {
    "id": "fr",
    "nativeName": "Français",
    "speechTag": "fr-FR"
  },
  {
    "id": "de",
    "nativeName": "Deutsch",
    "speechTag": "de-DE"
  },
  {
    "id": "pl",
    "nativeName": "Polski",
    "speechTag": "pl-PL"
  },
  {
    "id": "it",
    "nativeName": "Italiano",
    "speechTag": "it-IT"
  },
  {
    "id": "pt-BR",
    "nativeName": "Português (Brasil)",
    "speechTag": "pt-BR"
  },
  {
    "id": "nl",
    "nativeName": "Nederlands",
    "speechTag": "nl-NL"
  },
  {
    "id": "ru",
    "nativeName": "Русский",
    "speechTag": "ru-RU"
  },
  {
    "id": "uk",
    "nativeName": "Українська",
    "speechTag": "uk-UA"
  },
  {
    "id": "tr",
    "nativeName": "Türkçe",
    "speechTag": "tr-TR"
  },
  {
    "id": "ja",
    "nativeName": "日本語",
    "speechTag": "ja-JP"
  },
  {
    "id": "zh-Hans",
    "nativeName": "简体中文",
    "speechTag": "zh-CN"
  },
  {
    "id": "zh-Hant",
    "nativeName": "繁體中文",
    "speechTag": "zh-TW"
  },
  {
    "id": "ko",
    "nativeName": "한국어",
    "speechTag": "ko-KR"
  },
  {
    "id": "id",
    "nativeName": "Bahasa Indonesia",
    "speechTag": "id-ID"
  }
] as const;
export type Locale = typeof LOCALES[number]['id'];
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALES.some(locale => locale.id === value);
}
