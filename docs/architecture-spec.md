# Cubing Comp Sim Desktop Architecture and Product Spec Draft

**Implementation specification v0.3 | October 8, 2026 | Owner: Brandon True**

Build the first release as a desktop website at cubingcompsim.com. A visitor can start a simulation without signing in, and every completed attempt is saved on that device. Accounts enable explicit cloud uploads and downloads. The architecture must support later Mac, Windows, iPhone, iPad, and Android apps with the same data and behavior.

The proposed stack is React, TypeScript, and Vite for the website; a locally bundled TNoodle-derived engine; IndexedDB through Dexie for local history; a TypeScript/Fastify cloud-save API; PostgreSQL for account and save metadata; and private object storage for one current cloud save per user. Start with managed authentication and PostgreSQL while owning the application backend.

**Confirmed requirements:** unlimited fresh offline scrambles and drawings for every included event are mandatory. Clearing browser cache/site data may delete local history. Fewest Moves and Multi-Blind are excluded. Upstream FTO is accepted before WCA approval. Clock is last in the event picker with an ordinary event label. Website first; native apps follow a stable web release, and do not require platform-specific languages. Keyboard timing starts with Space only and stops with any key; manual entry is also required.

Brandon authorized implementation on October 8, 2026. Build the local website and verify the offline engine first, then connect cloud services when their access is configured. This document describes the target; completed implementation and test evidence belong in the repository status notes. Do not treat a specified feature as a completed feature.

## Product commitments

| Requirement | Planned behavior |
|---|---|
| Immediate use | Home opens with the scorecard visible. No account, onboarding wall, or remote account lookup before local use. |
| Desktop first | First release targets desktop browsers. Native desktop packaging and mobile interfaces come later. |
| Local ownership | Solves and rounds are stored in the browser database. No per-solve network request is required to save a result. |
| Manual cloud saves | Upload replaces the cloud history. Download replaces the current device history. Neither operation merges. |
| Recovery | One current cloud save. Use temporary transfer copies for atomic replacement, separate infrastructure backups, and portable file export. |
| Scramble fidelity | Bundle a pinned TNoodle engine and its own drawing implementation locally, with the correct event-specific configuration. |
| Offline operation | Generate unlimited new scrambles locally after website assets are cached, or immediately after native app installation. Accounts and cloud transfers need connectivity. |
| Event scope | Include upstream FTO. Put Clock last with no historical/current label. Exclude Fewest Moves and Multi-Blind. |
| Browser data deletion | Loss caused by clearing browser data is acceptable. Cloud recovery is available only for previously uploaded history. |
| Multiple platforms | Native apps are deferred until the website is stable. React Native is acceptable; platform-language implementations are not required. Share core logic and save contracts. |
| Timer controls | Space only to start; any key delivered to the active timer to stop. Manual entry is a separate supported input mode. |
| Connection status | Settings shows a small connection icon and text, based on browser hints and a fresh service-reachability check. Offline status never blocks solving. |
| Languages | Language selection belongs in settings; all interface strings are externalized from the start. |
| Simple scope | No social network, live multiplayer, leaderboard, payments, or automatic synchronization in the first release. |

Prevent app-caused loss during normal use, migrations, and transfers. Recovery from deliberately cleared or evicted browser data is outside the local-storage guarantee. For scrambling, use explicit invariants, upstream traceability, and release gates. No software can promise zero defects forever; a failure must never silently substitute a different algorithm.

## Design baseline

