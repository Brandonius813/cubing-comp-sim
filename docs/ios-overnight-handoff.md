# Cubing Comp Sim: overnight iPhone and iPad implementation

Prepared October 20, 2026 UTC. This is an execution handoff, not evidence that the app is complete.

## 1. Mission and owner instructions

Build as much of the complete Apple app as possible and leave a coherent, tested implementation for Brandon to review in the morning. Implement working features, integrate them, and publish reviewable branches/PRs. Do not spend the session producing another plan or disconnected scaffolding.

The handoff-writing chat was explicitly told **not to build anything**. That restriction applies to preparation of this document. The next chat should implement and test when Brandon supplies the accompanying execution prompt.

- Ship iPhone and iPad first. Android and Google Play work are deferred.
- Use React Native and Expo, retaining the existing website and shared rules/backend.
- The three separate pages are **Scorecard | Practice | Settings**, left to right. Practice is the initial page. This applies to iPad as well as iPhone.
- Support horizontal swipes and visible, accessible tap navigation. Settings includes accounts and cloud saves.
- Keep all 16 events, fresh offline TNoodle scrambles, and drawings. The native engine runtime may change if necessary.
- Add Sign in with Apple to web and native, with actual account deletion and token revocation support before enabling it.
- Guest practice must work without signing in. Signing in must never automatically upload, download, merge, or replace local history.
- Make routine implementation decisions independently. Record assumptions and owner-only blockers, then continue useful independent work while Brandon sleeps.
- Preserve existing work. No destructive resets, force pushes, production data changes, or automatic merges to main.
- Default spending authorization is **$0**. No paid upgrades, usage charges, or purchased services. A cloud preview build is appropriate only if the existing free allowance can be confirmed.
- Prepare for review, not public release: do not deploy production changes, submit to App Review, or publish the app during this overnight pass. Prepare the submission materials and identify what remains.

Earlier instructions requiring a pause at every small checkpoint do not override Brandon's explicit request for substantial autonomous implementation. Read current repository guidance and project notes, preserve safety and correctness requirements, and record meaningful unresolved product decisions for morning review.

## 2. GitHub entry points and current checkpoints

Repository: https://github.com/Brandonius813/cubing-comp-sim

