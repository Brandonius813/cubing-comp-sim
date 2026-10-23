# Mobile preview feedback pass

## Current behavior

Practice follows the desktop sequence: fresh scramble and large optional drawing, explicit tap to confirm scrambling, sampled wait (default fixed zero), Ready, optional inspection, solve, timed-result review, next scramble. Manual entry saves directly without a second confirmation. The last solve opens a round scorecard popup after saving; X, backdrop tap, or downward swipe dismiss it.

Inspection, holds and timing lock horizontal paging. A rejected page gesture does not produce a DNF. Review remains navigable. Slider touches disable paging and settings scrolling until release/cancellation.

Scramble text defaults to bold 24 pt, adjustable 16–40 pt. Timer display supports decimals, whole seconds or Solve. Waiting shows Wait. Review has +2, DNF and Edit time above the result.

Scorecards have an outline and green/red best/worst bounds. Event options overlay the still-visible scorecard in a distinct scrollable dropdown. History uses compact round/result/time rows, with delete-round actions. Individual time editing has one penalty selection, immediate penalty saves, time save on blur/close, X, scramble notation and a regenerated drawing, and Delete solve. Removing a historical solve makes its round incomplete; it does not redirect the current practice session into that old round.

## Validation

- TypeScript passed.
- 110 mobile domain/bridge tests and 3 engine bundler tests passed.
- iOS export passed.
- Actual App and UI components were exercised through temporary React Native Web adapters, with test storage/audio/pager/engine services. Verified scramble confirmation, wait, timer paging lock, stopped review, immediate +2, next scramble, direct manual saves, five-solve round popup, dismissal, individual deletion, round deletion, inspection paging rejection and Solve display. No browser runtime errors. This is not native device testing.
- Inspected phone-sized practice/editor/scorecard/dropdown/history/round-completion screenshots and a tablet-sized scorecard.
- Exact production TNoodle bridge regenerated historical drawings for 2×2, 3×3, Clock and Square-1; drawings matched their generated SVGs exactly. Algorithms and verified engine hash unchanged.

## Account status

Google and WCA are enabled for this preview. Both authorization redirects reached their correct providers. Brandon added the mobile callback to Supabase; cancelled test flows then returned to `cubingcompsim://auth/callback` with matching state preserved. Completed human consent and authenticated cloud transfer remain device acceptance checks. No real account was used by these probes.

Apple is disabled in the existing backend. Its button is visible but disabled with a setup note; this build does not claim working Apple login. Provider credentials and the existing Apple revocation/deletion requirements remain outstanding.

The preview uses the existing public account configuration stored in EAS. No private credentials are committed. This pass does not merge main or publish to the App Store.

## Device checks

Install over the existing app. Check slider/pager arbitration on iPhone/iPad, keyboard/X editing, large scramble readability for long events, native round-popup swipe dismissal, voice playback, Google/WCA consent/return, and explicit cloud upload/download. Full desktop translations, bundled fonts, keyboard shortcut customization and native file-picker JSON transfer remain separate parity gaps.

Latest preview: https://expo.dev/accounts/brandonius813/projects/cubing-comp-sim/builds/a4e3242a-b393-4946-ae3d-2350ffe45011 (source af6998d). Submission accepted October 23, 2026. Free allowance was 2/15 iOS builds used before submission, with zero overage. Review: https://github.com/Brandonius813/cubing-comp-sim/pull/53.

## October 23 follow-up verification

- Active solving stops on touch-down; holding/moving/releasing that same finger cannot Continue. Ready retains the stable full-surface touch target across the holding transition.
- Idle restored Ready/Wait drafts return to scramble confirmation. Pending results and entered manual text remain recoverable.
- Added blue outlined rounded Scramble is good/Ready/Continue controls, review Delete, Settings heading, All Stats label, None wait mode, and Timer Update naming.
- Time editor normalizes 1236 to 12.36 on blur and uses two decimals. Measured solves are stored to hundredths. Discarded scorecard times have parentheses plus muted color.
- Actual App rendered with browser native-service adapters passed touch-down stop before release, drag/hold suppression, edit normalization, penalty, manual save, five-solve summary/dismissal, solve/round deletion, inspection page lock and hidden timer mode. Phone and tablet layouts inspected. This is not physical iOS testing.
- Mobile typecheck and 114 mobile/bundler tests passed. iOS JavaScript export passed. No new EAS binary submitted.
- Apple native/web and backend implementation is prepared but remains gated pending server secrets, migration, deployment and real consent/deletion acceptance. Google/WCA remain available. See apple-sign-in.md.
