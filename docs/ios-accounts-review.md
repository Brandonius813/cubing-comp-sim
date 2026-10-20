# Native account and cloud review

Implementation checkpoint, October 20, 2026. This is source/test evidence, not successful native or live-service acceptance.

## Implemented

- `AccountPanel` provides email sign-in, signup, password-reset requests, local sign-out, last-save checks, explicit upload/download confirmations, and password-confirmed account deletion through the existing API. Local history is not imported, uploaded, reset or deleted by authentication.
- Native sessions and PKCE intent/verifiers use Expo SecureStore, not SQLite or AsyncStorage. Small chunk sets are committed by switching a manifest last; failed chunk/manifest writes preserve the preceding credential. Chunk boundaries preserve Unicode code points. The accessibility class is `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Provider access/refresh tokens are stripped, matching the disabled Apple gate.
- Google/WCA OAuth uses the system authentication browser, PKCE, a random per-operation callback state, a ten-minute local intent, exact callback scheme/host/path checks, and one-use callback consumption. Both the browser completion and cold/warm Linking callback are handled. SDK state/PKCE validation remains active. Cancellation removes the pending intent. Auth mutations are serialized.
- Refresh runs only while the app is active. Before cloud actions, `getUser` validates the live identity and email verification, with account checks after asynchronous work. The API remains the authorization boundary; displayed local session metadata is not authorization.
- Transfers are explicit prepared confirmations tied to account ID and revision. An upload does not happen until confirmation; its existing API idempotency/conflict contracts are retained. Downloads are fully validated before the app's atomic replacement callback. Invalid data, expired confirmations and account changes cannot commit a transfer. Replacement must compare the captured local state and preserve a recovery copy in the storage adapter.
- Account deletion uses a separate password client so reauthentication cannot replace the primary session. Native Google/WCA deletion currently directs the user to the website for fresh provider confirmation.
- The backend now denies deletion of an account with a live Apple identity even when a linked email/password identity recently authenticated. Previously, the OAuth-method allowlist alone did not protect that mixed-provider case. This change deliberately retains the deletion block until real revocation exists.

## Integration contract

Render `mobile/src/accounts/AccountPanel.tsx` inside Settings. Supply:

```tsx
<AccountPanel
  getSnapshot={() => currentSave.history}
  replaceSnapshot={async (snapshot, expectedLocal) => {
    // Check expectedLocal is still current; validate, keep recovery copy,
    // atomically persist, update App state and clear the interrupted draft.
  }}
  disabled={practiceLocked}
  onBusyChange={setAccountBusy}
/>
```

Keep the component mounted once. Include `accountBusy` in navigation/practice locks. There are no default production credentials; absent configuration is visibly unavailable without blocking guest practice. Configuration names are in `mobile/accounts.env.example`. Do not copy its placeholders into a release.

The runtime requires `@supabase/supabase-js` pinned to the root version, Expo-compatible `expo-secure-store`, `expo-web-browser`, and `react-native-url-polyfill`. Add SecureStore's config plugin before a native build. The coordinator owns manifest/lock integration.

For opt-in staging OAuth, verify the Supabase redirect allowlist covers the fixed `cubingcompsim://auth/callback` scheme/host/path with the `ccs_state` query value. The requested redirect is `cubingcompsim://auth/callback?ccs_state=<UUID>`. A narrow staging glob may be needed for that query value; do not add a wildcard host/path or enable production providers without callback acceptance. Email confirmation/recovery finish on the configured web origin, then users return to the app to sign in.

## Actual verification

- Eleven Node mobile contract tests passed: chunked Unicode/protected session replacement and failure recovery, invalid manifest, PKCE callback constraints, authentication independence, public-key configuration rejection, explicit one-use account-bound transfers, invalid downloads, persistence failure, account switching, duplicate browser/deep-link completion, cancellation, and revoked sessions.
- Twelve focused server checks passed: signed/live account verification and eleven deletion checks, including mixed Apple/email fail-closed behavior. These use synthetic local data and mocked Auth responses, not real accounts.
- Root TypeScript passed in this worktree.
- Full server checks initially had three failures: one expected-shape assertion was fixed and re-run; two checks could not load missing `fastify` and `pg` packages in the inherited server dependency directory. They are environment/dependency blockers, not passing API/Postgres integration evidence.
- Mobile TypeScript reported missing `expo-secure-store`, `expo-web-browser` and generated engine assets in this isolated worktree. The pure accounts code otherwise produced no diagnostics. Native runtime compilation/export/device acceptance is not established by these tests.

## Remaining release gates

1. Install pinned native dependencies, configure a reviewed staging build, and compile the native application.
2. Test actual Keychain restoration, refresh, revoked/expired sessions, browser cancellation, and cold/warm callback delivery on both Apple devices. Test two synthetic accounts and delayed account changes during transfers.
3. Validate explicit upload/download across web and native against staging; verify revision conflicts and interrupted download recovery. No live account/cloud operations were performed here.
4. Add native provider reauthentication/deletion and native account linking if those providers will ship. Email confirmation/password recovery currently use the website. Native UI is English in this workstream.
5. Apple is still disabled. Server-owned verified grant capture, encrypted retention, retries, revocation before identity deletion, and real Apple identity/device acceptance are not implemented by this pass. Do not remove the hard release gate or enable Apple because the email/cloud path exists.
6. No live service configuration, database migration, production deployment, enrollment, paid operation or Apple secret was created.

## Official references checked

- https://supabase.com/docs/guides/auth/quickstarts/react-native
- https://supabase.com/docs/guides/auth/native-mobile-deep-linking
- https://supabase.com/docs/guides/auth/redirect-urls
- https://docs.expo.dev/versions/latest/sdk/securestore/

The Supabase changelog markdown fetch was attempted but rejected by the browsing tool's content-type handler. Installed SDK types and current official native documentation were checked; no claim is made that the unavailable changelog was reviewed.
