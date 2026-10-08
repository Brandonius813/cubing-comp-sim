# Website implementation handoff

Updated October 8, 2026. This records implementation and verification separately. The app has not been deployed and no production accounts or provider secrets have been configured.

## Implementation

The desktop website is implemented in React/TypeScript/Vite. Competition rules, scramble generation, storage, cloud transport, telemetry, and UI have separate modules. Future native clients can reuse the domain and transfer contracts without inheriting mouse/keyboard UI assumptions.

Guest users can begin without an account. The timer uses a monotonic clock, starts with Space, and stops on a key received by the active timer. Form fields and dialogs do not accidentally trigger it. Manual entry, inspection penalties, additional penalties, per-event round formats, history, goals, and unfinished-round recovery are included.

TNoodle source is pinned and vendored unchanged. TeaVM compiles it into a browser module loaded in a background worker. There is no network scrambling endpoint or finite scramble bank. The production build requires successful JVM/browser conformance evidence matching both the exact app source and upstream source. Settings distinguish internet connectivity from completed offline preparation.

Normal saves use IndexedDB transactions with revision checks between tabs. Completed attempts retain scramble text and engine version. Only an active draft needs its SVG drawing. Imports validate before atomic replacement; one local pre-replacement recovery copy is separate from the single current cloud save. User-cleared browser storage can remove local data, as explicitly accepted.

The cloud API uses Supabase identity verification, PostgreSQL metadata, and a private S3-compatible bucket. Explicit upload/download replaces one current save, never merges. Pending upload objects and metadata-only retry receipts allow safe retries without ten historical saves. Provider-backed authorization, email delivery, and restore drills require a configured staging environment.

## Verification evidence

- The actual JVM reference and TeaVM browser engine compiled successfully in GitHub Actions.
- Engine proof runs 37852096123 and 37852467665 passed 32 seeded cases and fresh WebCrypto generation for all 16 events. They also compare random-number behavior, puzzle state, drawing geometry/colors, and upstream minimum-distance checks.
- Source hash verification covers 72 upstream files. The original algorithms remain unchanged. JVM/WebCrypto randomness adaptation is explicit and tested.
- Application unit tests cover scoring, inspection, cumulative penalties, manual parsing, import validation, cloud conflict handling, and telemetry privacy. Final test counts and browser results are recorded in the pull request and CI checks.
- A fixed 3×3 data fixture containing 100,000 attempts across 20,000 rounds serialized to 45,690,136 bytes (43.57 MiB), within the 100 MiB transfer limit. On Node 24.13.0/macOS arm64, serialization took 54 ms and parsing plus validation 117 ms. `src/storage/capacity.ts` reproduces it. This excludes actual scramble generation, IndexedDB, UI, network/compression, and other devices; event notation lengths change file size.
- API build and tests passed in run 37853046759. Tests use controlled storage/auth dependencies; they do not replace live provider integration checks.
- Browser acceptance uses the actual production service worker, actual scramble worker, actual IndexedDB, and disabled networking. Chromium, Firefox, and WebKit are configured. Results are not assumed until their jobs pass.
- This task's Mac sandbox cannot launch Chrome or compile the Java engine. Networked CI provides the actual compiler/browser evidence. A UI-only local build is not evidence of offline scrambling.

## Before public launch

1. Review the desktop behavior and visual screenshots against Figma, then test ordinary Mac/Windows hardware, keyboard focus, sleep/wake, and an actual offline trip scenario.
2. Set up isolated staging resources: web hosting, Supabase Auth/PostgreSQL, private bucket, API runtime, and transactional email. Use project-owned accounts and secret managers. See `access-setup.md`.
3. Run real two-account/two-device upload/download, concurrent replacement, expired/revoked-token, password reset, email verification, and account deletion tests. Signing in alone must never transfer local data.
4. Configure opt-in analytics/error-reporting projects and verify redaction using synthetic data. Create DAU/MAU, verified-account, upload failure, API error/latency, and uptime views. Production dashboards cannot exist without provider projects.
5. Verify infrastructure backups and a restore drill, private bucket permissions, rate limits, retention, abuse controls, and budget alerts. Confirm deletion handling for backups and retained logs.
6. Make an explicit source-license decision before deploying browser binaries. TNoodle's library is GPL-3.0; a public repository alone is not an application license. A GPL-compatible open-source release is proposed. Native App Store distribution needs its own license review later.
7. Supply real support/contact details and a privacy notice that matches the configured providers, regions, retention, and opt-in choices. Do not publish placeholder legal/contact text.
8. Complete the capacity and device-performance gates. A synthetic serialized-data benchmark does not prove IndexedDB performance, low-end hardware latency, or unlimited storage.

## Deferred product work

Native Mac, Windows, iOS/iPadOS, and Android clients follow a stable website. Google and WCA social sign-in need separate registrations and are not presented as working buttons. Background competition audio needs a licensed source and product tuning. Additional translations need review; translation infrastructure should keep them independent of scoring logic.

No production deployment, domain change, billing purchase, or App Store submission has been performed.
