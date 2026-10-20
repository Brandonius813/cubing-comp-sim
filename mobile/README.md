# Cubing Comp Sim for iPhone and iPad

React Native and Expo SDK 57. This is review code, not an App Store release or proof of native-device acceptance. See [morning review](../docs/ios-morning-review.md) for exact evidence and blockers.

## Implemented flow

- Separate Scorecard, Practice, Settings pages, with Practice initial, swipe and accessible tap navigation.
- Fresh local TNoodle scramble/drawing bridge for all 16 events, cancellable requests and elapsed generation status. Algorithms and secure randomness remain pinned. On-device conformance/performance remain gates.
- Timer or typed time, inspection, zero hold-to-start default, configurable hold, fixed/random waits, explicit final-penalty corrections, optional round goals and abandonment confirmation.
- Bundled recorded callouts, 16 languages and four voices each. No network audio or beep fallback. Native playback still needs device testing.
- Versioned SQLite history/settings/drafts. Unsafe recovered timing stages become reviewable DNF, never resumed clocks. Draft-only conditional writes preserve newer history/settings; confirmed attempts use stable IDs.
- Virtualized history with best single/round and editable solves. JSON share/paste import, full validation, atomic replacement and recovery copy. Native document-picker/file export remains unfinished.
- Optional email accounts and opt-in Google/WCA PKCE adapters, protected Keychain sessions, explicit upload/download confirmations and account-bound transfer tickets. Login never transfers history. See [account configuration](../docs/ios-accounts-review.md).
- Apple sign-in remains disabled until server-side grant capture/revocation and real acceptance are complete. No provider keys belong in the app.

Interface is currently English and dark. Full translated native UI, theme/font parity, complete web Back checkpoints, native provider deletion and native visual/accessibility acceptance remain unfinished. Do not advertise those as complete.

## Reproducible setup

Use Node 24. From the repository root:

```sh
npm ci
npm run engine:verify
cd mobile
npm ci
npm run prepare-engine
npm run typecheck
npm test
npm run export:ios
```

Engine verification requires the documented JDK/Maven toolchain. A matching verified artifact can be reused per [engine documentation](../docs/mobile-engine.md); an arbitrary artifact cannot bypass provenance checks. Expo export creates JavaScript/assets, not an installable app.

Copy `accounts.env.example` to an ignored `.env` only when configuring a known environment. Supply all four public URLs/key fields and register `cubingcompsim://auth/callback` with that environment. Never insert service-role credentials. Providers default off. Missing configuration leaves guest practice usable.

The local review checks used existing dependencies plus exact upstream Expo SDK57 package sources and URL-polyfill source because registry DNS was unavailable. New Expo/URL-polyfill lock entries intentionally omit unavailable integrity values; none were invented. Remote CI subsequently passed clean `npm ci` with lifecycle scripts disabled. Normal installation and registry-backed native export/build still need verification. The official source package versions and remaining advisories are documented in the morning review.

## Device preview

Existing EAS project: `@brandonius813/cubing-comp-sim`, ID `52c0c6ad-0940-4756-9376-f29c88631aea`. Bundle ID `com.cubingcompsim.app`. Existing iPhone/iPad registrations need not be repeated.

Use the internal `preview` profile only after confirming available zero-cost quota and credential readiness. No cloud build was started during this review. A standalone preview must run with Metro stopped and airplane mode enabled before first launch. See [testing checklist](../docs/mobile-testing.md).

No production deployment, main merge, TestFlight upload, or App Review submission is part of this branch.
