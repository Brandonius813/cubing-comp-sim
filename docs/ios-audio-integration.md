# Native inspection audio integration

The audio module reuses all 128 immutable, approved recordings from `public/audio/inspection/v1`. `mobile/src/audio/assets.ts` contains static Metro requires, so every supported language/voice is packaged offline. No new audio is generated and no service is called during playback. Existing pack checksums remain authoritative.

`NativeInspectionAudio` uses Expo Audio SDK 57. Prepare the selected pair before inspection when practical, start with the practice timer's original `performance.now()` timestamp, and synchronously stop on leaving inspection, Back, background, event changes, unmount, or another preview. Never wait for audio before advancing the timer. If preparation is still pending, `start` retains the original timestamp. Preparation completion uses that timestamp and expires late callouts.

```ts
const audio = new NativeInspectionAudio();
void audio.prepare({ language: 'en', voice: 'male-1', volume: 0.8 });
// At inspection entry, using the same origin as the timing state:
audio.start(inspectionStartedAt);
// At any exit or interruption:
audio.stop();
```

Preparation errors should produce an understandable audio-unavailable status while practice remains usable. A preview rejects if the clips do not load within three seconds. A cancelled preview resolves without later playback. Real native output still needs device validation: code-level playback requests are not proof of audible output.

The pure `InspectionCueClock` schedules 8/12-second requests once each. Unready clips can retry for at most 500ms after their threshold; later cues are dropped. No late warning is replayed when resuming. Stop releases both players, invalidates pending preparation/preview work and clears scheduling. Inspection audio never changes penalties or elapsed time. Silent mode playback is enabled deliberately; volume zero stays silent. Background playback and recording are disabled.

Verification in this track: `node --import tsx --test src/audio.test.ts` from mobile passed 5 tests (thresholds, late/unready drops, bounded retries, stop/release, mute/replacement). Root `scripts/assert-inspection-pack.mjs` verified all 128 recordings and checksums. Neither check establishes native playback, Bluetooth interruptions or actual audio timing. Those remain device checks. Expo dependency resolution and native compilation were unavailable.

API reference: https://docs.expo.dev/versions/v57.0.0/sdk/audio/
