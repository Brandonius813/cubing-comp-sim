# Inspection voices and competition ambience

## Implemented now

The interface offers beeps or a **device voice preview**. Beeps remain the default. Voice language can follow the interface or be selected separately across the 16 app locales. The 8-second and 12-second phrases come from the translation catalogs.

Device mode selects only a matching voice that the browser marks `localService: true`. Missing voices fall back to beeps and Settings explains that fallback. Mandarin selections use explicit mainland or Taiwanese Mandarin tags; Cantonese, ambiguous `zh`, unrelated languages, and remote speech services are not fallback choices. Voice availability differs by operating system and browser. This does not claim a bundled, consistent voice pack for every language.

The timer uses its existing monotonic clock. Audio never supplies elapsed time or penalties. Each threshold is consumed once; a resumed tab cannot replay missed callouts in a burst. Speech is cancelled when inspection ends, a solve starts, the window loses focus, or the simulator unmounts. A queued utterance that has not started within 500 ms is cancelled rather than saying a stale warning. Browser speech still cannot promise sample-accurate output. The next release-quality step is the recorded pack below.

Audio preferences use a versioned, validated, device-local record separate from solve history. Storage failure leaves the current controls usable and shows a save error. Changing interface language does not reset a separately selected voice language.

## Recorded inspection pack still needed

No licensed or generated recordings have been supplied. Do not present device synthesis as if these files exist.

For each of the 16 locales:

1. Have a fluent cuber review the localized 8-second and 12-second phrases.
2. Record an authorized speaker, or use a speech provider whose terms allow distributing generated audio in web and native apps.
3. Trim leading silence, normalize consistently, and verify the clips are short and clear over background sound.
4. Keep speaker permission, provider terms, source files, edit notes, and an asset hash with the release records. Add required attribution.
5. Bundle the small reviewed clips with the app and offline web cache. No runtime speech API, internet request, or paid per-call synthesis should be required.
6. Test actual onset, interruption, volume, and intelligibility on Chromium, Firefox, Safari, and later native devices. Preserve beeps when a file fails.

## Long ambience transport

`public/audio/catalog.json` is deliberately an empty version-1 catalog. There are no invented recordings or broken placeholder URLs in the selectable list. The settings panel says that tracks are unavailable.

The implemented player uses a normal HTML audio element with `preload="none"` and `loop=true`. Only an explicit Play click fetches a selected recording. Volume and selection persist; playback never starts automatically after a page reload. It can continue when Settings closes. Pause, a changed selection, or page exit stops it. The player shows a localized error when a media request or browser playback permission fails.

A network hint changing to offline does not cut off audio that is already buffered and working. A new stream cannot start while the browser reports offline. Existing buffered playback may continue, but **streamed ambience has no full offline guarantee**. Reconnection never starts audio automatically. Offline scrambling and inspection beeps remain independent.

Background files under `/audio/background/` are excluded from the app's offline precache. Remote public HTTPS files can live on an audio CDN or a public object-storage hostname. The small catalog can be bundled. Private cloud-save buckets and authentication tokens must never be used for these public recordings. A future native app may offer an explicit download with a visible file size, checksum, and Remove Download control, allowing ambience offline after downloading.

## Asset plan

Start with three distinct **5–10 minute** recordings:

- Small local competition: quiet room conversation and scattered turning.
- Medium competition hall: steady room noise and several nearby solves.
- Large competition hall: fuller crowd sound without overwhelming the inspection voice.

These are production targets, not tracks already shipped. Use Brandon's own consented recordings, a commissioned recording, or a source with explicit redistribution and editing rights. Do not copy videos or streaming music. Check for intelligible private conversations and copyrighted music before release.

Edit each into a long seamless loop, with a crossfade baked into the file. Review the seam over several repeat cycles. Use consistent conservative loudness, avoid startling transients, and test inspection intelligibility at the default 25% ambience volume. HTML `loop` does not itself guarantee a perceptually seamless file or identical gap behavior across codecs/browsers. Audition the final encoded files on the target browsers before calling them seamless.

Serve an efficient MP3/AAC file with the correct content type, range-request support, public caching, and a versioned filename. A 10-minute file at 128 kbit/s is approximately 9.6 MB. Start fetching only on Play; do not download these files on an ordinary app visit. Confirm actual file sizes and performance when assets are chosen.

## Catalog contract

```json
{
  "version": 1,
  "tracks": [
    {
      "id": "local-competition-v1",
      "title": "Local competition",
      "url": "/audio/background/local-competition-v1.mp3",
      "durationSeconds": 600,
      "attribution": "Recording owner and attribution required by the license",
      "sourceUrl": "https://example.org/recording-source",
      "license": "Exact license or documented permission",
      "licenseUrl": "https://example.org/license"
    }
  ]
}
```

This is a format example only. Do not add it to the real catalog until the recording, permission, URL, and duration are verified. Titles are recording metadata; add localized titles when real tracks are commissioned. Attribution and license links remain visible for the selected track.

The loader caps catalog size and track count, validates IDs and duration, and rejects credentials, query tokens, non-HTTPS remote URLs, obvious local/private hostnames, missing attribution, and invalid same-origin media paths. Hostname validation is not a substitute for reviewing the published URLs or their redirect behavior.

## Verification

Unit tests cover local-only language matching, Mandarin safeguards, missing-voice beeps, cancellation, stale queued utterances, threshold consumption, preference validation, catalog trust boundaries, explicit playback, offline buffered playback, rejected playback, and pause during a pending play request. Real recorded files and native voice quality still need human listening tests.

Primary API references: [SpeechSynthesisVoice.localService](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService), [voiceschanged](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event), [SpeechSynthesis.cancel](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/cancel), [HTMLMediaElement.play](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play).

## Source acquisition candidates

These are candidates for listening and rights review, not configured or shipped app tracks.

- [CreatorAssets Lively Cafe Ambience](https://creatorassets.com/audio/lively-cafe-ambience/) lists 10-minute and 20-minute versions. Its [official terms](https://creatorassets.com/legal/) dedicate assets to CC0 and allow redistribution in websites and apps. Acquisition and listening still needed; no direct media URL has been configured.
- [Sheyvan Convention Crowd](https://freesound.org/people/Sheyvan/sounds/494492/) is a 2:08.116 CC0 convention recording. Original download requires a free Freesound account. It could supply a shorter authentic loop after listening; repeating it into a longer file does not create additional unique material.

For the planned 5–10 minute cubing-specific tracks, original authorized venue recordings remain preferable. Do not make media requests to an external source just because its catalog page is listed here.
