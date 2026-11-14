# Build state: iOS app 1.0

**Status:** iOS 1.0.0 (build 13) was submitted to Apple on 2026-11-14 and is **Waiting for Review**. It's set to release automatically on approval. Last worked: 2026-11-14.

**Read first, in order:** this file → [AGENTS.md](AGENTS.md) → [PROJECT_NOTES.md](PROJECT_NOTES.md) (last section, "App Store 1.0 decisions") → [docs/app-store-listing.md](docs/app-store-listing.md) → [mobile/README.md](mobile/README.md).

The working copy is `~/Documents/Codex/2026-10-16/new-chat/cubing-comp-sim`, on `main`, with everything merged. `~/Documents/Codex/cubing-comp-sim` is a stale October 6 copy; ignore it.

## Done, and how it was proven

| Item | Proof |
|---|---|
| Hold-to-start rebuilt as `HoldPad` ([mobile/src/hold-pad.ts](mobile/src/hold-pad.ts)) | 16 finger-sequence tests. The owner did ~20+ solves on device and reported "touches feel way more responsive". |
| Solve timing from native touch timestamps; running clock in its own component (`mobile/src/LiveTimer.tsx`) | Unit tests, plus owner device use. |
| Haptic when the timer turns green, with a "Haptic when ready" toggle | Owner felt it on device: "feels great". |
| Background next-scramble (4x4 wait hidden) | Service tests, plus owner device use: "feels good". |
| Apple sign-in links to the existing account | Device sign-in, then read-only Supabase query: one user with email, WCA, Google and Apple identities, plus the existing cloud save. |
| Cloud save summary auto-loads after sign-in | Typecheck and tests only. The owner confirmed that tapping ↻ worked on the previous build. |
| Defaults for new installs: hold-to-start on, scramble drawing on | Tests. Existing saves keep their stored values. |
| GPL-3.0 root `LICENSE`, in-app notice, version 1.0.0, iPhone-only | In build 13. |
| Privacy policy (iOS and Apple wording) live in 16 languages | Live site showed "Effective October 23, 2026" after deploy. |
| Website redeployed from main after the iOS merge | CI passed. I checked the live site in a browser: a 4x4 round generated a scramble and drawing, with no console errors. |
| Simpler CI (PR #56): weekly dependency audit; PRs only run checks for the areas they touch; PR web checks run Chromium only | Merged. Not yet observed on a later PR run. |
| App Store listing: text, keywords, Utilities category, 4+ age rating, 4 screenshots (1290×2796), review notes, privacy answers | Set via the App Store Connect API and by the owner. Apple accepted the screenshots. |

Mobile tests: 142 + 3 pass. `npm run typecheck` in `mobile/` is clean, but only once the engine file exists (see Traps).

## Never executed on a real device

- **In-app account deletion for Apple/Google/WCA users** (`NativeAccounts.deleteWithProvider`, delete popup in `mobile/src/accounts/AccountPanel.tsx`). Never run. The specific unknown: whether Supabase's native Apple `signInWithIdToken` session carries `amr` method `oauth`, which the server's `requireRecentAuthentication` needs. If it doesn't, the user sees "The server could not confirm this sign-in." Apple reviewers may test this.
- **Email-password deletion** on native: Codex-era code, also untested on device.
- **Automatic cloud-save summary load**: compiled and tested only.

## Outstanding next actions

1. **Wait for Apple.** Check status with the App Store Connect API (see Environment) or ask the owner. If rejected, read the reason and fix it. Make a new build with `eas build --profile production`, upload it (see Traps), attach it to the version, and the owner resubmits.
2. **Delete the stale local branch** `fix/provider-login-audit` (commit `03901fd`, local only). It holds unsaved October 15 Codex edits that look superseded by merged PR #45. Ask the owner before deleting.
3. **Clean up local branches** that are fully merged: `ci/simplify-checks`, `feat/apple-release-activation`, `fix/ios-timer-touch`, `fix/privacy-translations`, `perf/prefetch-scrambles`, `release/1.0-prep`, `feat/mobile-foundation`.
4. **Fix the dependency audit** (weekly `Dependency security checks`). Vite/Vitest and Expo toolchain advisories are known. Don't take npm's suggested Expo downgrade.
5. **Fix old mistranslations** in `public/information-locales.json`, the strings not updated on 11-13. Examples: "scramble" rendered as "fights"/"encoding"; "the app stores" read as "app stores".
6. **Optional:** an iPad version later, which needs iPad screenshots.

## Blocked on the owner

- Apple's review outcome. Apple emails the owner.
- Any App Store Connect button presses (submit, release). The owner wants to press Submit themselves.

## Decisions settled (don't relitigate)

- The whole app is **GPL-3.0**. The owner chose to ship without asking TNoodle's rights holders, aware of the takedown risk.
- **Accounts ship in 1.0**, with provider re-sign-in deletion inside the app.
- **iPhone-only** for 1.0. **Category: Utilities.** The owner wrote the description and promo text ("Simulate a cubing competition"). Content Rights: "Yes, third-party content, I have the rights" (TNoodle, WCA sign-in).
- **Hold-to-start design:** timing-mat model. Any finger counts, drift is ignored while holding, and green always starts. Don't reintroduce drift/finger-count cancellation. The 12pt swipe check applies only on scramble-confirm and review screens.
- The haptic is a single `ImpactFeedbackStyle.Medium` impact, not a pattern.
- **TestFlight:** the owner can't install new apps right now. For device testing, use `eas build --profile preview` (link install over the existing app). A TestFlight group "Me" exists anyway.

## Traps found the hard way

- **Engine file is required and gitignored.** `public/engine/*` and `mobile/assets/engine.generated.ts` must exist before typecheck or any EAS build. CI artifacts expire, so rerun `gh workflow run engine-proof.yml --ref <branch>`, then `gh run download <id> -n offline-engine -D <dir>`, then `node mobile/scripts/engine-bundle.mjs --engine-dir <dir>`, and copy `<dir>/*` to `public/engine/`.
- **`eas submit` ignores `EXPO_ASC_*` env vars** ("API Keys cannot be set up in --non-interactive mode"). Temporarily add `ascApiKeyPath`, `ascApiKeyIssuerId` and `ascApiKeyId` to `submit.production.ios` in `mobile/eas.json`, submit, then **restore the file**. Never commit those values.
- **The production EAS environment originally had no variables**, which would have meant accounts were silently off in App Store builds. It now has the four `EXPO_PUBLIC_*` values copied from preview.
- `npx eas-cli` failed with npm "Lock compromised". Install it into a throwaway prefix (`npm install --prefix <dir> eas-cli`) and run `<dir>/node_modules/.bin/eas`.
- The Supabase SDK saves a session **before** the app's identity checks run, so a failed check must sign out, or the user is left signed in behind an error. Token responses can omit `identities`; `hasIdentity()` falls back to `getUser`.
- The site's localization check fails main (and skips the production deploy) if any English text block on `about/`, `privacy/` or `terms/` lacks entries in all 16 locales.
- App Store Connect API calls return 403 "required agreement" until **both** agreements are signed. That took effect a few minutes after the owner signed.

## Environment

- No Xcode on this Mac, only Command Line Tools, so no simulator. About 54 GB free. All native builds go through **EAS** (free plan; 9 iOS builds started on Nov 13–14, including one cancelled).
- EAS project `@brandonius813/cubing-comp-sim`. Bundle ID `com.cubingcompsim.app`. Apple team `JGV5NGLZ6R`. App Store Connect app ID `6826360142` (in `mobile/eas.json`).
- App Store Connect API key: `~/.appstoreconnect/private_keys/AuthKey_KN2CRGC3ZJ.p8`. Key ID and issuer are in `mobile/.env.asc` (gitignored).
- Supabase project ref starts `mrxbjd`. A management token is in `~/.zshrc` as `SUPABASE_ACCESS_TOKEN`. For read-only SQL, POST `https://api.supabase.com/v1/projects/<ref>/database/query/read-only`. App tables live in the `ccs_backend` schema.
- The Supabase MCP server is not authorized in Claude; use the API above.
- A main push runs `Desktop web checks`, and on success `Deploy production frontend` updates cubingcompsim.com.
