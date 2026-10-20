# Apple release preparation

Prepared October 20, 2026. Draft for owner review, not a submission or release approval. See `ios-morning-review.md` for the assembled app's actual verification.

## Metadata draft

| Field | Draft |
| --- | --- |
| Name | Cubing Comp Sim |
| Subtitle | Practice competition rounds |
| Publisher | Brandon True |
| Bundle ID | `com.cubingcompsim.app` |
| Primary category | Sports (owner to confirm) |
| Keywords | cubing,speedcubing,cube,timer,practice,competition,scramble,scorecard |
| Version | Keep the implemented `mobile/app.json` version; choose public 1.0 only after acceptance |
| Support | Existing project issue tracker: https://github.com/Brandonius813/cubing-comp-sim/issues |
| Privacy | Existing policy: https://cubingcompsim.com/privacy/; update browser-specific wording for native storage and enabled SDKs before submission |

Description draft, conditional on acceptance:

> Simulate a Cubing Competition. Practice event-specific rounds with fresh offline scrambles and puzzle drawings. Time a solve or enter its result, review penalties, and keep a local scorecard. Recorded inspection callouts help you practice the inspection period. Practice as a guest; account and cloud-save features are optional. Cloud transfers occur only when you choose them.

Do not advertise complete event, account, audio or offline support until its acceptance check passes. Do not imply affiliation with or endorsement by the WCA.

Review notes draft: launch opens Practice; Scorecard is left and Settings right. Guest practice needs no account. Explain the current supported login methods and account deletion path. If review requires a test account, supply a synthetic staging/review account through App Store Connect's private review fields, never GitHub. Explain local-only behavior and any temporarily gated feature truthfully.

## Data inventory for App Privacy answers

This is an engineering inventory, not preselected App Store privacy declarations. Confirm the exact release build, SDK manifests, server retention, and Apple's definitions before answering.

| Data | Where/purpose | Release check |
| --- | --- | --- |
| Rounds, attempts, times, scrambles, penalties, settings | SQLite on device; guest practice | Local-only data is not automatically uploaded. Verify all network flows. |
| Explicit cloud snapshot and revision | Account API/storage, only on Upload/Download | Account-linked user content; inspect retention/deletion policy. |
| Account identity/email/provider claims | Authentication provider and account API | Disclose enabled methods and fields actually received. |
| Session credentials | Protected native storage when implemented | Never analytics, logs, screenshots, or exported snapshots. |
| IP/request/security metadata | Auth/API/hosting operations | Review actual providers and retention; do not declare no collection merely because no analytics UI exists. |
| Diagnostics/usage | Only SDKs and endpoints actually included/enabled | Web Sentry/metrics dependencies do not prove native collection. Inspect final bundle and consent behavior. |
| Inspection audio | Bundled approved MP3s, no live ElevenLabs call | Playback needs no microphone or recording permission. |

Apple requires privacy information for the app and integrated third-party partners. Review required-reason APIs and SDK privacy manifests in the final native archive. Reference: [App privacy management](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/).

## Screenshot and device acceptance plan

Capture real installed release-preview screens on iPhone 14 Pro and the registered iPad Pro, recording OS, model, build ID and commit. Capture Practice with drawing, inspection/timer, completed Scorecard, and Settings. Include portrait and landscape review on iPad plus resized windows. Capture without personal account information. Use App Store Connect's current accepted screenshot dimensions when preparing uploads; do not stretch an iPhone capture into an iPad image. No native screenshot has been captured by this track.

Check large text, VoiceOver labels, 44-point reachable controls, keyboard dismissal, safe areas, long scrambles and light/dark contrast. Complete timed/manual rounds, callouts at 8/12 seconds, mute/voice switching, lock/background interruption, process restart, airplane-mode first launch, all 16 fresh scramblers, and explicit cloud replacement using synthetic data. A JavaScript export is not native acceptance.

## App Store Connect and signing checklist