The [Figma desktop review](https://www.figma.com/design/c5ylKAVo0HCpGk7la0de1w?node-id=44-2) is the design starting point. Its rendered review specifies overwrite semantics. The event picker must remove Fewest Moves and Multi-Blind, include FTO, and put Clock last. No event approval, retirement, current, or historical labels appear in the interface.

Reviewed screen references:

| Screen | Laptop node | Large desktop node |
|---|---|---|
| Home | 16:2 | 30:10127 |
| Scorecard hidden | 20:123 | 30:10209 |
| Scorecard actions | 20:177 | 30:10263 |
| Enter solve with +2 | 54:4632 | 54:10704 |
| Keyboard shortcuts | 52:4539 | 52:26741 |
| Shortcut tooltip | 54:4650 | 54:10722 |
| Event picker | 21:1773 | 30:11867 |
| Cloud save status | 21:2121 | 30:12213 |
| Local and cloud changes | 52:5691 | 52:27857 |

Visual rules to carry forward:

- Center Start CompSim within the area beside the visible scorecard. Center it across the viewport when the scorecard is hidden.
- First visit uses the same home layout, with an empty scorecard rather than fabricated example results.
- Reserve the top-left area for the future logo.
- Center row actions against their triggering row.
- Use the actual browser viewport in CSS pixels. A Studio Display’s physical pixel resolution is not its browser layout width.
- Scramble text scales within 32–56 CSS pixels, solve counter within 16–28, and drawing container width within 280–448.
- Wrap long scrambles without changing their notation. Preserve the drawing’s actual aspect ratio inside the design’s container, including non-cube events.
- Test the 1440 × 900 and 2560 × 1440 targets, intermediate widths, shorter laptop windows, browser zoom, and longer translations.
- Reuse the Figma theme, type, and spacing tokens. React does not require a pre-styled component kit.

The review links are not a complete behavioral specification. Simulation duration settings, all statistics, specialized event interactions, recovery screens, and some error states remain to be specified. No existing application repository was audited in this planning pass.

## Frontend and native app choices

Brandon confirmed that native does not require platform-specific languages. React Native is an acceptable later direction. Finish and stabilize the website before beginning Mac, Windows, iOS, iPadOS, or Android application work. The alternatives below are retained as architecture context, not unresolved blockers.

| Approach | What is shared | Main trade-off | Fit |
|---|---|---|---|
| React web plus React Native | TypeScript rules, save logic, models, translations; some UI patterns | Web CSS and DOM screens are not portable native screens. Desktop React Native has separate platform projects and module support. | Accepted direction for later apps. |
| Flutter on all platforms | Dart logic and much of the UI | Native machine-code apps with Flutter-rendered controls; web rendering and startup must be measured against the lightweight website goal. | Strong alternative if one UI codebase is the top priority. |
| React web plus SwiftUI, Kotlin/Compose, and Windows native UI | API, save format, test fixtures, design tokens; logic can be ported | Highest platform control, highest implementation and maintenance cost. | Unnecessary for the confirmed requirement. |
| Kotlin Multiplatform with native UI | Suitable Kotlin business logic across supported targets | Adds Kotlin-to-web/native integration. Java TNoodle dependencies do not automatically become portable Kotlin code. | Worth reconsidering if platform-native UI becomes mandatory. |
| React with Tauri or Capacitor | Most web UI and logic | Installed apps whose main UI is a WebView. Store distribution does not make that UI platform-native. | Not the default under the stated native requirement. |

React Native creates platform-backed views on mobile, and its macOS and Windows implementations are separately maintained platform projects. Flutter generally renders its own controls. Tauri uses system WebViews. These distinctions should drive the choice, not whether a framework can output an app package. [Sources: React Native components, React Native platforms, Flutter architecture, Tauri.]

**Recommended frontend:** React + TypeScript + Vite, with ordinary CSS/CSS Modules and Figma-derived tokens. Use accessible, unstyled primitives where helpful. A server-rendered framework such as Next.js adds little to the core timer, which is interactive and local. A static public landing/help page can be added independently if search visibility becomes important.

Use a small explicit state machine or pure reducer for the simulation. Do not put timing rules, scoring, or persistence inside React components. XState is an option if the final transition model warrants it; a library is not required for the first state machine.

For later mobile apps, evaluate React Native with Expo tooling and SQLite. Expo tooling is not a PWA. Mac and Windows require their own platform compatibility checks, including SQLite, SVG rendering, secure credentials, and timing input. Do not promise one Expo project covers all desktop platforms.

Preserve save schemas and rule fixtures across later apps. Avoid adding a cross-language framework solely to eliminate a possible future rewrite of the small competition-rules module.

## Shared boundaries

| Module | Responsibility | Must not depend on |
|---|---|---|
| Competition core | Round progression, attempt states, penalties, scoring, input validation | React, browser globals, network, database SDK |
| Contracts | Stable event IDs, result types, snapshot schema, API models | Screen layout |
| Application actions | Start round, submit attempt, edit result, upload, download | Specific keyboard or touch gestures |
| Platform adapters | Clock, input, storage, audio, files, authentication transport | UI-specific scoring rules |
| Presentation | Figma layouts, dialogs, accessible focus, translated labels | Direct database writes |
| Local scramble engine | TNoodle generation, filtering, notation, and SVG drawing | Network, account session, UI rendering loop |
| Backend | Save authorization and commit, account operations, metadata | Timer ticks or scramble generation |

A keyboard press, a future touch gesture, and a hardware timer should all produce the same application action. Their adapters may differ.

The wire contract uses versioned JSON and documented HTTP endpoints. Sharing TypeScript types helps TypeScript clients, but server-side validation is still required. Native ports must not depend on a browser SDK or the internal database layout.

## Recommended backend and alternatives

**Recommended starting structure:** one small TypeScript/Fastify application for cloud-save operations. Fastify is an HTTP server framework. The service verifies account sessions, authorizes access, validates snapshots, and commits or retrieves the user's current save. It never runs the timer or generates the user's scrambles.

Keep Java/Gradle and the JVM reference engine in the build and verification toolchain. They are no longer reasons to host a JVM server in production.

| Backend option | Advantages | Costs and limits |
|---|---|---|
| TypeScript/Fastify with managed PostgreSQL and auth | Shared application language; explicit backend learning; straightforward SQL and snapshot handling | Small server bill plus managed services |
| Kotlin/Ktor with managed PostgreSQL and auth | Good JVM/backend learning and mature server tooling | Adds a language without being necessary for offline scrambling |
| Fastify plus self-hosted PostgreSQL and established auth software | More operations experience and infrastructure control | Patching, backups, recovery, mail, capacity, and uptime are your responsibility |
| Supabase functions or Cloudflare Workers with managed data services | Little server maintenance; low usage-based costs | Runtime and database-connection constraints; still requires careful atomic save design |
| AWS stack | Broad infrastructure learning and service choices | More configuration and cost surfaces than the initial workload needs |

Do not build password hashing, OAuth protocol handling, or session cryptography from scratch. Owning a backend does not require inventing authentication.

Start with Supabase Auth and managed PostgreSQL as the practical default, with the application API in front of cloud-save data. Supabase is replaceable because the application owns the save format, SQL schema, and API. For the first guest-only desktop milestone, no cloud backend is needed at all.

Supabase supports custom OAuth/OIDC providers. WCA login remains an integration gate: verify its user-info shape, identity mapping, scopes, callbacks, linking, and availability under the chosen plan. A generic custom-provider feature does not prove WCA works without adaptation. [Sources: Supabase custom providers; WCA API.]

## Exact TNoodle scrambles and drawings

As checked on October 8, 2026, the WCA lists **TNoodle-WCA 1.2.3** as its current official scramble program. Its tagged dependency manifest specifies **lib-scrambles 0.19.2**. Upstream development branches may contain newer changes that are not in that approved program. [Sources: WCA Scrambles; TNoodle 1.2.3 dependency manifest.]

Use this distinction in the implementation:

- For events in the current approved program, the reference baseline is that program and its pinned dependencies.
- FTO uses the pinned upstream implementation now. Brandon explicitly accepts the version that has not yet appeared in a WCA-approved release.
- The app runs a verified local build of the corresponding library through a small platform adapter.
- Engine provenance stays in build records and saved metadata. There is no user-facing approval-status label or regulation synchronization feature.
- A new upstream release is evaluated, tested, and deliberately adopted. Never track a moving master branch in production.

The inspected library exposes a WCA-filtered generation path, including generateScramble/generateWcaScramble, and drawScramble for SVG output. Call the approved event-specific path. Do not bypass filtering with low-level random-move functions. Confirm the full event-to-engine mapping against the official program, including blindfolded orientation. Fewest Moves and Multi-Blind are excluded. [Source: TNoodle Puzzle.java.]

A locally generated scramble package contains:

| Field | Purpose |
|---|---|
| Scramble ID and event ID | Prevent attaching a response to the wrong attempt or event |
| Exact notation | Permanent record of what the user saw |
| SVG drawing | Produced from that same notation by that same engine |
| Upstream reference, library version, build digest | Internal traceability |
| Event configuration and scoring-rules version | Reproducible interpretation; no online rules lookup |
| Generation time and checksums | Corruption detection and diagnostics |

Generate the notation first and draw that exact notation. Return both from the local worker as one package. Preserve upstream face orientation and colors. Use SVG scaling for different screens. Do not substitute another drawing library just because its cube looks similar.

Persist the selected scramble with its attempt before allowing the solve to progress. A refresh must not replace it with a new scramble. Out-of-order worker messages must never change an already-started attempt.

Generate a small batch ahead in a Web Worker so initialization and search do not block keyboard input or rendering. Keep lookup tables local, cache validated tables when useful, and verify their version and checksum. A cache miss may rebuild tables locally; it must not require a server or silently select a weaker generator.

Track job and attempt IDs so cancelled work or retries cannot attach a different scramble to a running attempt. Never deduplicate generated states just because they look easy, unusual, or repeat by chance. That can alter the distribution. Prevent application-level accidental reuse without filtering legitimate random outcomes.

### Offline TNoodle build strategy

**Yes, clone or vendor the TNoodle library source.** The useful component is tnoodle-lib, which contains the generation, filtering, puzzle-state, and SVG code. The whole TNoodle competition administration interface and server are unnecessary.

Cloning gives us the source. It does not automatically give us a browser executable. The inspected current build is a Java library with GWT export annotations; it does not establish a maintained, current browser artifact covering all required events.

| Path | Assessment |
|---|---|
| Compile the pinned Java library to JavaScript | Preferred first experiment. TeaVM or a maintained GWT build may preserve upstream algorithm code and provide a portable local runtime. |
| Compile to WebAssembly | Alternative if browser support, bundle size, memory, and performance justify it. Do not assume the same Wasm module runs inside React Native's JavaScript runtime. |
| Native bindings around Java/native builds | Candidate for future platform-language apps. Android integration differs from Apple platforms. |
| Hand-rewrite all scramblers in TypeScript or Rust | Highest risk of divergence and duplicate maintenance. Avoid as the initial solution. |
| Pre-download a finite pool of server scrambles | Fails the requirement for unlimited fresh offline generation. |
| Substitute another scrambling library | Fails the exact-TNoodle requirement unless its matching provenance and behavior are demonstrated. |

TeaVM compiles Java bytecode into JavaScript and WebAssembly, but explicitly documents restrictions on Java APIs and possible adaptation work. Treat it as a candidate, not a proven TNoodle build. Historical TNoodle JavaScript output and an archived iOS native fork establish precedent, not compatibility with the current engine. [Sources: TeaVM overview; TNoodle issue 12; archived native fork.]

The feasibility experiment must cover:

1. Generation and SVG drawing for every included event, especially 4×4 and FTO.
2. Java reflection/registry setup, resource loading, integer behavior, threading assumptions, initialization, and serialization.
3. Secure local randomness and unbiased bounded sampling. The Java provider-specific RNG calls may need an audited platform adapter. Never replace them with Math.random or a fixed production seed.
4. A controlled random stream for reference comparisons. Matching the distribution and filtering is the production requirement; identical random sequences across unrelated devices are not.
5. Build artifacts with no CDN, remote font, table download, token refresh, or network request required to solve.
6. Web Worker execution on browsers and an actual background execution strategy on later native targets. Moving code into React Native does not automatically give it browser workers.
7. Cold startup, generation latency, memory, battery, and compressed download size. Verify a small native runtime harness before promising the browser artifact is reusable on mobile.
8. Minimal audited adapter changes, a recorded patch set, dependency checksums, license notices, and a reproducible build.

### Offline website loading and native installation

For the website, a first successful online visit downloads the app and engine. A service worker caches the app shell, worker code, engine, tables/assets, fonts, essential help text, and audio cues. This enables reopening it offline. Offline readiness and current network connectivity are different: assets can be ready while connected, or missing while disconnected. Expose a short offline-readiness detail in settings only after the required assets are verified.

A service worker is a browser caching mechanism also used by PWAs. It does not replace the requested native apps. The plan does not use an installable PWA as the mobile product. Native installed apps later work offline from bundled resources. [Source: MDN Service Worker API.]

Keep app, engine, and asset versions coherent during updates. Activate a new version between rounds, retain the working version until replacement assets are verified, and never reload during a solve. Clearing browser data can remove both history and offline assets, as accepted by Brandon.

Native apps should ship all required engines and assets at installation, without an extra online first-run requirement. Tutorial video streaming and account/cloud actions may be unavailable offline; core solving, history, drawings, and text guidance remain available.

Do not build a WCA-regulation synchronization service, freshness badge, or connection-dependent permission to generate. Keep engine and scoring-rule versions internally for debugging and data compatibility. Corrections ship through ordinary application releases, activated between rounds.

Settings contains a small icon with an accessible text label: Online, Offline, or Connection unavailable while a check is inconclusive. Browser online/offline events are hints. A short uncached first-party reachability request confirms that the deployed service can actually be reached; it must validate the expected response so a captive portal is not mistaken for success. Run it on opening settings, reconnect, and a bounded retry, never on every timer tick. Failures cannot prove the entire internet is down, so label a service failure honestly. Do not disable local timing, manual input, history, or scrambling. A cloud action can still attempt a fresh request. [Source: MDN Navigator.onLine.]

### FTO and Clock

Upstream merged its random-state FTO implementation on September 29, 2026. The inspected development build declares version 0.20.0 and includes an FTO registry entry. This is distinct from the currently listed official TNoodle-WCA 1.2.3 baseline using lib-scrambles 0.19.2. [Sources: upstream FTO pull request; library build files; WCA Scrambles.]

Include FTO using this upstream implementation without waiting for WCA approval. Pin the exact commit and dependencies; verify its offline generation and drawing alongside the other events. The UI simply calls it FTO. There is no promise that an unreleased future competition build will be byte-for-byte identical.

Keep Clock as a normal supported event, last in the picker. Do not add retirement, historical, current, training-only, or approval labels.

### Scramble release gates

1. Pin release, artifact checksums, dependencies, and event settings.
2. Run upstream tests and independent application contract tests.
3. Compare known notation and drawings against reference outputs for every enabled event.
4. Use a controlled random source for deterministic test fixtures where supported. Do not assume a seed produces identical outputs on every runtime; upstream code itself flags seed portability concerns.
5. Verify that generated notation parses and drawing state matches that notation. Compare controlled-input compiled outputs with the JVM reference, including normalized SVG/state fixtures.
6. Check minimum-distance and orientation cases through the correct engine paths and regression fixtures.
7. Run large batches to detect malformed output, hangs, event mismatches, and distribution regressions. Sampling is useful evidence, not proof of perfect randomness.
8. Run in airplane mode after closing and reopening the app, clear the pre-generated scramble queue, and generate new scrambles for every event. No server fallback is allowed.
9. Fail the release on any known mismatch. Record incidents by engine version and disable or repair affected generators through an explicit update. Offline clients receive corrections when updated.

TNoodle’s app repository is AGPL-3.0, the library repository GPL-3.0, and csTimer GPL-3.0. Their code is not license-free. Record exact dependencies and notices; resolve distribution obligations before bundling TNoodle into App Store binaries or copying csTimer implementation code. Shipping compiled JavaScript/Wasm is also distribution. Making the app open source may be part of compliance, but does not by itself settle App Store license compatibility. Resolve the license/distribution path before committing to the local engine integration. This draft does not settle those legal questions. [Sources: linked repositories.]

## Local storage that survives normal use

“Browser cache” should mean a dedicated **IndexedDB database**, not the HTTP cache. Use Dexie to manage transactions and migrations. csTimer itself uses IndexedDB for session data, with localStorage for settings and a fallback; it also advises export backups and keeps earlier cloud uploads. [Source: csTimer README.]

IndexedDB survives normal reloads and browser restarts, but users can delete site data, private browsing can be temporary, and browsers apply storage quotas and eviction rules. Brandon accepts loss from browser-data clearing and browser storage behavior. Persistent-storage requests and export reminders are optional conveniences, not requirements to defeat those browser controls. Data belongs to an origin, so switching between www and non-www or changing the domain creates a different storage location. Choose one canonical HTTPS origin before launch. [Source: MDN storage quotas.]

Storage requirements:

- Save each submitted result immediately in a transaction. Never rely on page-close events.
- Commit the attempt, round progress, and local revision together.
- Display “saved” only after the transaction succeeds.
- If a write fails, preserve the result on screen, stop automatic progression, and offer retry and file export.
- Never clear the database automatically after an error.
- Persist the post-timer result as a recoverable draft before a separate confirmation screen.
- Keep completed attempts after refresh or crash. If a running attempt is interrupted, mark it interrupted and ask how to record it; do not invent a time from a new browser session.
- Apply versioned migrations with fixtures from every supported prior schema.
- Use a single active timing writer across tabs. Other tabs can read history. Use a lock plus database revision checks, and notify tabs when the active dataset changes.
- Keep a local recovery dataset before downloads, file imports, destructive edits, and migrations. A copy within IndexedDB protects against app mistakes, not loss of the entire browser profile.
- Offer a full-fidelity versioned JSON export and a simpler CSV export. CSV is for analysis, not a complete restore format.
- Detect actual persistence failures at startup. Do not claim private-mode detection is reliable.
- Pagination and indexed queries must avoid loading all history to show one scorecard.

Separate local solve history from device preferences such as keyboard bindings, UI scale, audio volume, and language. A phone downloading desktop times should not inherit inappropriate keyboard settings.

## Manual cloud save protocol

Cloud save is an explicit **whole-history replacement**. Each user has one current cloud save. A monotonically increasing revision detects concurrent overwrites; a revision number does not mean retaining a history of complete files.

Signing in must not upload, download, merge, or clear history. Signing out must not erase device history. Account switching must clearly identify the destination account before upload.

### Upload

1. Capture a consistent local dataset and revision.
2. Show local/cloud attempt counts, cloud update time and source device, and the overwrite consequence.
3. Create a pending upload with the cloud revision the user reviewed.
4. Upload a compressed immutable snapshot to a private object key.
5. Validate schema, size, record relationships, checksum, and declared counts on the server.
6. In a PostgreSQL transaction, atomically make the new snapshot current only if the reviewed cloud revision is still current.
7. After commit, retire the replaced object and delete it when no in-flight download still holds a short-lived reference. Keep only bounded temporary transfer state.
8. Report success only after commit. Mark only the captured local revision as uploaded.

If another device uploads during confirmation or transfer, stop with a stale-version message and require a new explicit choice. Do not silently retry an overwrite against a changed destination. Retrying the same request ID must return the same result, not create duplicate saves.

Solves created after the captured revision remain local changes. They must not be falsely marked uploaded.

### Download

1. Show the exact cloud version, counts, and timestamp to be downloaded.
2. Warn that the operation replaces all current local solve history.
3. Fetch and validate the full snapshot before touching the active dataset.
4. Import into a staging dataset. For large files, process bounded chunks.
5. Verify integrity and create a recovery reference to the old dataset.
6. Under the local write lock, check the local revision still matches the one confirmed, then atomically switch the active dataset pointer.
7. Notify other tabs and update transfer metadata.

A failed download leaves current history intact. A newer unsupported schema produces an update-required message and changes nothing. Block transfers during active timing or an unsaved result.

**Confirmed retention:** one current cloud save per user. No ten-copy history and no user-facing version browser. During upload, the old current object and the pending new object coexist until validation and commit finish; delete the retired object after the bounded in-flight-download window. Expire abandoned uploads within 24 hours. The current save does not expire merely from inactivity. Temporary local staging and one pre-replacement recovery dataset protect transfers, not indefinite archival history. Independent infrastructure backups follow a separate operator recovery policy.

### Storage layout

Use PostgreSQL for users, linked identities, snapshot manifests, current snapshot pointers, upload status, idempotency keys, and deletion jobs. Use private S3-compatible object storage such as Cloudflare R2 for compressed history files.

This avoids placing hundreds of millions of solve rows in the cloud database when the feature only uploads and downloads whole histories. Local history remains indexed records. Server-side per-solve analytics can be added later if a real feature needs it.

Object storage and PostgreSQL do not share one transaction. Write and validate the immutable object first, then commit its database pointer. Uncommitted objects are cleaned up later. Garbage collection must never delete referenced snapshots.

Back up metadata and snapshot objects separately and verify that a restored manifest references recoverable objects. Supabase database backups do not include Storage API object contents. A single current save still needs independent disaster recovery. Ordinary database/object backups may contain older data until their retention period expires; this is distinct from maintaining ten selectable saves for each account. [Source: Supabase database backups.]

## Data model

| Record | Required concepts |
|---|---|
| Dataset | ID, schema version, monotonically increasing local revision |
| Round | Stable ID, event ID, ruleset, format, planned attempts, simulation settings, state, timestamps |
| Attempt | Stable ID, round ID, attempt number, raw elapsed time, penalties/status, input source, scramble reference, timestamps, edit revision |
| Scramble | Exact notation, event mapping, engine and renderer versions, generation metadata; drawing cache |
| Snapshot | Current cloud revision, dataset revision, creation time, source device label, counts, schema version, object key, digest |
| User | Stable application ID independent of email or WCA ID |
| Identity | Provider plus immutable provider subject linked to the application user |
| Device preferences | Language, input bindings, theme, scale, audio; excluded from time-history replacement by default |

Represent duration as integers with explicit units. Keep raw timing precision separately from the competition result precision. Store DNF and DNS as explicit statuses, never magic time numbers. Preserve additive penalties separately so toggling a penalty cannot overwrite the original result.

All included events have timed attempts. Do not build move-count or multi-blind result models for excluded events. Retain stable format and event identifiers so later changes can be migrated deliberately.

Treat best/worst possible round values and averages as derived values. The same core calculates them everywhere. Canonical scramble text remains permanent; SVGs are derived caches. Retain a supported way to render historical engine versions, or preserve their drawings where exact historical reproduction is required.

## Desktop behavior and event scope

The visible flow is Scramble → Waiting → Ready → Inspection → Solve → Record result → Next scramble, followed by round results.

Use explicit states for idle, preparing scrambles, showing scramble, waiting, ready, inspection, solving, result draft, saving, completed, interrupted, and recoverable error. The next action depends on the state. A single keyboard event must not accidentally advance through two states.

Keyboard timing starts only with Space. A hold-to-arm/release-to-start interaction may implement the Figma readiness flow; Enter or another key must never start timing. While solving, the first non-repeat keydown received by the active timer stops it, including Space. Browser/OS-reserved shortcuts may not reach the page. Consume the stop event so it cannot also submit a result, dismiss a dialog, or start the next solve. Ignore key repeats and composition events; keep the timer's start-release separate from stop-key handling. Scope shortcuts away from text fields and dialogs. Enter advances non-timing states or submits manual entry only. Manual entry is a required separate mode with validation and +2/DNF controls. Document the exact arming delay, focus-loss behavior, simulation waits, inspection, and audio defaults as implementation settings.

Use a monotonic clock for elapsed time, not the number of animation frames or interval callbacks. Rendering can slow down without changing the calculated result. Browser input latency and sleep behavior prevent promising hardware-timer accuracy. Detect interruptions, request wake lock when appropriate, and verify real hardware timing separately from fake-clock tests.

The current WCA event formats vary: the main speed events use Ao5, 6×6 and 7×7 use Mo3, 3×3 Blindfolded uses Best of 5, and 4×4/5×5 Blindfolded use Best of 3. Fewest Moves and Multi-Blind are excluded from this app. Result truncation and aggregate rounding also differ by duration. Implement a dated rules table rather than assuming every event is five timed solves. [Source: WCA Regulations, Articles 9 and A.]

**Confirmed exclusions:** Fewest Moves and Multi-Blind. **Confirmed inclusions:** Clock and FTO. The planned desktop scope therefore covers 16 events: 2×2 through 7×7, 3×3 One-Handed, 3×3/4×4/5×5 Blindfolded, Clock, Megaminx, Pyraminx, Skewb, Square-1, and FTO. Blindfolded inspection/memorization and round behavior still need explicit flow specifications.

Picker order: 2×2, 3×3, 4×4, 5×5, 6×6, 7×7, 3×3 One-Handed, 3×3 Blindfolded, 4×4 Blindfolded, 5×5 Blindfolded, Megaminx, Pyraminx, Skewb, Square-1, FTO, Clock. Use plain event names. Keep engine provenance in developer records and saved metadata.

Statistics for the first release should include round results, singles, event-separated history, Ao5/Mo3 as applicable, and the scorecard’s best/worst possible values. Define the latter mathematically, including DNF and incomplete rounds, before coding. Do not invent charts or comparison features from the “View all stats” button alone.

## Accounts, privacy, and translations

Accounts exist only for cloud saving. Use one application identity across every platform. Email/password, Google, and WCA are desired providers from the project brief; the exact first-release provider set remains open. Plan Sign in with Apple for the Apple release if social login is present.

Require verified account-linking flows. Do not merge identities solely because providers return the same email. Use standard OAuth state/PKCE where supported, platform-appropriate session storage, and server-side ownership checks. Never ship service-role keys or object-store credentials to clients.

Guest history has no server-side account owner until the user uploads it. Website asset requests still produce ordinary operational network logs, but local scramble generation needs no network request. Keep logs minimal and avoid recording complete solve histories, tokens, or unnecessary personal information.

Provide export and account deletion. Explain that deleting a cloud account and deleting this device’s local history are separate actions. Apply deletion to live snapshots and document backup expiration. Protect recovery backups from accidental reintroduction of deleted accounts.

Start with translation keys and a shared message catalog, using i18next or an equivalent ICU-capable approach. Use locale-aware plurals, dates, and numbers. Keep scramble notation unchanged. Use stable IDs in stored data rather than translated event names. Design for longer text and right-to-left layouts. Human cubers should review terminology before a language is called supported. Include tutorial captions/transcripts and error messages in translation scope.

### Authentication and password recovery

Use **Supabase Auth plus a production transactional-email provider** as the starting recommendation. Supabase manages credentials, verification, sessions, and recovery; the application owns cloud-save authorization and its user interface. Passwords are salted hashes managed by the auth provider, not plaintext fields in the app database. Supabase currently documents bcrypt. The application must not retain passwords, reset links, or session tokens in logs. [Sources: Supabase password-based auth; password security.]

Alternatives are Firebase Authentication, Clerk, Auth0, Amazon Cognito, self-hosted Supabase Auth, Better Auth, and Keycloak. Firebase fits Google infrastructure; Clerk emphasizes ready-made account flows; Auth0 offers extensive identity integration; Cognito fits AWS; Better Auth keeps a TypeScript auth library inside your backend; Keycloak is a separate identity server. Self-hosting gives control and operations experience, but makes upgrades, mail, abuse handling, monitoring, and recovery your responsibility. See app/docs/auth-and-observability.md for the comparison and implementation contract.

Signup requires email verification before cloud writes. Recovery shows a generic confirmation, uses the provider's expiring recovery flow, accepts a new password on an allowlisted callback page, and does not upload/download history. Configure and verify session revocation behavior after recovery. Provide change-password, change-email, sign-out, and account-deletion paths.

Supabase's default email service is for development, not production delivery. Configure SMTP through Resend, Postmark, or Amazon SES; verify the sending domain and SPF/DKIM/DMARC. Local email tests use the development mail catcher. Keep auth mail separate from marketing. Rate-limit signup/reset/resend endpoints, handle bounces, and test expired and already-used recovery links. [Source: Supabase SMTP.]

## Metrics, logs, and error reporting

The starter recommendation is **PostHog for product analytics, Sentry for errors, and structured Fastify/Pino server logs**. Treat this as three separate jobs: what people use, what breaks, and what the server did. Keep adapters disabled until their project settings are supplied. Guest solving never waits for telemetry.

| Metric | Definition |
|---|---|
| Observed DAU | Distinct opted-in browser installation IDs with at least one successfully persisted attempt on a UTC calendar day. |
| Observed MAU | Distinct opted-in browser installation IDs with at least one successfully persisted attempt in the trailing 30 UTC days. This is not a sum of DAU. |
| Active signed-in accounts | Distinct opaque account analytics IDs completing an attempt in the same windows, only with analytics consent. Never add this to browser counts. |
| Total accounts | Current non-deleted application accounts, including unverified accounts. Report verified accounts separately. Derived from the auth database, not analytics events. |
| New verified accounts | Accounts becoming verified during the reporting window, counted once. |
| Round usage | Started and completed rounds by event and input mode; completion rate uses a cohort of round starts and a defined completion window. |
| Activation and retention | First completed round is activation; D1/D7 retention is another completed round on exactly day 1/day 7 after that first round, among cohorts old enough to observe. |
| Cloud adoption | Accounts with a current committed save divided by verified accounts. |
| Cloud reliability | Committed uploads / accepted upload operations; validated/applied downloads / initiated downloads. Dedupe request IDs and distinguish cancellation, stale revision, and error. |
| Local reliability | Local-save failures, scramble failures, and startup/generation latency distributions from consenting clients. Counts never include solve contents. |
| Operations | API error rate, latency, transfer bytes, current object storage, email delivery failures, and backup/restore status. |

Browser IDs measure installations, not people. Clearing site data creates a new ID. A single person using multiple browsers can count multiple times; signed-in account metrics can deduplicate only consented signed-in activity. No fingerprinting or email-derived analytics IDs. Offline use, blockers, and people declining telemetry mean product metrics undercount real usage. Name dashboards **Observed activity**.

For version one, both product analytics and client error reporting are **off until the user opts in** through separate settings toggles. Do not block the first visit with an analytics wall. Disable autocapture, session replay, screenshots, form recording, and marketing integrations. Use explicit events with an allowlist: app version, event ID, input mode, duration bucket, coarse failure code, and a pseudonymous ID. Never send scramble notation, exact solve times, histories, email, passwords, authorization headers, or recovery URLs. PostHog supports opt-out controls and property filtering; configure them explicitly. [Source: PostHog privacy controls.]

Consented events may enter a separate bounded local outbox with event IDs and original occurrence timestamps. Cap it at 1,000 records or 7 days, whichever is reached first; discard oldest records and clear it when consent is withdrawn. Telemetry failure or quota pressure must not block or evict solve history. Separate staging/test projects from production. Dashboard data for the past seven days is provisional because offline events may arrive late.

Sentry reports sanitized exceptions with release/source-map context, event ID, flow state, and safe error codes. Apply a field allowlist before sending, not merely a promise to scrub later. No session replay or arbitrary attachments. Browser reports follow the diagnostics toggle; essential server-side operational errors follow the disclosed service-operations policy. Keep public browser ingestion keys separate from private source-map upload credentials.

Fastify/Pino logs use structured JSON with timestamp, severity, request ID, route template, status, latency, release, and safe error code. Do not record bodies, full URLs/query strings, tokens, cookies, email addresses, or histories. Keep bounded operator-only logs, initially 14 days, and rate-limit repeated errors. Use request IDs to join a failed transfer with its server error without exposing content. Pino provides configured redaction. [Source: Fastify logging.]

An external uptime check probes the deployed website/API. Alert on sustained server errors, failed backups, storage/budget thresholds, or a sudden rise in save failures. Start with one operational dashboard and one weekly product dashboard. Configure budget caps and alert destinations before enabling hosted telemetry. Instrumentation is a release requirement; live vendor dashboards depend on configured access.

## Hosting and costs

**Preferred first production arrangement**

| Component | Starting choice |
|---|---|
| Website and static assets | Cloudflare Pages with the custom domain |
| Cloud-save API | One small Dockerized Node.js/Fastify service on a VPS, such as DigitalOcean |
| TNoodle | Compiled local engine shipped as static website assets and later bundled in native apps |
| Authentication and metadata DB | Supabase Auth and PostgreSQL |
| Snapshot files | Private Cloudflare R2 bucket |
| Delivery | GitHub Actions, preview builds, isolated staging, production promotion |
| Monitoring | Explicit PostHog product events, Sentry error reporting, redacted Fastify/Pino logs, uptime and cloud-transfer metrics |
| Email | Production transactional email service for verification and password resets |

Cloudflare Pages static requests are free under the documented static-hosting model. Supabase Pro starts at $25/month. DigitalOcean lists 2 GiB/1 vCPU at $12/month and 4 GiB/2 vCPU at $24/month. These are reference prices, not measured cloud-save capacity. R2 Standard lists $0.015/GB-month, request charges, and no internet egress fee, with a free allowance. [Sources: provider pricing pages.]

**Planning budget:** roughly $35–65/month for an early public deployment including modest email, monitoring, and staging allowances, before domain fees, taxes, larger backup retention, or significant traffic. This is an estimate, not a quote. A production-like separate staging stack and stronger recovery objectives can raise it. Local generation removes per-scramble server CPU costs; a guest-only website milestone may fit within static-hosting allowances.

A self-hosted PostgreSQL option may reduce the managed database line item, but can require a larger VM and separate backup infrastructure. Its full cost is not automatically lower. The recommendation is to self-manage the stateless application server first and learn database operations in a test environment.

### Scale model

Tens of thousands of registered accounts are not the same as tens of thousands of simultaneous users. Local timing means most solves create no database traffic. The major variable costs are snapshot size/retention, transfer frequency, email, and operational support. Scramble CPU runs on the user's device.

Illustrative assumptions, not measured usage:

- 50,000 cloud users × 10,000 stored attempts each = 500 million attempts.
- At 1 KB raw structured data per attempt, one full copy across users is about 500 GB.
- If compression reaches 4:1, the current snapshots total about 125 GB.
- One current save per user totals about 125 GB before metadata, transient transfers, and infrastructure backups.
- R2 storage at the listed rate would be about $1.88/month before its free allowance and operation charges.

That estimate excludes stored SVG drawings and assumes uniform histories and compression. Measure real records, big-cube notation, and transfer patterns before setting quotas. A small fraction of heavy users can dominate storage.

Start with bounded full snapshots and streaming/chunked processing. If large histories make repeated full uploads expensive, add chunked content reuse behind the same overwrite semantics. Do not introduce automatic merge or a distributed synchronization engine to optimize transfer size.

Scale the cloud API using measured transfer concurrency, latency, CPU, memory, and connection-pool usage. Add another instance and load balancing when required. PostgreSQL metadata and object storage can scale separately. Kubernetes, Kafka, and database sharding are not initial requirements.

## Environments and release process

| Environment | Plain-language purpose | Data policy |
|---|---|---|
| Local development | Brandon’s working copy, running on his computer | Synthetic fixtures and test accounts |
| Pull request preview | Temporary website to review one proposed change | Mocks or isolated test backend; never production cloud saves |
| Staging | A stable rehearsal environment using production-like services | Separate auth project, DB, bucket, credentials, and domain |
| Production | cubingcompsim.com and real user accounts | Real data; controlled deployments and recovery procedures |

GitHub stores code, specs, migrations, and test fixtures. It does not store production passwords or users’ solve histories.

A pull request runs automated checks and produces a preview. After review, deploy the same build artifact to staging, verify critical flows, then promote it to production. Record a release version and retain the previous build.

A frontend rollback must still understand the database schema it encounters. Use additive changes and backward-compatible readers; do not assume redeploying old JavaScript reverses an IndexedDB migration. Keep older mobile clients compatible with the API until their documented minimum-version boundary.

Do not force a page reload during a solve. Apply updates between rounds. Infrastructure definitions, configuration examples, and restore instructions belong in the repository, with secrets outside it.

## Verification and acceptance gates

Use Vitest for TypeScript core tests, JUnit for the JVM reference engine, real database/container integration tests, and Playwright for browser flows. Run Chromium, Firefox, and WebKit automation, then test actual Safari on macOS and actual Chrome/Edge on Windows. Playwright WebKit is not the Safari application. [Source: Playwright browsers.]

| Gate | Required evidence before public launch |
|---|---|
| Guest use | Fresh browser completes a round and reopens its history without an account. |
| Timing | Deterministic input/clock fixtures pass; real-device trials cover repeat keys, focus changes, slow rendering, sleep, and rapid start/stop. |
| Rules | Boundary fixtures cover scoring, result precision, +2 handling, DNF/DNS, incomplete rounds, and each enabled event format. |
| Scrambles | Pinned engine and renderer pass per-event fixtures and reference comparisons. Unsupported events cannot fall back silently. |
| Save failure | Quota or transaction failure keeps the pending result visible and never reports success. |
| Crash recovery | Closing at each flow boundary preserves committed results and the selected scramble; interrupted running solves are explicit. |
| Migrations | Older datasets survive upgrade; failed migration preserves recoverable data. |
| Multiple tabs | Two tabs cannot silently write incompatible active rounds or switch datasets underneath an unguarded writer. |
| Upload retries | Repeated request IDs commit once; failed validation never replaces current cloud history. |
| Cross-device conflict | Concurrent uploads detect changed cloud revision and require a fresh overwrite choice. |
| Download recovery | Truncation, bad checksum, unknown schema, out-of-space, or interruption leaves the previous active dataset usable. |
| Authorization | One account cannot read, overwrite, or delete another account’s snapshots, even with a guessed ID or altered request. |
| Account flows | Sign-in, sign-out, account linking, expired sessions, reset emails, and deletion have tested outcomes. |
| Cross-platform contract | Reference snapshot fixtures preserve IDs, times, penalties, rounds, and notation through every supported adapter. |
| Large history | Test 100,000 attempts as a routine stress fixture and 1 million as a stretch fixture; publish supported limits only after measurement. |
| Visual and language | Figma target layouts, zoom, keyboard focus, screen-reader labels, long translations, and RTL are checked. |
| Recovery operations | Restore metadata and objects into an isolated environment and prove the restored histories open. |
| Offline | After app restart with network disabled and no prefetched scrambles, every included event generates and draws fresh scrambles. |
| Load | Measure cloud-save transfer concurrency and local generation performance independently; verify rate limits on cloud endpoints. |

Draft performance targets: home usable within 2 seconds on a defined reference desktop/network; 95% of local result commits within 100 ms on that reference system; no scramble generation on the UI thread; no full-history scan to display the current scorecard. These are proposed acceptance targets, not measured performance claims.

Draft operational targets: 99.9% monthly cloud API availability after hardening; recovery of cloud service within 4 hours; at most 24 hours of metadata loss in a major disaster under daily-backup-only operation. A single VM and a $40 budget do not guarantee those targets. If a 24-hour recovery point is unacceptable, add point-in-time recovery and coordinated object protection before launch. Successfully committed snapshots should remain immutable in normal operation.

Monitor local-save failure counts without uploading their contents, snapshot failures, schema mismatches, local scramble failures through opt-in diagnostics, auth email failures, and storage growth. Alert on abnormal rates. A small application still needs an owner for incidents and restore drills.

## App Store and native release path

Native release is a later phase, not a button that converts the website.

1. Choose the native UI approach and design touch/tablet interactions.
2. Implement native storage, input, lifecycle, file sharing, and credential adapters.
3. Run the common rule/save fixtures, then test real devices.
4. Enroll developer accounts and configure signing.
5. Distribute beta builds.
6. Complete store listings and privacy disclosures.
7. Submit the signed builds for review, fix any review issues, and release gradually.

**Apple:** Developer Program enrollment is generally $99/year. Individual enrollment shows the individual’s legal name as seller; organizations have entity verification requirements. Use Xcode/build tooling and App Store Connect, test through TestFlight, supply review access to cloud features, and submit for review. Approval is not guaranteed by using a particular framework. [Sources: Apple enrollment, upload builds, TestFlight.]

Apple requires an in-app account-deletion initiation path for apps with account creation. If the app offers third-party primary-account login, Guideline 4.8 requires an equivalent privacy-preserving login option unless an exception applies. Plan Sign in with Apple rather than assuming email/password makes that requirement disappear. [Sources: Apple account deletion; App Review Guidelines.]

**Google Play:** registration is currently a $25 one-time fee. New personal developer accounts created after November 13, 2023 must complete a closed test with at least 12 continuously opted-in testers for 14 days before applying for production access. Also plan identity/device verification, Android App Bundle signing, internal testing, Data safety disclosures, privacy policy, account deletion in-app and through a web resource, and target-API compliance at submission time. [Sources: Play Console registration, testing, deletion requirements.]

**Mac:** choose the Mac App Store or direct distribution. Direct distribution needs the appropriate signing/notarization process; store distribution has its own submission and sandbox requirements. **Windows:** choose signed direct installation and/or Microsoft Store packaging and certification. Validate architecture support and update behavior separately on each OS.

Store rules, SDK requirements, and fees can change before the native phase. Recheck them at that phase instead of freezing today’s checklist as a permanent rule.

## Delivery stages

| Stage | Deliverable | Exit condition |
|---|---|---|
| 0. Record decisions | Website first; Space start/any-key stop/manual entry; upstream FTO; Clock last; one cloud save | Confirmed October 8, 2026; implementation authorized |
| 1. Offline engine | Compile local TNoodle; compare every event/drawing with JVM; prove cache-complete offline reopening | Required before public release; build independent website/core work in parallel |
| 2. Desktop local product | Guest simulator, supported events, Figma UI, history, file backup, translation structure | Timing/scoring/storage acceptance gates pass |
| 3. Cloud service | Auth, one-save uploads/downloads, deletion, metrics, logs, error reporting | Authorization, conflict, retry, delivery, and restore gates pass |
| 4. Desktop beta | Production-like staging, representative cubers, Windows/Mac browser checks | Reported blockers fixed; performance and capacity measured |
| 5. Website launch | Controlled production release, support and incident process | Rollback and recovery rehearsed |
| 6. Native apps | New platform designs and adapters, contract parity, store betas | Platform-specific acceptance and store review |

Implementation is authorized. Track actual completed work and remaining gates separately; the website must not be described as fully offline-ready until every included event passes the offline gate.

## Confirmed decisions and remaining setup

| Decision | Recommended starting answer | Why it matters |
|---|---|---|
| Meaning of native | Confirmed: React Native is acceptable; platform languages not required | Defer native project setup until the web product is stable. |
| Offline scrambles | Confirmed: unlimited local generation | Compiler/runtime feasibility and distribution licenses must be verified. |
| Desktop scope | Website first; installed Mac/Windows apps later | Prevents conflating desktop layout work with native packaging. |
| Events | Confirmed: upstream FTO accepted; Clock last with ordinary label; exclude FMC/Multi-Blind | Verify each local engine path. |
| Timer input | Confirmed: Space only to start, any key to stop, plus manual entry | External hardware timers are outside the first release. |
| Backend operations | Own a TypeScript/Fastify API; use managed auth/PostgreSQL initially | No JVM production server is needed for local scrambling. |
| Source/license model | Decide whether the application/backend will be open source | TNoodle reuse and future binary distribution need an explicit policy. |
| Cloud scope | Replace times and round metadata across all events; keep device settings local | Gives upload/download one unambiguous meaning. |
| Data recovery | Confirmed: one current save; temporary atomic-transfer copies and normal infrastructure backups | No ten-version history feature. |
| Languages | Externalize everything; select launch languages with human reviewers | Shipping translations requires terminology and layout QA. |
| Simulation settings/statistics | Write exact waiting, readiness, inspection, input, and stats rules | Figma states do not define calculation or transition behavior. |

The main technical gate is the exact local TNoodle engine, including FTO. Unlimited offline generation cannot be replaced by a server fallback or finite scramble pool. Service account access is needed for production cloud features, not for the local website build. See app/docs/access-setup.md for the concrete setup list.

## Source references

Official and upstream sources checked October 8, 2026. Provider costs and store policies should be rechecked before purchase or release.

- [Figma desktop review](https://www.figma.com/design/c5ylKAVo0HCpGk7la0de1w?node-id=44-2)
- [WCA Scrambles and approved program](https://www.worldcubeassociation.org/regulations/scrambles/)
- [WCA Regulations](https://www.worldcubeassociation.org/regulations/)
- [WCA event-list changes](https://www.worldcubeassociation.org/posts/changes-to-the-wca-s-list-of-official-events-june-2026)
- [TNoodle repository](https://github.com/thewca/tnoodle)
- [TNoodle 1.2.3 dependency manifest](https://github.com/thewca/tnoodle/blob/v1.2.3/gradle/libs.versions.toml)
- [TNoodle library](https://github.com/thewca/tnoodle-lib)
- [TNoodle Puzzle.java at 0.19.2](https://github.com/thewca/tnoodle-lib/blob/v0.19.2/scrambles/src/main/java/org/worldcubeassociation/tnoodle/scrambles/Puzzle.java)
- [csTimer storage and export behavior](https://github.com/cs0x7f/cstimer#data-storage)
- [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [Dexie transactions](https://dexie.org/docs/Dexie/Dexie.transaction())
- [React Native components](https://reactnative.dev/docs/intro-react-native-components)
- [React Native platforms](https://reactnative.dev/docs/out-of-tree-platforms)
- [Flutter architecture](https://docs.flutter.dev/resources/architectural-overview)
- [Kotlin Multiplatform native template](https://github.com/Kotlin/KMP-App-Template-Native)
- [Tauri](https://tauri.app/start/)
- [Vite](https://vite.dev/guide/)
- [Ktor](https://ktor.io/docs/ktor-server.html)
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Supabase custom OAuth providers](https://supabase.com/docs/guides/auth/custom-oauth-providers)
- [WCA API](https://www.worldcubeassociation.org/help/api)
- [Cloudflare Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase backups](https://supabase.com/docs/guides/platform/backups)
- [DigitalOcean Droplet pricing](https://www.digitalocean.com/pricing/droplets)
- [Playwright browsers](https://playwright.dev/docs/browsers)
- [Apple enrollment](https://developer.apple.com/help/account/membership/program-enrollment/)
- [Apple build uploads](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
- [TestFlight](https://developer.apple.com/testflight/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- [macOS notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Google Play registration](https://support.google.com/googleplay/android-developer/answer/6112435)
- [Google Play testing](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)

- [TeaVM](https://teavm.org/)
- [TeaVM compatibility limits](https://teavm.org/docs/intro/overview.html)
- [TNoodle historical browser discussion](https://github.com/thewca/tnoodle-lib/issues/12)
- [TNoodle FTO implementation](https://github.com/thewca/tnoodle-lib/pull/52)
- [TNoodle library build version](https://github.com/thewca/tnoodle-lib/blob/master/build.gradle.kts)
- [TNoodle library modules](https://github.com/thewca/tnoodle-lib/blob/master/settings.gradle.kts)
- [TNoodle library registry](https://github.com/thewca/tnoodle-lib/blob/master/scrambles/src/main/java/org/worldcubeassociation/tnoodle/scrambles/PuzzleRegistry.java)
- [Archived iOS native fork](https://github.com/CubeLabsNZ/tnoodle-lib-native-v1)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Fastify](https://fastify.dev/docs/latest/)


- [Supabase password-based auth](https://supabase.com/docs/guides/auth/passwords)
- [Supabase password security](https://supabase.com/docs/guides/auth/password-security)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Firebase email/password](https://firebase.google.com/docs/auth/web/password-auth)
- [Firebase user management](https://firebase.google.com/docs/auth/web/manage-users)
- [Clerk authentication options](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options)
- [Auth0 password recovery](https://auth0.com/docs/authenticate/database-connections/password-change)
- [Cognito password recovery](https://docs.aws.amazon.com/cognito/latest/developerguide/managing-users-passwords.html)
- [Self-hosted Supabase Auth](https://supabase.com/docs/guides/self-hosting/auth/config)
- [Better Auth email/password](https://better-auth.com/docs/authentication/email-password)
- [Keycloak administration](https://www.keycloak.org/docs/latest/server_admin/)
- [MDN Navigator.onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)
- [PostHog privacy controls source](https://github.com/PostHog/posthog.com/blob/master/contents/docs/product-analytics/privacy.mdx)
- [Sentry client filtering](https://www.sentry.help/en/articles/13965217-javascript-how-do-i-filter-events-based-on-the-entire-stack-trace)
- [Fastify logging](https://fastify.dev/docs/latest/Reference/Logging/)
- [Plausible custom events](https://plausible.io/docs/custom-event-goals)
- [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/)


## October 9 implementation follow-up

The web interface now has 16 complete draft locale catalogs. See [language coverage](languages.md) for exact scope and review requirements. Device language stays local; portable saves keep stable event IDs and integer time values. Mandarin voice selection supports Simplified and Traditional Chinese interfaces.

Inspection audio now offers installed local device speech with beeps as the default/fallback. Consistent recorded voice packs still need reviewed redistributable assets. Background audio has a streamed player and validated catalog; actual competition recordings remain an asset task. See [audio assets](audio-assets.md). These changes do not make scramble generation or timing depend on the network.

See [preview and environments](preview-and-environments.md) for the guest-preview-first account checklist, Namecheap DNS relationship, staging/production isolation, and provider roles. No hosted deployment is asserted by this specification.
