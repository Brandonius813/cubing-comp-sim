# Testing the mobile app

The mobile client lives in `mobile/`. The existing desktop website remains a separate client. See [the mobile roadmap](mobile-roadmap.md) for scope and architecture.

Status on October 15, 2026: this Mac has Node 24, npm 11, and Xcode Command Line Tools. Full Xcode, iOS Simulator, and Android build tools were not found. Apple Developer enrollment, an EAS project, signing, and installed mobile builds have not been verified. The commands below describe setup and testing, not completed device acceptance.

## Choose the right preview

| Method | Where it runs | What it establishes |
| --- | --- | --- |
| Existing website | Desktop or mobile browser | Web behavior only. It does not test the native client. |
| Development build | iPhone/iPad Simulator, Android Emulator, or a physical device | Fast iteration with our native modules and live code from Metro, the development server. |
| Standalone preview | Physical iPhone, iPad, or Android device | Installed-app behavior, cold starts, and offline practice without a running computer. |
| TestFlight / Google Play testing | Physical devices | Store-distributed builds, installation, updates, signing, and release acceptance. |

Use our development build for native development and testing; use a standalone preview for offline acceptance. Expo Go does not establish that the packaged scramble runtime, asset loading, or app-specific native authentication works in the signed app. Simulators help with layout; physical devices are required for touch timing, audio, interruptions, and performance.

## Daily development

First prepare the verified TNoodle artifact in `public/engine/` using [the engine setup](development.md), or reuse a matching verified artifact. Fresh compilation needs JDK 21 and Maven 3.9+. Then, from the repository root:

```sh
cd mobile
npm ci
node scripts/engine-bundle.mjs
```

The last command verifies the engine checksum/reference proof and creates `assets/engine.generated.ts`, required before Metro or native builds. To use an artifact elsewhere, pass `--engine-dir /path/to/verified/engine`. Missing or mismatched engine files are a failed prerequisite, not a reason to substitute scrambles.

For local builds, install full Xcode and an iOS Simulator runtime, or Android Studio with its SDK, emulator, and compatible Java toolchain. Command Line Tools alone cannot build or run an iOS app. Then build the relevant development client:

```sh
npx expo run:ios
# Or:
npx expo run:android
```

Choose an iPhone and an iPad simulator for Apple layout checks. For a plugged-in device, use `npx expo run:ios --device` or `npx expo run:android --device`. Android requires USB debugging; Apple devices require signing and Developer Mode. Local Xcode testing can use a free Apple Account with its development-signing limits.

After installation, start Metro for subsequent JavaScript/TypeScript edits:

```sh
npx expo start --dev-client
```

Open the installed development client using the displayed QR code or simulator shortcut. A physical device must reach Metro, usually over the same Wi-Fi network. Rebuild the client when native dependencies or native configuration change. For bundled engine JavaScript changes, regenerate the engine bundle and reload Metro; rebuild standalone previews so they include the updated assets. Live development depends on Metro; it is not the offline release test.

EAS can compile in the cloud without local Xcode or Android Studio. It still needs an Expo account/project and the appropriate signing configuration. Running an iOS Simulator build locally still requires the Simulator installation.

## Standalone testing on your phone or iPad

Use an EAS internal preview build with embedded application code and assets. It must launch with Metro stopped and the computer disconnected. Install the build first, then enable airplane mode before its first app launch to prove that practice does not rely on downloaded code, scrambles, drawings, or inspection voices.

- **iPhone/iPad:** Internal distribution uses ad hoc signing. Register each device with `npx eas-cli device:create` before building; its device identifier must be included in the provisioning profile. Enable Developer Mode. Adding a device requires a rebuild or re-sign. This route requires paid Apple Developer membership, currently $99/year.
- **Android:** Install the internal preview APK from its build link. Android may ask you to allow installation from that source. Direct APK testing does not require a Google Play developer account.
- **Broader beta:** Use store-signed builds through TestFlight and Google Play testing. TestFlight does not require UDID registration or Developer Mode. A store submission is a separate step from building the app.

Google Play registration currently costs $25 once. For personal accounts created after November 13, 2023, production access requires a closed test with at least 12 continuously opted-in testers for 14 days, followed by an application for production access. New personal accounts also require verification of a physical Android device. Start recruitment before release preparation.

## Acceptance checklist

These are release gates, not claims that the foundation already implements each feature. Record the commit/build, device, OS, and result. Use staging accounts and synthetic solve history for cloud tests.

- [ ] **Engine:** All 16 supported events generate fresh TNoodle scrambles and drawings offline. On-device seeded fixtures match the pinned reference. Verify the bundled WebView runtime uses secure random generation, rejects stale results, and recovers from runtime reset. Check cold/warm 4x4 and FTO responsiveness and memory. Desktop bridge tests do not establish WKWebView or Android WebView correctness.
- [ ] **Timer:** Hold, release, stop, inspection callouts, penalties, and manual entry behave correctly. App navigation swipes cannot switch screens during an active solve. System gestures remain available and are treated as interruptions.
- [ ] **Interruptions:** Test lock/unlock, Home/app switching, calls, audio interruptions, rotation, and process termination during waiting, inspection, solving, and saving. Verify the defined interruption behavior without silently saving a false time or duplicate attempt.
- [ ] **Layouts:** Test small iPhone, large iPhone, iPad portrait/landscape and supported multitasking widths, plus Android phone/tablet. Check safe areas, keyboard, large text, and reachable controls.
- [ ] **Local data:** SQLite retains completed rounds/settings across force-close, restart, app update, and schema migration. Interrupted writes cannot leave partial rounds. Uninstall/data clearing is a separate destructive case.
- [ ] **Cloud replacement:** Explicitly upload a mobile save and download it on web, then reverse the direction. Verify replacement confirmations, revisions/conflicts, retry behavior, and account isolation. Signing in or changing accounts must not transfer or delete local history automatically.
- [ ] **Accounts:** Verify email, Google, WCA, and Apple flows when implemented, including cancellation, cold/warm callbacks, expiry, sign-out, and recovery. Secrets stay out of the app bundle and logs; session credentials use protected storage.
- [ ] **Apple account management:** Test Apple private-email users, identity linking, provider revocation, and account deletion. Deletion must remove associated cloud data and respect the app's local-data confirmation. Verify the public deletion route and privacy disclosures before store submission.

## Official references

- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/) and [using a development build](https://docs.expo.dev/develop/development-builds/use-development-builds/)
- [Expo custom native code](https://docs.expo.dev/workflow/customizing/) and [internal distribution](https://docs.expo.dev/build/internal-distribution/)
- [Apple Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device/) and [membership](https://developer.apple.com/programs/enroll/)
- [Google Play registration](https://support.google.com/googleplay/android-developer/answer/6112435/), [testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en), and [device verification](https://support.google.com/googleplay/android-developer/answer/14316361?hl=en)
- [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/) and [Google account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en-EN)