1. Enrollment and device registration are already complete per owner; do not repeat them.
2. Confirm the App Store Connect app record exists for `com.cubingcompsim.app`, language, SKU, ownership and availability. Preview ad hoc signing is separate from App Store distribution signing.
3. Review the GPL distribution gate below before public binary distribution.
4. Resolve dependencies and complete a standalone preview build only after confirming available zero-cost EAS allowance. Test on both registered devices with Metro disconnected.
5. Configure and verify actual supported OAuth callbacks, Apple App/Service IDs, key rotation, grant retention/revocation and deletion. Keep Apple unavailable until the full lifecycle passes. Check [Apple's login/account rules](https://developer.apple.com/app-store/review/guidelines/) sections 4.8 and 5.1.1.
6. Update privacy/support policy for native behavior; provide a usable support contact path. Choose age-rating questionnaire answers from actual content, not an assumed rating.
7. Review encryption classification against actual dependencies. The existing `ITSAppUsesNonExemptEncryption: false` is a configuration assertion, not a completed export-compliance review.
8. After explicit owner approval, prepare distribution signing and TestFlight. Internal testing, TestFlight upload and App Review submission are distinct steps. No submission is authorized in this overnight task.

## TNoodle distribution gate

The vendored `engine/vendor/tnoodle-lib/LICENSE` is GPL version 3. Retain it, provenance, build scripts and corresponding source for the exact binary. Its sections 5/6 govern combined work and object-code/source obligations; section 10 prohibits additional restrictions. Section 6's Installation Information obligations are conditional and require case-specific review. Publishing a GitHub repository alone is not proof that distribution complies.

Apple's [standard app EULA](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/) has device/use, transfer, modification and distribution restrictions with an open-source exception. The interaction among the actual license terms, App Store agreement, DRM/signing and the combined application needs review. This is an unresolved release gate, not a conclusion that every GPL app is categorically prohibited or automatically permitted. The local bundled WebView is not a licensing exemption.

Concrete choices for the owner:

- Obtain an explicit App Store-compatible exception or alternative license from every necessary rights holder, covering the pinned TNoodle sources and dependencies. A maintainer response alone may not cover all contributions.
- Have qualified counsel assess the exact binary, full source offer, chosen custom EULA if any, platform terms and distribution route, documenting how obligations are met.
- If neither route is available, retain the web product while evaluating a separately licensed, conformance-proven engine implementation. Do not weaken algorithms or silently replace TNoodle during this task.

Official GNU web pages could not be fetched during this check; the exact vendored license text was inspected locally. No rights-holder permission or legal clearance is claimed.

## Dependency and build feasibility evidence

Checked in this track on October 20, 2026:

- `xcodebuild -version` failed because active developer directory is CommandLineTools, not Xcode. `xcrun simctl list devices available` failed because simctl is unavailable. No native compilation, Simulator run or native screenshot evidence.
- Cached EAS CLI `build:list --platform ios --limit 3 --json --non-interactive` failed with DNS resolution error for `api.expo.dev`. Existing build history and account allowance could not be verified. No build was submitted and no install URL exists from this track.
- [Expo billing docs](https://docs.expo.dev/billing/plans/) say free build quantities reset monthly; paid plans can incur overages. These public terms do not establish this account's current plan or remaining quota. Inspect account billing/usage for `brandonius813`, not the other accessible account.
- `npm audit --json --fetch-retries=0 --fetch-timeout=10000` failed with DNS error for the npm registry. This is not a clean audit.
- Local mobile lock contains `braces` 3.0.3 and `node-forge` 1.4.0. Current [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) covers <=3.0.3 and [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) covers <=1.4.0; both official GitHub advisory pages stated no patched version when checked. Keep the audit gate. No arbitrary version override or suppression is a fix.
- Native audio adapter requires `expo-audio` at Expo 57's recommended `~57.0.5`. Registry resolution is blocked in this environment; final install/lock resolution and native compile must be recorded by integration. Configure its plugin with microphonePermission/recordAudioAndroid/enableBackgroundPlayback/enableBackgroundRecording all false.

When access is restored, from the integrated branch run root/mobile dependency installs and all prescribed checks. Then inspect EAS archive contents and account allowance. Only after free allowance is confirmed, from `mobile/`:

```sh
npx --no-install eas-cli build --platform ios --profile preview --non-interactive --freeze-credentials --no-wait --json
```

Record actual build ID, source commit, status and install URL. Do not treat this command as evidence of a successful build.
