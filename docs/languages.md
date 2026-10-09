# Interface languages and inspection speech

The web app offers 16 languages with draft catalogs for the base interface, all 16 event names, and the two inspection phrases. New feedback settings and workflow labels currently use an English fallback; Help and Statistics also contain English text awaiting translation. The full interface is not yet translated into every offered language.

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

Language is a validated device setting stored with the local app state. Cloud saves remain portable solve history; importing history does not change the device language. Dates use the selected locale. Event names and base messages use the selected catalog, with the English exceptions noted above. Scramble notation, puzzle moves, numeric scoring, and portable integer millisecond values stay unchanged.

Manual entry accepts decimal commas and full-width digits, punctuation, and minute separators. The domain parser still rejects malformed input. This does not add grouping separators to solve times.

## Translation quality

These are implementation drafts, not native-speaker certifications. Before release, ask fluent cubers to review terminology, penalties, destructive actions, password-reset instructions, and inspection phrases. Japanese, Mandarin, Korean, and long European labels also need visual review on actual devices. Current locales use left-to-right layout. Add right-to-left layout and testing before offering Arabic or Hebrew.

Add a language by extending `src/locales.ts`, adding a typed message/event/inspection catalog, and registering it in `src/ui/i18n.ts`. Catalog tests verify base message keys, placeholder parity, event coverage, valid settings, and nonempty inspection phrases. These tests do not establish translation quality or complete coverage of newer screens. The English supplements in `src/ui/locales/feedback-en.ts` and `src/ui/locales/workflow-en.ts`, along with English Help and Statistics text, remain translation work. Review those additions before describing a locale as fully translated.

## Inspection voice status

Every locale has draft 8-second and 12-second text. Inspection uses matching installed local device voices only, with no beep mode or fallback. The Audio tab offers voice language, volume, and a Test voice button. Voice language follows the interface by default; a separately selected language stays independent. Availability varies by browser and OS. If a matching local voice is missing, callouts remain silent and Audio settings explains how to enable them by installing a device voice. Timing and penalties are unaffected.

A consistent offline recorded voice pack for every language is still a release asset task. See [audio-assets.md](audio-assets.md). Do not market installed device speech as a shipped recording pack.
