# Sign in with Apple: setup and release gates

Status: implementation prepared, October 23, 2026. Workstream: [#40](https://github.com/Brandonius813/cubing-comp-sim/issues/40). Mobile tracker: [#36](https://github.com/Brandonius813/cubing-comp-sim/issues/36).

Brandon approved React Native/Expo and Apple sign-in for web and mobile. He is enrolled, registered the app and Services IDs, and enabled the production Supabase Apple provider. The initial Apple authorization redirect passed on October 23. Full consent and account deletion have not yet been tested.

## October 23 implementation and remaining activation

- iOS uses Expo AppleAuthentication 57.0.2, the official native button, app entitlement, fresh state, SHA-256 nonce sent to Apple and the raw nonce sent to Supabase.
- Web keeps the existing PKCE flow and uses locally bundled official Apple sign-in artwork.
- Both send a revocable grant to the authenticated API before reporting Apple setup success. Native sends its authorization code; web sends Supabase's provider refresh token. Provider credentials remain excluded from local session storage.
- The API exchanges the credential directly with Apple, verifies its returned ID token signature, issuer, audience and expiry, and compares its subject to the live Supabase Apple identity. AES-256-GCM encrypts the refresh token with account/client IDs as authenticated associated data.
- Deletion records durably require Apple revocation, including mixed-provider accounts. Retry never deletes the identity while Apple configuration is missing. Revocation precedes identity/cloud deletion.
- Production web and mobile preview provider gates remain Google/WCA only pending backend activation and real consent/deletion acceptance. No new binary or public deployment has been started.

### Backend activation prerequisites

1. Apply `server/migrations/003_apple_grants.sql` in the private `ccs_backend` schema using the deployment migration administrator. Assign `apple_grants` to the existing restricted runtime table owner, matching the other private backend tables; grants alone do not bypass its RLS. Do not expose this schema to the Data API.
2. Install `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_CLIENT_IDS` and `APPLE_GRANT_ENCRYPTION_KEY` in the API's existing private `server.env`. The encryption key must be an independently generated 32-byte base64 key, retained with secure backups. The Apple PEM accepts literal backslash-n separators. Do not commit values or put them into Expo public settings.
   The prepared installer preserves an existing encryption key and updates the private environment atomically:
   ```sh
   node deploy/configure-apple-server.mjs /path/to/private/server.env /path/to/AuthKey.p8 TEAM_ID KEY_ID
   ```
   Run it as the existing environment-file owner so file ownership remains correct.
3. Deploy the tested API image to staging first, including the cleanup process with the same encryption/signing configuration. Losing the encryption key prevents pending revocations.
4. Exercise native code exchange and web provider-refresh-token capture with real consent. Confirm returning users also provide a usable grant; fail setup visibly if they do not.
5. Test same-account linking, Hide My Email, cancellation, explicit save transfers, Apple-only and mixed-account deletion, Apple outage retries, and stale cloud sessions.
6. After acceptance, remove the release gate and add `apple` to the production web provider manifest and EAS preview provider environment. Refresh the iOS provisioning profile for the new Apple entitlement, then build the preview. Keep App Store submission separate.

Automated validation: web unit suite, mobile domain/bridge suite, server grant-encryption/identity/retry tests, web/mobile typechecks and server compilation. Real PostgreSQL integration requires TEST_DATABASE_URL; local environment currently has no database. Mobile gesture checks use a browser adapter and still require iPhone/iPad acceptance.

No login reads, merges, replaces or deletes local practice history. Upload and Download remain explicit replacement actions.

## Owner setup, in order

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/enroll/) under the account that will own the app. Record its Team ID privately with the deployment credentials.
2. Choose the permanent application identifier with the mobile workstream before registration. Proposed production bundle/App ID: `com.cubingcompsim.app`. The proposal is not a registered ID and must match Expo `ios.bundleIdentifier`. Android can use the same reverse-domain package name, but its registration is separate. One Apple App ID can support iPhone and iPad.
3. In Apple Certificates, Identifiers & Profiles, create the explicit App ID, enable Sign in with Apple, and configure it as a primary App ID. Create a separate development/staging App ID if needed; do not silently register test builds as production.
4. Create a Services ID for web and Android browser-based Apple login. Proposed production value: `com.cubingcompsim.web`. Associate it with the primary App ID. Group related native/web identities deliberately so a returning user has the intended account across surfaces.
5. Configure the Services ID Website URLs with the Supabase domain and callback below. Apple's return URL is the Supabase callback, not the application homepage or custom mobile URI.
6. Create a Sign in with Apple key for that primary App ID, download its `.p8` file, and record its Key ID. Keep the private key in the deployment secret store, never Git, an issue, Expo public variables, or the mobile bundle.
7. Generate a signed Apple client-secret JWT using the Team ID, Key ID, `.p8`, and Services ID. Supabase's provider setup guide includes a generator. The secret expires within six months. Record its expiry, owner, and rotation process before launch; replace it before expiry and test both web and Android login after rotation.
8. Register the actual confirmation/recovery email sender domain or addresses under Apple's Sign in with Apple Email Communication service and satisfy SPF/DKIM requirements. Test mail to a real Hide My Email relay address.
9. Configure Supabase Apple provider only when the IDs and secret are ready. See below. Keep the production frontend gate closed until the deletion and acceptance checklists pass.

| Environment | Apple Services ID website domain | Exact Apple return URL |
| --- | --- | --- |
| Production | `mrxbjdkhtnojgoskhrfx.supabase.co` | `https://mrxbjdkhtnojgoskhrfx.supabase.co/auth/v1/callback` |
| Staging | `sgagluvbcsndtnwnmzbb.supabase.co` | `https://sgagluvbcsndtnwnmzbb.supabase.co/auth/v1/callback` |