| Item | Starting point | Purpose |
| --- | --- | --- |
| Apple launch tracker | [#36](https://github.com/Brandonius813/cubing-comp-sim/issues/36) | Scope and release gates |
| Mobile foundation | [PR #43](https://github.com/Brandonius813/cubing-comp-sim/pull/43), `feat/mobile-foundation` | Native shell, engine bridge, SQLite, Expo setup |
| Apple preparation | [PR #42](https://github.com/Brandonius813/cubing-comp-sim/pull/42), `feat/apple-sign-in` | Gated web provider support and revocation design |
| Screens and practice | [#37](https://github.com/Brandonius813/cubing-comp-sim/issues/37) | Native experience |
| TNoodle | [#38](https://github.com/Brandonius813/cubing-comp-sim/issues/38) | Runtime, correctness, performance, license |
| Persistence and feature parity | [#39](https://github.com/Brandonius813/cubing-comp-sim/issues/39) | History, audio, cloud |
| Apple authentication | [#40](https://github.com/Brandonius813/cubing-comp-sim/issues/40) | Login and revocation |
| Device and store acceptance | [#41](https://github.com/Brandonius813/cubing-comp-sim/issues/41) | Build, testing, submission preparation |

Mobile implementation checkpoint before this documentation commit: `c6d1359`. Apple preparation checkpoint: `ee0aee1`. Fetch the branches and inspect their current heads; these are historical anchors, not instructions to discard subsequent work.

Read `PROJECT_NOTES.md`, `docs/mobile-roadmap.md`, `docs/mobile-testing.md`, `docs/mobile-engine.md`, `mobile/README.md`, and `docs/apple-sign-in.md` on the Apple branch. Older website handoff and roadmap sections contain dated/deferred scope; current source and this Apple-only task take precedence.

## 3. First actions: establish one integration branch

1. Inspect checkout status, current instructions, remotes, open PRs, and active work. Preserve uncommitted changes and other agents' branches.
2. Fetch current `main`, `feat/mobile-foundation`, and `feat/apple-sign-in`.
3. Create an isolated integration branch, for example `feat/ios-review-ready`, containing the mobile foundation and current main. Integrate the Apple preparation deliberately, checking for already-applied changes.
4. Read and retain recent web fixes before implementing mobile parity. Main moved after the mobile foundation was created.
5. Inspect package scripts, CI workflows, environment examples, and actual tooling. Do not assume Java, Xcode, Simulator, or live backend credentials are available.
6. Establish a short task board, ownership boundaries, and a baseline verification result. Start coding after this inspection; do not turn discovery into a second architecture project.

Recent merged PRs observed at handoff: #44 Back navigation and immediate wait persistence; #45 OAuth callback/provider-conflict fixes; #46 Back-entry timing and removal of Mo3R; #47 zero default hold-to-start; #49 language switching and inspection penalty corrections; #50 typed inspection entry and unified penalty controls; #51 updated release checks. PR #48 was closed, not merged. Recheck latest main for additional changes.

In particular, the old mobile 550 ms hold default must not silently replace the newer zero-delay default. Preserve explicit inspection correction behavior and do not reintroduce removed statistics.

## 4. Owner setup: what is and is not ready

- Personal publisher: Brandon True. Apple Developer enrollment is paid; owner confirmed App Store Connect opens.
- Expo owner: `brandonius813`. Another accessible account is `brandon-true`; do not create a second project there.
- Existing EAS project: `52c0c6ad-0940-4756-9376-f29c88631aea`.
- [Expo project dashboard](https://expo.dev/accounts/brandonius813/projects/cubing-comp-sim).
- Existing application identifier: `com.cubingcompsim.app`; scheme: `cubingcompsim`.
- iPhone 14 Pro and iPad Pro were registered. Remote ad hoc preview credentials reported an active profile containing both devices.
- Noninteractive credential inspection did not independently validate credentials against Apple's servers. Ad hoc credentials do not establish App Store distribution signing, an App Store Connect app record, or submission credentials.
- Remote iOS build number was initialized to 1 during an attempted preview submission.
- That attempt was stopped at the owner's request. A subsequent process check found no EAS upload process, and `eas build:list --platform ios --limit 3 --json --non-interactive` returned `[]`. No native build or install link exists from this session.
- Sign in with Apple keys/service IDs and native capabilities are not proven configured. Inspect available configuration without printing secrets.
- No Android device is required for this pass. Do not ask Brandon to repeat enrollment or device registration.

Never put device UDIDs, signing files, tokens, private keys, certificate metadata, or real user records into the public repo, PRs, screenshots, or logs.

## 5. What already exists and what remains

| Area | Existing foundation | Required overnight work |
| --- | --- | --- |
| Navigation | Three native pages, center initial, navigation locks | Polish layout, accessibility, safe areas, keyboard and tablet behavior |
| Practice | Timed/manual flow, inspection, penalties, shared scoring | Current web parity, Back behavior, waits, audio, interruptions, durable active draft |
| Storage | Atomic SQLite snapshot, settings and confirmed attempts | Migration/recovery, active drafts, editing, import/export, capacity behavior |
| Engine | Bundled TNoodle in isolated WebView, typed bridge | Cold-start performance, actual runtime evidence, clean errors and retry |
| Scorecard | Basic rounds | Current history/statistics/goal parity and safe editing |
| Accounts/cloud | Explicit unavailable UI | Native sessions, supported login, explicit upload/download, deletion |
| Apple web | Gated provider preparation | Token capture/revocation, current main integration, verified enablement |
| Release | Expo project, preview signing setup, CI scaffolding | Native build if feasible, device checklist, store materials and honest blockers |

Existing mobile dependencies include Expo 57.0.30, React Native 0.86.3, React 19.2.3, SQLite, WebView, SVG, pager, safe-area and keep-awake packages. These are checkpoint facts. Check compatibility before dependency changes; do not blindly upgrade everything.

## 6. Parallel work and integration ownership

If parallel agents are available and authorized by the execution prompt, assign separate worktrees/branches and bounded deliverables. The coordinator owns root/mobile manifests, lockfiles, CI, shared contracts, and final application orchestration. Agree on interfaces before overlapping changes.

Suggested tracks:

1. Engine: WebView runtime, bundling, performance, conformance, license research.
2. Practice and UI: page layout, touch flow, current rules, waits and audio.
3. Persistence and scorecard: migrations, active draft, history, export/import.
4. Authentication and cloud: native adapter, Apple grant lifecycle, backend tests.
5. Release review: dependency advisories, build feasibility, metadata drafts, accessibility and acceptance review.

Use fewer agents if that reduces integration conflicts. Each agent returns changed files, commits, tests actually run, and unresolved risks. Integrate continuously rather than waiting until the end to discover incompatible APIs. No agent should modify another agent's checkout.

## 7. Priority A: complete the competition experience

1. Inventory the current web feature set against mobile and record differences before porting.
2. Keep competition rules, scoring, formats, parsing, and validated transfer contracts shared. Avoid a second native rules implementation.
3. Make the central page immediately usable: choose event, see scramble/drawing, inspect, time or type a result, review penalties, confirm, advance, finish round.
4. Implement fixed/random waits and persist edits immediately. Preserve Back navigation semantics without accidentally starting timing or duplicating results.
5. Match the current hold-to-start setting and zero default. Cancel arming on gesture cancellation, significant movement, or extra fingers. Separate paging gestures from timing interactions.
6. Use monotonic timing. Backgrounding, lock, interruptions and stale callbacks must not create a valid fabricated solve. Make interrupted state explicit and recoverable under documented rules.
7. Keep navigation locked only where changing pages can corrupt inspection/timing/commit; make disabled state understandable. Avoid trapping the user after an error.
8. Complete manual entry, unified penalty controls, allowed inspection corrections, invalid-input handling, round abandonment and duplicate-save prevention.
9. Bundle the approved inspection recordings and assets. Verify native playback, timing, language selection, audio interruption and cleanup. Do not introduce remote-only audio, unlicensed ambience, or an unsolicited beep fallback.
10. Port current themes, fonts, goals and language settings where feasible. A selected language must update the full screen rather than only isolated labels. Document translation gaps honestly.

Acceptance: a guest can complete rounds in every supported event and both input modes; state transitions preserve correct penalties and results; waiting, Back and retry actions cannot double-save or lose a confirmed solve.

## 8. Priority A: durable local data and usable scorecard

1. Inspect `mobile/src/storage.ts`, `practice.ts`, shared storage validation, and the web snapshot schema before extending them.
2. Preserve atomic replacement and versioned migrations. Validate an imported/cloud snapshot completely before mutating current data.
3. Persist settings, confirmed attempts, unfinished rounds, and enough active-draft state for safe process-death recovery. The foundation did not durably save every running/review attempt or unused scramble.
4. Define which interrupted stages resume versus require explicit recovery. Do not resume a running solve as though no interruption happened.
5. Preserve scramble text, engine provenance, penalties and timestamps. Do not invent results during migration.
6. Build scorecard/history with current statistics and editing behavior. Preserve the removal of Mo3R. Use bounded rendering for large histories.
7. Implement local export/import with native file/share affordances, validation, explicit replacement confirmation and a recovery copy consistent with the existing design.
8. Ensure logout and account deletion do not unexpectedly erase local guest history. Explain any explicit local-clear action separately.

Acceptance: reload and process restart recover safe state; invalid imports leave data unchanged; failed replacement rolls back; history edits retain valid scoring; repeated taps cannot create duplicate attempts.

## 9. Priority A: TNoodle correctness and performance

Current design: pinned Java TNoodle compiled through TeaVM to an ES2015 module, bundled into an isolated local WebView. No remote scramble endpoint. `mobile/src/engine/` contains the host, protocol, service and runtime. `mobile/scripts/engine-bundle.mjs` verifies root engine files and creates the ignored generated asset.

1. Read the engine contracts and tests before changing the runtime. Preserve secure randomness, event validation, request correlation, bounded queue, cancellation/reset behavior and error propagation.
2. Reproduce cold and warm latency in the actual native WebView when possible. An earlier Node-host run took **176.046 seconds for cold 4x4**, 8.328 seconds for 4BLD, and 5.132 seconds for FTO. These are warning evidence, not device measurements.
3. Profile initialization and table generation. Investigate valid caching, warmup, runtime architecture or a properly ported engine. Keep the UI responsive and make progress/failure visible.
4. Do not hide the problem by raising timeouts alone, dropping events, using a finite bank, substituting another scramble algorithm, or silently generating weaker randomness.
5. Preserve fresh offline generation and valid drawings for all 16 events. No network access or user secrets inside the engine WebView.
6. Run JVM reference and generated-engine conformance for the exact artifact. The earlier local mobile run exercised all events but had **zero JVM fixtures available**; it was smoke evidence only.
7. If a runtime change is needed, document its correctness proof, distribution implications, performance and migration cost. Prefer measurable improvement over speculative rewrites.
8. Investigate TNoodle GPL-3.0/App Store distribution compatibility using authoritative sources. Record concrete options and unresolved owner/legal decisions. Do not claim that a public repo alone clears distribution rights. This is a release gate, not a reason to abandon unrelated implementation.

Acceptance: matching provenance and reference evidence, no silent fallback, offline runtime coverage, measured cold/warm latency, responsive interactions, and a clearly recorded distribution decision or blocker.

## 10. Priority B: real accounts, Apple login and cloud saves

1. Reuse the existing API and snapshot contracts. Inspect current main's OAuth callback/provider-conflict fixes before integrating PR #42.
2. Implement a native auth adapter with supported secure session storage, callback/deep-link handling, cancellation, refresh and expired/revoked-session behavior. Use appropriate nonce/state validation for the chosen Apple flow.
3. Keep unsupported/unconfigured providers hidden or explicitly unavailable. Never ship a button that pretends to authenticate.
4. Integrate Sign in with Apple for web and native using the actual configured client IDs and redirect contracts. Preserve provider identity boundaries; never merge accounts solely because email addresses match, including Hide My Email cases.
5. Complete backend Apple grant capture and protected retention sufficient for revocation. Existing browser code strips provider access/refresh tokens, and deleting the Supabase user alone does not revoke an Apple grant.
6. Implement authenticated account deletion, Apple revocation, retries/failure recovery and server-side cleanup. Keep credentials server-side and avoid logging grants or tokens.
7. Preserve the release guard that prevents Apple enablement before revocation readiness. Do not remove the guard simply to get a green build.
8. Implement explicit upload and download replacement, clear status/last-save information, confirmation before destructive replacement, safe retry and account-bound authorization.
9. Test two synthetic accounts and local/remote divergence where a staging environment is available. Login alone must transfer nothing. Invalid or failed download must preserve local history.
10. If credentials or a staging service are unavailable, complete code, contracts and meaningful tests; leave provider enablement gated and list the exact remaining setup. Do not invent environment values or deploy production to obtain test evidence.

Acceptance: guest practice remains independent; sessions and cancellation work; cross-account access is denied; explicit cloud transfers are atomic; deletion/revocation behavior is demonstrated or honestly blocked.

## 11. Priority B: native polish and accessibility

- Review iPhone safe areas, keyboard avoidance, touch targets, contrast, larger text and screen-reader labels/actions.
- Review iPad portrait/landscape and resized windows; do not assume an exact iPad model or fixed screen width.
- Keep pages separate, avoid desktop-style overcrowding, and make the center screen visually dominant.
- Prevent long scramble text/drawings from clipping. Make loading, empty, offline and error states understandable.
- Use real rendered screenshots if the environment permits. Do not present generated mockups as screenshots of implemented UI.
- Reuse the existing identity/assets and polish consistency without replacing the product with an unrelated design.

## 12. Verification and build workflow

Inspect current scripts first. Typical commands from the checkpoint:

```sh
# Repository root
npm ci
npm run typecheck
npm test
npm run engine:verify

# mobile/
npm ci
npm run prepare-engine
npm run typecheck
npm test
npm run export:ios
```

`engine:verify` requires the documented Java/Maven toolchain and produces reference/artifact evidence. Read the workflows for exact prerequisites. Do not treat `build:ui`, an Expo JS export, or a Node engine test as a native build or physical-device test.

1. Verify changed domain and storage behavior with focused meaningful tests, then integration checks covering the assembled app. Recheck website and server behavior when shared code changes.
2. Reproduce and fix current dependency advisories without blind `npm audit fix --force`, old-Expo downgrades or suppressing the audit gate. Historical blockers were braces 3.0.3 (GHSA-vfj7-8cjw-p6xm) and node-forge 1.4.0 (GHSA-86w9-cpqp-85rv); check current authoritative advisory/registry data rather than assuming patches exist or do not exist.
3. Preserve Metro's root/shared-source resolution while resolving React/RN from mobile dependencies. An earlier broad `disableHierarchicalLookup` change hid Expo dependencies; avoid reintroducing it.
4. Verify the EAS archive includes generated engine assets and provenance even though generated files are ignored by Git. A fresh clone must have a reproducible preparation path.
5. Root `.easignore` intentionally includes `public/engine/` and `mobile/assets/engine.generated.ts`. A prior archive inspection found the required engine files and no private signing files, but recheck after changes.
6. Inspect Xcode/Simulator availability. Neither was verified available in the earlier environment. If unavailable, complete all feasible static/export/CI work and report the native gap.
7. Inspect existing EAS builds and free quota before starting another. Reuse a relevant build; avoid concurrent/repeated cloud submissions. If zero-cost availability cannot be established, leave the exact command for Brandon.
8. For a confirmed free preview build, use the existing `preview` internal distribution profile and current credentials. Do not regenerate/revoke credentials unnecessarily. Capture the build ID, commit, outcome and install URL only if real.
9. Wait or poll within the tool's supported limits, check failures, fix actual compilation problems and retry only when justified and within confirmed free allowance.
10. A simulator build, ad hoc preview, TestFlight upload and App Review submission are separate milestones. Label each accurately. Do not submit for review in this pass.

Relevant EAS commands from `mobile/` (check installed CLI help if needed):

```sh
npx --no-install eas-cli@latest build:list --platform ios --limit 3 --json --non-interactive
npx --no-install eas-cli@latest build:inspect --platform ios --profile preview --stage archive --output /tmp/ccs-ios-review-archive
# Only after confirming zero-cost allowance and readiness:
npx --no-install eas-cli@latest build --platform ios --profile preview --non-interactive --freeze-credentials --no-wait --json
```

The last environment had cached EAS CLI, and networked GitHub/npm operations worked through the available Node runtime while some shell network calls failed. Recheck tools in the new chat. Use supported authenticated connectors/CLIs; do not bypass access controls, print environment secrets, or repeatedly run a known-blocked operation.

Historical checks: mobile TypeScript, 18 mobile tests and JS exports passed; web 226 tests passed at its earlier checkpoint. Apple preparation had 231 web tests, 19 deploy checks and 23 server checks passing, with a PostgreSQL integration check skipped without its database URL. These counts do not establish current integration health. Re-run applicable checks and record the actual commit.

## 13. Store preparation without publication

Create reviewable drafts based on implemented behavior and current official Apple/Expo requirements:

- App name, subtitle, description, keywords, category, version/release notes, and review notes.
- iPhone/iPad screenshot capture plan and actual captures where available.
- Support and privacy policy requirements; use known valid project details, marking missing owner information rather than publishing placeholder legal text.
- Data inventory covering accounts, cloud history, telemetry and third-party SDKs, to support accurate App Privacy answers.
- Account deletion, Apple login, offline operation, age-rating and export-compliance review items.
- App Store Connect record, production signing and submission configuration checklist. Do not assume preview signing proves these are complete.
- A brief path from morning approval to device testing, TestFlight, final acceptance and App Review submission.

Do not fabricate privacy declarations, support contact details, test accounts, license approval, screenshots or test results. Keep private review credentials out of GitHub.

## 14. Required morning deliverables

1. Push the integrated implementation and open/update reviewable PRs, with focused commits and a clear primary review branch. Do not merge main automatically.
2. Add **`docs/ios-morning-review.md`** on that branch and link it from tracker #36.
3. Include a feature table marked **complete / partial / blocked**, with concrete remaining work. “Complete” must match evidence, not just the presence of a screen or stub.
4. List exact commits, checks run, results, skips and environment limitations. Separate unit tests, reference conformance, JS export, native compilation, Simulator and physical-device evidence.
5. Provide a real install link if a preview binary succeeded; otherwise state why none exists and give the next command/action.
6. Include real UI screenshots or clearly state that native visual inspection remains pending.
7. Give Brandon a short device checklist: launch on both devices; navigate all pages; complete a timed/manual round; inspect audio; change settings; restart/recover; test airplane-mode scrambling; verify optional login/cloud only if enabled.
8. List remaining human actions in priority order, with links and exact fields needed. Do not ask him to repeat already completed enrollment/device registration.
9. List unresolved release blockers prominently, especially native performance, distribution licensing, auth/deletion, dependency gates and physical testing.
10. Update workstream issues with progress and links without marking unverified release gates complete.

Before concluding, inspect the final diff for secrets and accidental scope changes, ensure the primary branch actually contains the integrated work, and verify pushed URLs. Continue useful independent tasks when one track is blocked. Do not stop at the first missing credential, first failing test or first PR; also do not run endless polling or optional tests after meaningful verification is complete.

The goal is the most complete, coherent app that can responsibly be built in the available session, plus an honest morning review package. There is no promise that every external release gate can be resolved overnight.
