# Device feedback fixes, October 23, 2026

## Cloud history compatibility

Web history permits its selected `activeRoundId` to refer to a completed round. Native uses that field only for unfinished rounds. Native import previously rejected the otherwise valid save after the user approved Download. Normalize a completed selected round to a null active pointer, preserving every round, solve and provenance field. The selected event follows the imported round. Keep the recovery copy and read back the committed history before reporting success.

The earlier build listed every event; the latest feedback below supersedes that choice. Upload and Download are adjacent; Cloud Save has an accessible refresh icon. Confirmations show solve/round counts and one overwrite sentence. Account deletion and password entry live behind a red action and popup.

## Practice

No-wait practice has an optional Ready Screen, off by default. With it off, scramble confirmation enters inspection immediately when enabled. Without inspection, the armed timer displays 0.00, then uses the configured hold/release behavior. Existing explicit Ready and nonzero waiting flows remain available.

Long scramble notation scrolls at the selected font size, without automatic shrinking, line truncation or fixed percentage text height. This keeps the scramble confirmation control accessible with long 6×6 and 7×7 notation.

## Verification before binary build

- Mobile TypeScript, 116 domain/bridge/bundler tests, and iOS JavaScript export passed before engine performance changes. The export is not a native binary build.
- Regression fixture downloads a multi-event web save with a completed active round through the real transfer and storage logic, verifies replacement/reopening and retention of the recovery copy.
- An isolated headless rendering harness exercised the actual App and AccountPanel with native-service adapters: direct inspection, optional Ready, 0.00 timer start/stop, download into All Stats, upload of the resulting state, hidden deletion popup, and exact 16/40 px sizing for both 6×6 and 7×7. No page runtime errors. This is not native-device testing.
- The reported real cloud save was inspected read-only; its stored checksum passed and its completed active pointer confirmed the compatibility issue. No user save was modified by diagnosis.

Engine performance follow-up and native preview status are recorded below. Native-device acceptance remains outstanding.


## Recovery and engine verification, October 23

Implementation commit: `a90cefb7333cd0be1fa6c8b6700310009ef452a0` on PR #54.

- Bundle deterministic upstream 4×4 initialization tables at build time. Load them with upstream `Tools.initFrom`; continue generating fresh random states. The engine identity is now `webcrypto.4`, preventing older artifacts from being used accidentally.
- Retire a busy native engine when its active request is cancelled. Ignore retired-host responses/errors, preserve queued work across replacement, and reject remaining requests on service disposal.
- Local checks: 118 mobile tests, 278 web tests, four artifact-integrity tests, and mobile/web TypeScript passed.
- Mobile CI [39997413234](https://github.com/Brandonius813/cubing-comp-sim/actions/runs/39997413234) passed 32 JVM-reference fixtures, all 16 fresh generators in two bridge passes, and iOS/Android JavaScript exports. First 4×4 generation was 3,703 ms, compared with 12,213 ms in the preceding 32-bit-only run. This is a CI observation, not a device benchmark or guarantee.
- Desktop web checks passed. API checks passed after retrying an external container-registry rate limit. The dependency audit still fails for Vite/Vitest and Expo toolchain advisories; this is not a clean release/security approval. Do not use npm's suggested Expo 44 downgrade as an automatic fix for the Expo 57 toolchain.
- The downloadable engine from [39998686702](https://github.com/Brandonius813/cubing-comp-sim/actions/runs/39998686702) independently passed JVM conformance. Its SHA-256 is `e717d4833221ee3403be3cff4dd22830adfc239e48715de5ae8aa7d018945d0d`. This differs from the separately compiled mobile CI artifact; no byte-identity claim is made between those builds.
- That exact downloaded artifact passed the local production bridge smoke test for all 16 events in two passes. First/repeat 4×4 measured 2,696/1,469 ms on the development Mac. This smoke test does not repeat JVM fixtures; those passed in the artifact-producing workflow.
- EAS archive inspection confirmed the downloaded engine checksum, generated engine document, and exclusion of credential files.
- Expo reported the Free plan, four iOS builds used, zero overage metrics and zero total cost before submission. Existing ad hoc credentials were reused.
- Preview build: `ff9a3a22-f944-4ea7-bc6b-28170d27e512`, source `a90cefb`, internal iOS distribution. [Build finished](https://expo.dev/accounts/brandonius813/projects/cubing-comp-sim/builds/ff9a3a22-f944-4ea7-bc6b-28170d27e512) successfully. Downloaded IPA inspection verified bundle ID, iPhone/iPad support, the signed Apple Sign In entitlement, and the exact engine checksum marker in the bundled application. Physical-device behavior remains unverified.
- The auth custom-domain check still returned `entitlement_required`; DNS returned no CNAME for `auth.cubingcompsim.com`. The existing auth URL was retained. The owner subsequently cancelled this paid plan; no callback/domain setup is required.

No production deployment, merge, TestFlight submission, or App Store submission was performed in this recovery.


## Selected-event history and drawing follow-up

All Stats now uses the currently selected event's rounds and numbers rounds within that event. The drawing uses at most 28% of available space (capped at 200 points), with reduced padding; notation receives the remaining height. A muted down chevron appears when more than four points of content remain below, disappears at the bottom, and returns when scrolling upward. Changing scramble/font resets scroll position.

Megaminx U/F SVG text is replaced only in native presentation with vector glyphs centered at the engine's face coordinates. Both practice and solve-detail drawings use this adapter. Stored SVGs and the engine are unchanged.

Verification: mobile TypeScript and 120 tests passed. The headless native-adapter harness passed cloud download with only the selected event's five solves visible (all fifteen retained in storage/upload), existing timer flows, and overflow indicator visibility at top/bottom for 6x6/7x7 at 16/40-point font sizes. Screenshot review confirmed the larger notation area, lower drawing, gray arrow, and accessible confirmation control. Actual iOS rendering remains a device acceptance check.

Updated preview submitted from `2f349fed0308bfad0de0c80a7855e87d9c32fc2d`: https://expo.dev/accounts/brandonius813/projects/cubing-comp-sim/builds/5dcaa7f0-d83c-48f5-b194-a19c5b0d8785 . Submission succeeded; native build completion and device acceptance are not yet verified. Expo reported Free, five aggregate builds used and zero cost before submission. The adapter harness also verified switching from 5x5 (five solves) to 3x3 (ten solves).