These public project domains are read from the current deployment manifests. Use separate staging registrations or explicitly approved test configuration. Recheck manifests before setup.

## Supabase configuration

In Authentication > Sign In / Providers > Apple:

- Enable Apple with **Services ID first** in Client IDs, followed by the native App ID/bundle identifier. Current Supabase uses the first ID for browser OAuth and accepts the configured IDs as native token audiences. Putting the native ID first breaks web login.
- Install the generated Apple client-secret JWT. The `.p8` itself is not the client secret.
- Leave nonce validation enabled. Do not disable it to work around mismatched nonce generation.
- Keep manual identity linking enabled for authenticated Connect controls. Do not implement application-side account matching by email.
- Keep exact production/staging site origins and callback URLs in the Supabase redirect allowlist. Add the final mobile callback only once the mobile scheme/universal link is chosen. Avoid wildcard production redirects.
- Do not point Apple's server-to-server notifications at the Supabase callback. Supabase's current Apple guide states it does not implement these notifications. A separate application endpoint is needed if used.

The existing web callback handles the Supabase authorization code at `/?account=signin`, `/?account=link`, or `/?account=delete`, validates local intent, exchanges its PKCE code, verifies the expected Supabase user/provider, and removes callback credentials from the address bar. Apple sends its own `form_post` to Supabase, which then returns to our app. This branch does not change that sequence.

## Mobile flow

**iPhone/iPad:** use Expo AppleAuthentication with the official native button and `ios.usesAppleSignIn`/config plugin. Generate a fresh cryptographic raw nonce for each attempt, provide its SHA-256 digest to Apple's native request, and provide the original nonce and returned identity token to Supabase `signInWithIdToken({ provider: 'apple', token, nonce })`. Check the installed Expo API and hashing convention before implementation. Never reuse a nonce, log credentials, or disable verification. Save an optional name only when Apple supplies it, usually at first authorization; it is display data, not authorization evidence.

**Android:** Expo AppleAuthentication is iOS-only. Use Supabase browser OAuth in the system authentication browser, returning through an allowlisted mobile callback. Use PKCE/state and a callback tied to this app's request. Use the final mobile app's secure session adapter, not browser localStorage. Website uses the same browser OAuth provider.

Use a development build for final Apple acceptance. Expo Go may help with an early UI check, but Apple credentials/identifiers can differ from a standalone build. Test the actual app entitlement, bundle ID, callback, Hide My Email, cancellation, and account switching on a real iPhone/iPad.

Native `signInWithIdToken` authentication may produce a different signed AMR method from browser `oauth`. Inspect an actual verified Supabase session in a controlled test before extending the server reauthentication allowlist. Never infer recent authentication from `iat`, provider labels, client state, or editable metadata. Tests must cover both native and browser paths.

## Deletion and revocation behavior

Apple requires revoking its grant when deleting an account. The prepared server implementation captures grants during sign-in, verifies the Apple subject against the authenticated Supabase identity, encrypts the refresh token in a private table, and durably records whether deletion still requires revocation. All held client grants must be revoked before identity/cloud deletion. Failed Apple calls remain blocked and retryable; cleanup without Apple configuration fails closed.

The web callback uses Supabase's provider refresh token because Supabase has already consumed the browser authorization code. Native ID-token login leaves its separate authorization code available for the server exchange. Both actual provider responses must be tested on deployment. A missing grant fails setup rather than claiming successful revocation support. Native Apple account deletion currently opens the existing website confirmation flow.

Full names and Apple server-to-server notifications are not implemented. Name metadata is optional and does not affect access. Apple subjects are read from live server-owned identities, never user-editable metadata.

## Acceptance before enabling Apple

- Enrollment, registered IDs, entitlement, Services ID first, secret rotation owner/expiry, and email relay configuration complete.
- Replace the development Apple text control with Apple's approved web button artwork or official button renderer, preserve sufficient contrast/size, and use the official native button on iOS. Verify on light/dark themes and every supported locale.
- Fresh and returning Apple user, shared email and Hide My Email, consent cancellation, expired/missing nonce, wrong audience, wrong account, and replayed callback tested.
- Authenticated linking preserves the same Supabase user ID; account changes invalidate transfer/deletion prompts. Hide My Email does not silently create an email-based account merge.
- All three surfaces can access the same intended account and compatible cloud save. No login, linking, cancellation, or logout changes local history.
- Apple and mixed-provider account deletion revoke grants, survive Apple/API/network failures and retries, reject stale access, and leave other accounts untouched.
- Confirm optional native name handling and relay email delivery. Never require a real email address in place of Apple's relay address.
- Real iPhone/iPad development build, Android development build, website browser, and then TestFlight/Play testing accepted.
- Change environment manifests only in the reviewed release change. `node deploy/check-auth-providers.mjs deploy/environments/staging.json apple` verifies the initial redirect only and is not a completed sign-in/deletion test.

## Sources checked

- [Supabase Apple sign-in](https://supabase.com/docs/guides/auth/social-login/auth-apple): web/native flows, client ID ordering, expiration, relay registration, notification support.
- [Supabase signInWithIdToken](https://supabase.com/docs/reference/javascript/auth-signinwithidtoken): native ID-token exchange.
- [Expo AppleAuthentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/): platform support, native configuration/button/testing.
- [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/): deletion and grant revocation obligations.
- [Apple account deletion notice](https://developer.apple.com/news/?id=12m75xbj): revoke Apple tokens on deletion.
- [Apple Sign in with Apple](https://developer.apple.com/sign-in-with-apple/): platform and implementation resources.

The Supabase changelog markdown fetch failed in this environment; current provider/reference documentation was consulted directly. No actual Apple authentication or revocation has been tested without enrollment and registered credentials.
