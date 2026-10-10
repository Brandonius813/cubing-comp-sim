# Website implementation handoff

## Current status (October 9, 2026)

The web app is on `main`, with a guest preview deployed through GitHub Actions to [Cloudflare Workers](https://morning-base-55f2.btrue813.workers.dev/). See [deployment details](cloudflare-deployment.md) for publication evidence and [the project overview](../README.md) for the current experience. Accounts and cloud saves still require separately configured and verified services.

The preview feedback work added the persistent scorecard, Statistics with mean of three rounds, configurable fonts and themes, fixed/random waits, consistent advance keys, and explicit round abandonment. Inspection now uses device voices without a beep fallback. Sixteen draft language catalogs are available; newer feedback labels use English pending translation review. See [language coverage](languages.md) and [audio status](audio-assets.md).

## Foundation handoff (October 8, 2026)

The remaining sections preserve the foundation's dated implementation and test evidence. Their test counts, screenshots, and deferred-work list describe that checkpoint, not the latest app. Later product decisions are recorded in [project notes](../PROJECT_NOTES.md); current pull-request checks provide verification for subsequent changes.

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
- All 84 application unit tests passed in [run 37859656656](https://github.com/Brandonius813/cubing-comp-sim/actions/runs/37859656656), covering scoring, cumulative penalties, parsing, import validation, cloud conflict handling, and consent/redaction with the actual Sentry SDK. Seven engine integrity/SVG regression tests also passed.
- A fixed 3×3 data fixture containing 100,000 attempts across 20,000 rounds serialized to 45,690,136 bytes (43.57 MiB), within the 100 MiB transfer limit. On Node 24.13.0/macOS arm64, serialization took 54 ms and parsing plus validation 117 ms. `src/storage/capacity.ts` reproduces it. This excludes actual scramble generation, IndexedDB, UI, network/compression, and other devices; event notation lengths change file size.
- API build, Docker image build, and all 21 tests passed in [run 37859656637](https://github.com/Brandonius813/cubing-comp-sim/actions/runs/37859656637), including actual PostgreSQL transactions, concurrent first uploads, retry behavior, rollback after an injected write failure, and deletion fencing. Supabase identity and R2 integration still require staging.
- Dependency audits in [run 37859656458](https://github.com/Brandonius813/cubing-comp-sim/actions/runs/37859656458) reported zero known vulnerabilities at every severity for the website and API at the time of the check. Vite is pinned to 8.0.16 and Vitest to 4.1.11; the corrected lock removes the old nested Vite/esbuild dependency and updates source-map-js to 1.2.2.
- All three browser suites passed in [run 37859656656](https://github.com/Brandonius813/cubing-comp-sim/actions/runs/37859656656), at application commit `22d7989cc5d465e921bbe6c8771221bef53134a8`. Chromium, Firefox, and WebKit reloaded the actual production website with networking disabled and generated new scrambles plus browser-decodable drawings for all sixteen events, including repeated 3×3 generation. Real IndexedDB tests passed two-tab/same-instance conflicts, interrupted-import rollback, recovery, inactive-history edits, and version-1 migration/rollback. UI tests passed language persistence, manual Ao5/reload, Space-only start/any-key stop, connection failures, invalid-import preservation, and stored-SVG isolation.
- Reviewed Chromium screenshots cover the home, event picker, scramble, completed scorecard, and settings at 1440×900. Automated captures also cover 2560×1440. Home-screen overflow, completed-round BPA/WPA persistence, and translated settings persistence have explicit assertions.
- Initial 4×4 generation ranged from roughly 10–27 seconds and FTO from roughly 4–19 seconds across shared-CI Chromium/Firefox runs. WebKit's first 4×4 request took 55.947 seconds in the final run; this remains a material launch-performance gate. These individual measurements vary with runner load and are not a device-performance promise. The worker keeps the UI responsive while tables initialize. Profile ordinary laptops before setting a release latency budget.
- Playwright is pinned to 1.64.0, whose WebKit includes the upstream fix for [offline service-worker emulation](https://github.com/microsoft/playwright/pull/42894). No offline assertion is skipped. Connection-failure tests use a real HTTP 503 at the preview server because route interception differs across service-worker implementations.
- This task's Mac sandbox cannot launch Chrome, bind a local preview server, or compile the Java engine. Networked CI provides the actual compiler/browser evidence. A UI-only local build is not evidence of offline scrambling.

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

Native Mac, Windows, iOS/iPadOS, and Android clients follow a stable website. Google and WCA social sign-in need separate registrations and are not presented as working buttons. Background competition audio needs a licensed source and product tuning. English and Spanish catalogs and persisted language switching are implemented; Spanish terminology still needs native-speaker/cuber review. Additional catalogs are independent of scoring logic. Advanced historical statistics, background audio, and signed-in email/profile management are not complete.

No production deployment, domain change, billing purchase, or App Store submission has been performed.
