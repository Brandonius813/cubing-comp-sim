# Recorded inspection voices

The app bundles 128 ElevenLabs recordings: four speakers for each of its 16 locales, with separate eight-second and twelve-second warnings. Settings → Simulation offers Male 1, Male 2, Female 1 and Female 2. Every language defaults to Male 1; the device remembers a different choice for each voice language. Voice language can follow the interface or be selected independently. Volume and Test voice remain alongside the inspection switch.

The owner approved the English audition speakers: Chris (Male 1), Mellow Mike (Male 2), Jessica (Female 1) and Laura (Female 2). Other locales use voices selected from the connected ElevenLabs library for that language. Simplified Chinese uses mainland Mandarin speakers; Traditional Chinese uses Taiwanese Mandarin speakers. Brazilian Portuguese uses Brazilian speakers. The public `public/audio/inspection/v1/manifest.json` records every actual speaker, provider voice ID, generation ID, spoken phrase, duration, processing measurement and asset checksum.

## Playback and offline behavior

The initiating inspection gesture unlocks Web Audio and preloads/decodes both selected recordings. The existing monotonic inspection clock requests each warning once at eight and twelve seconds. Starting a solve, leaving inspection, losing focus or unmounting cancels pending/current playback. A recording that becomes available more than 500 ms after its requested threshold is dropped. Audio cannot change timing or penalties. There is no device-speech or beep fallback.

The app's existing service worker includes all 128 recordings in its coherent release cache. After offline preparation completes, users can change voice and language and play any recording without a connection. There are no runtime ElevenLabs requests, API keys, per-play charges or device voice installations. A first visit still needs the files to download. Test voice reports a playback failure without affecting the timer.

The version-1 audio preference key remains unchanged. Old records retain language and volume and gain the Male 1 default. Reset defaults clears all per-language choices. Legacy background fields remain validated for compatibility but have no app controls or playback integration.

## Generation and provenance

Generated on October 14, 2026 with Eleven v4, one take per warning, using the matter-of-fact delivery tag and an explicit language code. Numbers were spelled out in the generation prompts to reduce ambiguity in these very short phrases. The owner confirmed an active Starter plan before generation. ElevenLabs documents commercial use rights for content generated on paid plans; retain those terms with release records. Voices were selected from the provider's available voice library, not cloned from supplied recordings.

The source generations remain in the owner's ElevenLabs workspace. Do not commit signed download URLs, account-switch links, credentials or provider session tokens. The checked-in metadata contains only identifiers and public speaker descriptions/names needed for provenance. Audio assets retain their applicable provider-generated-output rights; this document does not separately relicense the underlying speakers' voices or voice models.

`scripts/process-inspection-recordings.py` trims silence with a 20 ms leading and 80 ms trailing margin, targets -20 dBFS RMS with a -2 dBFS peak ceiling, and encodes mono 44.1 kHz MP3 at 128 kbps. It preserves source/output SHA-256 hashes and processing measurements. Never replace bytes in the immutable `v1` paths; ship a new pack version for new recordings.

`scripts/assert-inspection-pack.mjs` blocks a production build if a required clip, provenance record, size, duration or checksum is wrong. Browser acceptance decodes all 128 real recordings with networking disabled, exercises each preview, and measures the actual eight/twelve-second playback requests and interruption when solving begins. Unit tests cover preference migration, per-language defaults, mute, unavailable audio, stale loads and cancellation.

Automated decoding and timing checks do not certify pronunciation or a native speaker's assessment of every take. Native-language listening remains useful for future refinements. No claim of fluent-cuber review is made for the draft translation catalogs.

References:

- [ElevenLabs billing and generated-content rights](https://elevenlabs.io/docs/overview/administration/billing)
- [ElevenLabs terms](https://elevenlabs.io/terms-of-use)
- [ElevenLabs model documentation](https://elevenlabs.io/docs/overview/models)
- [WCA Regulations](https://www.worldcubeassociation.org/regulations/), A3b3 and A3b4
