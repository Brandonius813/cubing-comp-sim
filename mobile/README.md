# Cubing Comp Sim mobile foundation

React Native with Expo SDK 57. This is a development milestone, not an App Store or Play Store release. The existing website is unchanged.

## Current scope

- Three separate native pages: Scorecard on the left, Practice in the center at launch, Settings on the right. Swipe navigation and accessible tab buttons work on phones and tablets. Timing, review, and save operations lock navigation.
- Bundled offline TNoodle runs in an isolated WebView. The surrounding application is native React Native UI. Every visible scramble and drawing comes from the verified engine; no fallback algorithm or sample scramble is used.
- Hold for 550 ms, release to start, touch to stop. Inspection starts on a completed stationary tap. Movement, extra fingers, and native cancellation invalidate a hold. Screen-reader activation offers a hold-free control path.
- Visual inspection, manual input, penalty review, complete event-specific rounds, scorecards, and local SQLite history. The app imports the existing pure TypeScript round, scoring, parsing, and history validation modules.
- Leaving the app or losing Android focus during inspection/holding/solving creates a reviewable DNF. It cannot be changed to OK. The elapsed solve clock uses monotonic timestamps rather than frame counts.
- An engine failure preserves the current scramble/result through saving. Retry creates a new isolated engine host before the next scramble.

## Prepare and run

Use Node 24. From this directory:

```sh
npm ci
npm run prepare-engine
npm run typecheck
npm test
npm start
```

`prepare-engine` requires the verified root `public/engine/` build. Obtain that through the repository's documented engine build/artifact process first. It validates the artifact and produces the ignored bundled module. `npm start` starts Metro for an installed development build; it does not install an app onto a device. See [mobile testing](../docs/mobile-testing.md) for native tools, device signing, development builds, and standalone previews.

```sh
npm run ios
npm run android
npm run export:ios
npm run export:android
```

The export commands compile JavaScript/assets only. They do not produce installable signed native apps or establish that the app works on hardware. Expo Go is not the release acceptance environment.

EAS profiles in `eas.json`: `development`, `development-simulator`, `preview`, and `production`. No EAS project/account ID or signing credentials have been provisioned. `preview` is standalone and is the correct profile for offline testing without Metro; Android uses an APK. Apple device distribution requires its signing setup. The bundle/package identifier `com.cubingcompsim.app` is a proposed identifier, not a claim of store registration.

EAS archives from the repository root. The root `.easignore` includes the verified engine inputs and the generated bundle; the EAS pre-install hook reruns verification/bundling. Never place private keys, signing files, or account credentials in the repository.

## Persistence contract and limits

SQLite stores one atomic state row containing a versioned mobile preferences envelope and the website's `HistorySnapshot` version 1. A failed write keeps the previous row. Invalid or newer saves fail visibly without resetting data. Only attempts confirmed with **Save and continue** are durable; an unfinished round containing saved attempts is restored. The unused scramble is regenerated on restart. A running or unsaved review attempt is not recovered after process termination yet. Settings persist after successful writes.

Snapshot replacement is intentionally small for this first milestone. Large-history storage, row-based migrations, interrupted-attempt recovery, import/export, inspection recordings, wait simulation, statistics/editing parity, auth, and manual cloud upload/download belong to the subsequent workstreams. The Settings page labels account/cloud support as unavailable and has no fake login controls. Full tablet layouts, accessibility gestures, and hardware timing need real-device acceptance.

## Parallel work

Start from [the roadmap](../docs/mobile-roadmap.md) and the linked GitHub workstream issues. Keep shared pure-core behavior aligned with the website. Do not add browser storage or DOM imports to the core. `metro.config.cjs` resolves runtime modules from `mobile/node_modules` so the web React installation cannot be bundled as a second runtime.

Engine integration is in `src/engine` and `scripts/engine-*`; its contract and proof boundaries are documented in [mobile engine](../docs/mobile-engine.md). App/UI work is in `App.tsx`; portable mobile state transitions are in `src/practice.ts`; SQLite is behind `src/storage.ts`.
