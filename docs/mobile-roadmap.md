# Mobile architecture and agent handoff

Approved by Brandon True on October 15, 2026. This document supersedes the earlier mobile-deferral and tablet-side-panel proposals. It records the authorized direction, not completed native acceptance.

**Tracker:** [#36](https://github.com/Brandonius813/cubing-comp-sim/issues/36). **Initial code:** `feat/mobile-foundation`. **Apple provider work:** `feat/apple-sign-in`.

## Product decisions

- React Native with Expo, one mobile codebase for iPhone, iPad, Android phones and Android tablets. Keep the existing React website.
- Three separate full-screen pages in spatial order: **Scorecard | Practice | Settings**. Open Practice on launch. Keep Scorecard and Settings separate on tablets too; do not bring back the desktop sidebar.
- Swiping reveals the adjacent page using ordinary horizontal paging: swipe right to reveal the page on the left; swipe left to reveal the page on the right. Provide visible, accessible tap navigation too. The Clash Royale reference describes this navigation model, not copied artwork or game UI.
- Settings contains simulation/preferences, account information and explicit cloud upload/download. Nested settings/details may use their own navigation within that page.
- Lock paging, tab changes and back navigation during inspection, arming, timing and save commits. A paging gesture must never accidentally start/stop the timer. Permit reviewing the scorecard between attempts without discarding the round.
- Keep guest practice, all 16 current events, fresh offline TNoodle scrambles and drawings, recorded inspection voices, time entry, penalties and saved history. Background ambience remains removed.
- Native engine implementation may change. Preserve pinned algorithm correctness and offline availability; this does not authorize a substitute generator or online scramble service.
- Reuse Supabase accounts and the existing Fastify/PostgreSQL/private-object-storage backend. One current cloud save per account; explicit upload/download replacement, no automatic merge or transfer on sign-in.
- Add Sign in with Apple across web and mobile. Gate enablement on actual provider setup, consent acceptance and account deletion/token revocation.

## Architecture

| Boundary | Existing website | Mobile | Shared contract |
| --- | --- | --- | --- |
| Screens | React DOM and CSS | React Native views and three-page navigation | Branding, translations, event identifiers and behavior |
| Competition | `src/core` | Import pure core rules; inject platform clock/IDs as needed | Round states, penalties, timing calculations, statistics |
| Orchestration | Browser-coupled `useSimulator` | Native action/controller layer | User actions and persisted round structure |
| Scrambles | Verified TeaVM TNoodle module in Web Worker | Isolated runtime adapter, initially a bundled WebView feasibility build | Typed generate/draw requests; pinned engine identity |
| History | IndexedDB | SQLite | Versioned save snapshot and transactional replacement |
| Audio/files | Web Audio and browser downloads | Native audio, document picker and sharing adapters | Bundled voice pack and portable save format |
| Accounts | Browser OAuth redirects | System authentication flow and app callbacks; secure credential storage | Same Supabase account ID and authorized save API |
| Cloud | HTTPS API | Same HTTPS API | Versioned snapshots, revision checks and account isolation |

Keep the first step small: `mobile/` has its own dependency manifest and lockfile. Import the current pure core rather than duplicating it or moving the whole website into a monorepo framework. Coordinate changes to shared rules; mobile tooling must not silently alter the website build or its React runtime.

The generator must run outside React Native's UI JavaScript thread. A WebView used only as an isolated engine host does not make the app's screens web pages. Runtime choice remains provisional until device benchmarks pass. Do not move a slow synchronous generator onto the UI thread merely because its JavaScript imports successfully.

All assets needed for a fresh offline round belong in the installed app. A website service worker is not the mobile offline strategy. Do not ship a remote website URL as the engine host. Verify source identity and conformance before generating the mobile engine asset.

## Initial implementation and remaining acceptance

The kickoff implements the mobile project, navigation, an offline practice foundation, engine adapter, and separate Apple provider readiness changes. Exact implementation and test evidence are recorded in the pull request and [engine guide](mobile-engine.md). Until native build and device evidence exist, JavaScript exports and host tests establish code readiness only.

The first milestone is an installable build that produces real scrambles, records a round and retains it after restart. Full mobile audio, cloud transfer, native authentication and device acceptance are tracked separately. Never label a disabled or unfinished integration as functional.

Repository baseline for this kickoff: `2fdd881f16f11e25b4df735041ecaf3692a71edb`. Other web work may continue; fetch current main before starting a new branch. Do not reset or repurpose another agent's checkout.

## Parallel workstreams

| Issue | Work | File ownership | Dependency / evidence |
| --- | --- | --- | --- |
| [#37](https://github.com/Brandonius813/cubing-comp-sim/issues/37) | Native screens and competition flow | `mobile/` UI/config except engine-owned files | Integrate engine contract; screen and gesture tests |
| [#38](https://github.com/Brandonius813/cubing-comp-sim/issues/38) | TNoodle runtime and licensing path | `mobile/src/engine/`, `mobile/scripts/engine*`, `docs/mobile-engine.md` | Same pinned source; all-event conformance and real-device profiling |
| [#39](https://github.com/Brandonius813/cubing-comp-sim/issues/39) | SQLite, audio, accounts and cloud parity | Native adapters and corresponding screen integration | Existing save schema; coordinate shell and Apple changes |
| [#40](https://github.com/Brandonius813/cubing-comp-sim/issues/40) | Apple login and deletion readiness | Web/auth/server/provider setup, `docs/apple-sign-in.md` | Real Apple configuration and revocation acceptance before enablement |
| [#41](https://github.com/Brandonius813/cubing-comp-sim/issues/41) | Builds, device beta and store release | Build/release configuration, `docs/mobile-testing.md` | Signing ownership, native tools, physical devices, tester cohort |

### Starting another agent

Give the agent the repository and its specific issue, then this prompt:

> Read AGENTS.md, PROJECT_NOTES.md, docs/mobile-roadmap.md and the assigned issue. Inspect its linked pull requests before editing. Work on a separate branch from the current agreed integration base. Own only the issue's files; coordinate shared interfaces and dependency manifests before changing them. Preserve the three separate screens, offline engine fidelity and explicit cloud replacement. Record what changed, which checks actually ran, what remains blocked, and the branch/PR. Do not claim a native build or device result from host tests. Never commit credentials or production data.

Prefer an independent branch/PR per issue. The kickoff shared checkout uses disjoint file ownership; this is not permission for future agents to concurrently mutate the same checkout. Integrate one change at a time and rerun affected checks. Do not merge incomplete native code merely to make it easier to find; the branch and tracker are available online.

## Build and testing boundaries

See [Mobile testing](mobile-testing.md) for commands and setup.

1. Host tests and TypeScript checks validate rules, storage/control contracts and integration shape.
2. iOS/Android JavaScript exports validate Metro dependency resolution and bundling, not native compilation.
3. Xcode Simulator and Android Emulator validate compiled native application behavior.
4. Physical iPhone, iPad and Android devices validate touch latency, audio, memory, background transitions and fresh offline launch.
5. TestFlight and Google Play beta tracks validate signed distribution and update behavior.

Development builds connect to Metro for live editing. Standalone preview builds carry their own JavaScript and are required for offline acceptance without a computer. Expo Go cannot establish custom native engine or authentication acceptance.

On the kickoff host, Node is available; full Xcode/iOS Simulator and Android tooling were not installed. Apple Developer enrollment, Expo/EAS project ownership and physical test devices have not been verified. Do not create guessed account IDs, signing keys, or successful build records.

## Release constraints

- Set permanent bundle/package IDs before registering provider callbacks and signing. Keep development and production environments explicit; no client secret or service-role credential belongs in the app.
- Browser history does not automatically migrate to an installed app. Use website Upload followed by app Download, or supported file transfer.
- Persist round drafts and results transactionally. Define interruption behavior explicitly; do not count animation ticks or assume suspended JavaScript keeps executing.
- Confirm the GPL-3.0 TNoodle library distribution obligations and application license. This repository's earlier license note is still unresolved; open source visibility alone is not a finding of store compatibility.
- Apple sign-in requires working account deletion and provider-token revocation. Keep a durable retry strategy and private relay email handling.
- Keep existing API/save contracts compatible with older installed clients. Store updates do not reach every user at once.
- Recheck store SDK/privacy requirements at submission. Prepare reviewer access, privacy disclosures, a deletion web resource and useful competition-simulation screenshots.

## References

- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/)
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Supabase mobile authentication callbacks](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465)
