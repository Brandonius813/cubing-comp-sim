# Sign in with Apple: setup and release gates

Status: preparation only, October 15, 2026. Workstream: [#40](https://github.com/Brandonius813/cubing-comp-sim/issues/40). Mobile tracker: [#36](https://github.com/Brandonius813/cubing-comp-sim/issues/36).

Brandon approved React Native/Expo and Apple sign-in for web and mobile. He has not enrolled in the paid Apple Developer Program. No Apple credentials or identifiers have been registered by this change, and no production authentication settings were changed.

## What this branch implements

- Apple is a supported frontend provider key (`apple`) alongside Google and WCA, using the existing Supabase PKCE redirect and same-account linking protections.
- Provider copy covers sign-in, linking, connected state, and confirmation. Apple is absent from both environment manifests, so no Apple button appears in the deployed app.
- The initial redirect checker recognizes Apple's exact authorization host/path, callback, code flow, state, email scope, and `form_post` response mode.
- `assertProviderReleaseReadiness` deliberately rejects an Apple-enabled release. A passing redirect check cannot bypass the missing grant-revocation work.
- The server deletion allowlist deliberately still excludes Apple. Tests document this boundary. Do not advertise Apple account deletion as supported by this branch.
- Local acceptance can set `VITE_AUTH_PROVIDERS=google,wca,apple`. The current Apple UI is a development control, not the final approved Apple button artwork. Do not release this local configuration.

No login should read, merge, replace, or delete local practice history. Upload and Download remain explicit replacement actions.

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

## Required deletion and revocation implementation

Apple requires revoking the user's Apple grant when the user deletes an account. Deleting the Supabase user alone is not evidence that Apple tokens were revoked. Our current storage adapter intentionally discards `provider_token` and `provider_refresh_token`, and the API currently deletes Supabase identities without contacting Apple. This is the hard release blocker.

Proposed implementation contract for issue #40, to validate against the chosen Apple flow before coding:

1. Capture an Apple authorization code or provider refresh token during consent in a controlled, authenticated operation. Prefer a server-owned Apple grant exchange that verifies the Apple ID token signature, issuer, audience, nonce, expiry, and subject against the authenticated user's live Apple identity. A browser OAuth code already consumed by Supabase cannot be exchanged a second time. Do not assume `provider_refresh_token` will be returned for every native/browser SDK path.
2. Keep revocation credentials in an encrypted server-side grant table outside exposed schemas. Associate each record with the verified Supabase user ID, Apple subject, audience/client ID, token kind, and key version. Only the API/deletion worker may read it. Encryption keys and the Apple signing key live outside the database. No browser/mobile persistence or telemetry of Apple grants. Use authenticated transport and redact all credential-bearing request bodies.
3. If durable credentials are not available, obtain fresh Apple authorization at deletion time. A proposed `POST /v1/account/apple-grant` accepts a one-use authorization code plus the expected nonce challenge, bound to the currently authenticated account and a short-lived server-issued operation. Validate the result's subject against the live Apple identity before storing it or authorizing deletion. A guessed client-provided account ID, email, or decoded unsigned JWT must never choose the target. Final endpoint/contract is not implemented by this branch.
4. Extend the existing durable account-deletion job with a provider-revocation phase. Block further cloud writes first; retain enough encrypted grant and client-ID context to retry Apple `/auth/revoke` after transient failures. Revoke every grant held for the account's configured Apple clients, then delete its Supabase identity/cloud objects and erase the grant records. A failed revocation remains pending and retryable; do not mark deletion complete prematurely or ask the user to create a new account to retry.
5. Cover accounts linked to both Apple and Google/email. Deleting through any authentication method must revoke Apple too. Extending only the Apple reauthentication button is insufficient.
6. Add stale-token and deleted-user checks. Existing API `getClaims` plus live `getUser` rejects deleted users; deleting a user does not retroactively erase issued JWTs. Retain the account deletion block and verify old sessions cannot access saves throughout pending cleanup.
7. Consider Apple server-to-server revocation/account-change notifications. If implemented, verify Apple signed payloads, handle replay/idempotency, and scope updates by the verified Apple subject. Do not publish an unverified notification endpoint or assume Supabase handles it.

Once the real grant capture/revocation path and retry behavior pass, extend the API allowlist with Apple and the verified native AMR method, update the provider-token handling deliberately, and remove the hard release gate in the same reviewed change. No release should enable Apple in advance of that work.

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
