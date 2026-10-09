# Interface languages and inspection speech

The web app now has 16 complete draft catalogs, each covering 202 interface strings, all 16 event names, and the two inspection phrases.

| Locale | Language | Device speech tag |
|---|---|---|
| en | English | en-US |
| es | Español | es-ES |
| fr | Français | fr-FR |
| de | Deutsch | de-DE |
| pl | Polski | pl-PL |
| it | Italiano | it-IT |
| pt-BR | Português (Brasil) | pt-BR |
| nl | Nederlands | nl-NL |
| ru | Русский | ru-RU |
| uk | Українська | uk-UA |
| tr | Türkçe | tr-TR |
| ja | 日本語 | ja-JP |
| zh-Hans | 简体中文 | zh-CN |
| zh-Hant | 繁體中文 | zh-TW |
| ko | 한국어 | ko-KR |
| id | Bahasa Indonesia | id-ID |

Simplified and Traditional Chinese are separate written interfaces; both request Mandarin speech. They are not separate promises about every Chinese spoken language.

## Scope and persistence

Language is a validated device setting stored with the local app state. Cloud saves remain portable solve history; importing history does not change the device language. Dates use the selected locale. Event names and messages are translated; scramble notation, puzzle moves, numeric scoring, and portable integer millisecond values stay unchanged.

Manual entry accepts decimal commas and full-width digits, punctuation, and minute separators. The domain parser still rejects malformed input. This does not add grouping separators to solve times.

## Translation quality

These are implementation drafts, not native-speaker certifications. Before release, ask fluent cubers to review terminology, penalties, destructive actions, password-reset instructions, and inspection phrases. Japanese, Mandarin, Korean, and long European labels also need visual review on actual devices. Current locales use left-to-right layout. Add right-to-left layout and testing before offering Arabic or Hebrew.

Add a language by extending `src/locales.ts`, adding a typed message/event/inspection catalog, and registering it in `src/ui/i18n.ts`. Catalog tests verify exact message keys, placeholder parity, event coverage, valid settings, and nonempty inspection phrases. A missing translation must fail review rather than silently shipping an English fallback.

## Inspection voice status

Every locale has 8-second and 12-second text. The Audio tab offers matching installed local device voices, independent voice language, volume, and a preview. Availability varies by browser and OS; missing voices use beeps with a visible explanation. Beeps remain the default.

A consistent offline recorded voice pack for every language is still a release asset task. See [audio-assets.md](audio-assets.md). Do not market installed device speech as a shipped recording pack.
