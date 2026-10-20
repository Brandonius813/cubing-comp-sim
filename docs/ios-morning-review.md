# iPhone and iPad morning review

Prepared October 20, 2026 UTC. **Substantial integrated implementation is ready for code review; native release acceptance is not complete.** No money was spent, native cloud build started, production deployment made, App Review submission made, or main merge performed.

## Review entry points

Primary review PR and published commit will be added after the branch is published. Existing work is retained: [mobile foundation #43](https://github.com/Brandonius813/cubing-comp-sim/pull/43), [Apple preparation #42](https://github.com/Brandonius813/cubing-comp-sim/pull/42), [launch tracker #36](https://github.com/Brandonius813/cubing-comp-sim/issues/36).

Current main `d17fa698c3de7f94fcb1d5675d80c2bceedd24d6`, mobile `f292fb387dcae87a6eb05e70809a7750e53102ec`, and Apple `ee0aee1` were integrated before feature completion. Shell GitHub DNS failed, so main was retrieved through the authenticated GitHub connector and its full tree verified against `31416438afecfa0f87f459eddf612b4c7b37acda`. Publication uses the actual remote parents and verifies identical tree contents. No existing branches are reset or force-pushed.

Local code verification checkpoint: `0537caaf961657650127a125452977b437d8556c`, tree `6900575a49a0ffe2bbe013065e8ec150a33b4892`. Later commits in this review may add documentation only. Local focused commits are retained in the worktrees; remote publication consolidates the integrated tree because shell git transport is unavailable.

## What works and what remains

“Complete” below means the bounded code/contract item has passing evidence. It does not mean physical-device acceptance.

| Area | Status | Implemented | Remaining |
| --- | --- | --- | --- |
| Main/mobile/Apple integration | Complete | Current web fixes retained, Apple label conflicts fixed, provider guard retained | Review consolidated PR; do not merge until accepted |
| Practice | Partial | All 16 event contracts, timed/manual results, zero default hold, inspection corrections, goals, fixed/random waits, Back to scramble/manual entry, abandonment and duplicate protection | Full web Back checkpoint parity; actual touch/gesture/clock acceptance on both devices |
| Durable data | Partial | Versioned validated SQLite save, safe draft recovery, atomic replacement/recovery, conditional draft writes prevent stale history/settings overwrite | Real Expo SQLite process-kill, migration/update and large-history device tests |
| Scorecard | Partial | Virtualized event history, best single/round, solve edits, original scramble/provenance, goals; no Mo3R | Native layout/accessibility checks and any remaining web statistics parity |
| Local transfers | Partial | Share JSON, paste/import JSON, full validation, explicit replacement confirmation, atomic recovery copy and restore | Native document-picker/file export; current sharing is text JSON |
| Offline scrambles | Partial | Pinned TNoodle bridge, all events retained, fresh notation/SVG, secure randomness, progress, cancellation/stale-response handling | Exact new JVM/native conformance and on-device cold/warm performance; no fallback algorithm |
| Inspection audio | Partial | All 128 approved recordings bundled, 16 languages/four voices, volume/test, bounded 8/12s callouts, cleanup and late-cue suppression | Native playback, mute switch/Bluetooth/call interruptions on devices |
| Settings | Partial | Durable inspection, hold, waits, goals and voice settings | Native UI remains English and dark; complete translation/theme/font parity unfinished |
| Accounts/cloud | Partial | Email sign-in/signup/reset, protected chunked Keychain storage, refresh, optional Google/WCA PKCE callbacks, explicit account-bound upload/download, password reauthentication/deletion | Actual configured staging acceptance with two synthetic accounts; native provider deletion still routes to website |
| Apple login/deletion | Blocked | Existing web preparation integrated; Apple disabled; mixed Apple/password deletion cannot bypass revocation requirement | Server grant capture/encrypted retention, revocation/retry implementation, Apple setup and end-to-end acceptance |
| Store preparation | Partial | Metadata drafts, privacy data inventory, screenshot plan, owner checklist | License clearance, account/native gates, App Store Connect record/signing, actual screenshots and final declarations |
| iOS binary/install | Blocked | iOS JavaScript/assets export passes | No Xcode/Simulator available; free EAS allowance not confirmed, so no native build submitted |

## Actual verification

| Check | Result and scope |
| --- | --- |
| Root `npm run typecheck` | Passed on integrated source |
| Root `npm test` | 278 passed, 19 files |
| `node --test deploy/*.test.mjs` | 26 passed |
| Server `node --import tsx --test src/*.check.ts` | 24 passed, one PostgreSQL integration test skipped because database URL unavailable |
| Mobile `npm run typecheck` | Passed using existing installed dependencies plus verified genuine upstream package sources, described below |
| Mobile `npm test` | 95 TypeScript tests plus 3 bundler tests passed; includes all 16 event × two input-mode lifecycle contracts, persistence races/recovery, auth transfers, engine protocol, gestures and audio asset paths |
| Mobile `npm run prepare-engine` | Passed; exact engine SHA-256 `37008dff9676c9c782da7b31bcb0cedf562a07e288bafb0ea16fa68267c17f57` |
| Mobile `npm run export:ios` | Passed with source-staged dependencies; 129 assets including all 128 recordings, one Hermes iOS JS bundle. **Not native compilation or an installable binary.** |
| Recording integrity | All 128 existing recordings matched the approved pack hashes |
| SQLite transaction check | Injected-driver tests plus Python SQLite execution verified replacement backup and rollback SQL. Not Expo-on-iOS evidence |
| Engine smoke | Contextified Node first 2x2/3x3 passed, cold 4x4 hit unchanged 180s timeout. Separate bounded run passed the other 14 events excluding 4x4/4BLD |
| Engine normal-Node diagnostic | Exact unchanged document: 3x3 626 ms; first 4x4 11,813 ms; warmed 4BLD 688 ms; FTO 5,008 ms. Different random samples, not an exact causal comparison or native proof |
| New JVM reference conformance | Not run successfully: no Java compiler. Verifier correctly rejects missing reference fixtures before expensive generation |
| Native build, Simulator, device tests | Not run; Xcode/simctl unavailable |
| Screenshots | None captured. Native visual inspection remains pending; no mockup is presented as a screenshot |
| Clean registry install / npm audit / EAS archive | Registry/API DNS blocked. Clean `npm ci`, current full audit and actual EAS archive inspection remain unverified. Static `.easignore` includes engine and audio assets and excludes credentials |

An initial export exposed an incorrect relative audio path; it was fixed and a test now resolves every native recording reference. Earlier local server invocation lacked its dependency link; the corrected invocation produced the counts above. Native cloud requests no longer depend on unsupported `AbortSignal.timeout`; browser telemetry dispatch is guarded on native.

### Dependency provenance and limits

The runtime could not resolve registry.npmjs.org. To obtain meaningful type and bundling evidence without fake declarations, exact upstream Expo SDK57 compiled JS/declarations/config plugins and tagged URL-polyfill sources were fetched through the GitHub connector. Every staged file was checked against its Git blob SHA. These temporary verification inputs are not committed.

- `expo-audio` 57.0.5: upstream tree `f0357d5cebf96cdbd355f668e6a58894a353bcdb`
- `expo-secure-store` 57.0.4: `43ca3add58a4278382d44dd13496427ebaaba6a8`
- `expo-web-browser` 57.0.3: `cd5accb040d55803798597c98a01f3be7249f2fc`
- `react-native-url-polyfill` 4.0.0: `4598e480a1c7c1093a4cac24990f5dd43203c7a0`
- Supabase 2.117.3 and Expo Asset 57.0.20 use already installed matching dependencies/lock metadata.

The new Expo/URL-polyfill lock entries omit unavailable integrity fields instead of inventing hashes. Verify clean npm installation and normalize lock integrity with the registry before a native build. The source-based export is not evidence that npm installation or native autolinking succeeds.

## Release blockers

1. **Native acceptance and free build allowance.** EAS build-history lookup failed DNS, and no quota could be confirmed. No install link exists. Do not equate JS export with an app build.
2. **TNoodle distribution license.** GPL-3.0/App Store compatibility remains unresolved. A public repository alone is not clearance. See [store preparation](ios-store-preparation.md) for authoritative sources/options.
3. **Apple grant lifecycle.** Apple remains disabled. Token capture/revocation is not implemented or proven, and deleting a Supabase user is not sufficient. Linked Apple identities fail closed rather than bypassing this gate.
4. **Dependency gates.** Existing braces 3.0.3 and node-forge 1.4.0 advisories still listed no patched versions in the official advisory sources checked. No audit suppression, forced upgrade or claimed clean audit.
5. **Real accounts and native UX.** Two-account/cloud divergence, callback cancellation, session revocation, native provider deletion, offline installation, accessibility and device interruption tests remain open.

## Short iPhone/iPad checklist

Use the registered iPhone 14 Pro and iPad Pro. Record OS, device, build ID and result separately.

- Launch with Metro stopped, then first-launch a fresh install in airplane mode. Generate a fresh scramble/drawing for every event. Measure first and repeated 4x4, 4BLD and FTO.
- Confirm initial Practice and separate Scorecard/Settings pages. Try taps/swipes, portrait/landscape, iPad resized windows, large text, VoiceOver and keyboard entry.
- Complete timed and manual rounds. Try zero/nonzero hold, moving/extra-finger cancellation, inspection around 15s and 17s, explicit penalty corrections, Back and repeated Save taps.
- Test fixed/random waits, settings restart persistence, goals and scorecard edits. Confirm history does not duplicate and the next manual entry is blank.
- Test every chosen recording at 8s/12s, language/voice changes, volume zero, preview, app switch and audio interruptions. No delayed call should play after solving begins.
- Force-close at ready/wait/review and during inspection/solving. Confirm the saved scramble/review survives; interrupted clocks return as DNF, never invented elapsed time.
- Share/import valid JSON, reject invalid JSON unchanged, replace history, restore recovery including its review draft. Simulate a storage failure if possible.
- With staging configured, use two synthetic accounts. Login alone transfers nothing; explicit upload/download replaces only the intended save. Logout/deletion preserves local history; expired/revoked sessions and account changes reject stale transfers.

## Exact human actions next

1. Review this PR and the explicit partial/blocked items. Do not merge or deploy automatically.
2. In a normal networked checkout, use Node 24 and the documented JDK/Maven toolchain: root `npm ci`, `npm run engine:verify`; then `cd mobile`, `npm ci`, `npm run prepare-engine`, `npm run typecheck`, `npm test`, `npm run export:ios`. Resolve clean-install/audit issues without suppressing gates.
3. Optional staging accounts: copy `mobile/accounts.env.example` to ignored `mobile/.env`; set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` for the **same known environment**. Add `cubingcompsim://auth/callback` to its auth redirect allowlist. Enable Google/WCA only after matching provider setup. Never add service-role or Apple private keys to the app. Apple stays off.
4. Open [existing Expo project](https://expo.dev/accounts/brandonius813/projects/cubing-comp-sim), inspect billing/usage and confirm this preview is covered by existing free allowance. Enrollment and device registration are already done; do not repeat them.
5. Only after zero cost and build readiness are confirmed, from `mobile/`: `npx eas-cli build --platform ios --profile preview --non-interactive --freeze-credentials --no-wait --json`. Inspect the actual build result before sharing an install link. Do not use `production`, submit, or publish.
6. Install the resulting internal preview on both registered devices and run the checklist. Capture real screenshots after layout checks. Address remaining implementation and native failures before TestFlight.
7. Resolve TNoodle distribution rights and Apple revocation/deletion. Then complete App Store Connect app record, production signing, privacy/age/export answers and review notes from [store preparation](ios-store-preparation.md). TestFlight/App Review need separate authorization.

## Implementation decisions

- Keep the existing engine and algorithms; cancellation retains initialized tables, but stale results cannot attach to a newer request.
- Use conditional, serialized draft-only writes and explicit atomic replacement backups. Never rewrite newer history to autosave an old draft.
- Process-death recovery is conservative: an unsafe active timing stage becomes DNF with no invented time. Confirmed results are keyed by stable attempt IDs.
- No unsupported account provider is advertised as functioning. Missing environment configuration leaves guest practice available.
- Prioritize working practice/data/account contracts over unverified translation/theme selectors. Current native English/dark and text-based import/export limitations are explicit.
