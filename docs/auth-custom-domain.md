# Branded authentication domain

Target: `auth.cubingcompsim.com`. The owner chose a paid Supabase upgrade on October 23, 2026. Supabase still returned `entitlement_required` for the Custom Domain add-on during preparation. No domain has been created or activated by this work.

## Owner console setup

1. Enable the production project's Custom Domain add-on on a paid Supabase plan.
2. In Cloudflare DNS, add a DNS-only CNAME `auth` targeting `mrxbjdkhtnojgoskhrfx.supabase.co`. Do not proxy it.
3. Add `https://auth.cubingcompsim.com/auth/v1/callback` to the existing Google OAuth web client and production WCA OAuth application. Retain the original Supabase callback.
4. In Apple's `com.cubingcompsim.web` Services ID configuration, add domain `auth.cubingcompsim.com` and that same HTTPS return URL. Retain the original domain/return URL. Native bundle ID and native Apple capability remain unchanged.

The available CLI can manage the Supabase domain. Local DNS/provider-console administration credentials were not available. No request to disclose them is necessary if the owner makes these console edits.

## Technical activation

- Inspect `supabase domains create --help` and `supabase domains get --help` before calling them; both were checked in preparation.
- After the CNAME and add-on exist: `supabase domains create --project-ref mrxbjdkhtnojgoskhrfx --custom-hostname auth.cubingcompsim.com`.
- Add the exact certificate verification TXT record returned by Supabase. Reverify and check the certificate/domain status. Certificate issuance can take up to 30 minutes per current Supabase documentation.
- Confirm all three provider callbacks before `supabase domains activate --project-ref mrxbjdkhtnojgoskhrfx`. Activation immediately changes advertised OAuth callbacks even for clients using the original project URL.
- Verify HTTPS, auth settings, and each provider's initial redirect. Perform real consent on device before claiming completed sign-in.
- Update EAS preview `EXPO_PUBLIC_SUPABASE_URL` to `https://auth.cubingcompsim.com` only after HTTPS and activation pass, then build. Preserve native SecureStore `storageKey: ccs-native-session` so the URL change does not select a different local credential slot.
- Prepare the production web manifest change separately for its existing tested publication workflow. The web client explicitly uses `ccs-auth-session`, so changing the hostname does not change its session storage key. Preserve that key and local history.
- Keep the backend's existing Supabase URL until token issuer behavior is verified. `server/src/auth.ts` strictly checks the verified token issuer against `${url}/auth/v1`; test a real new-domain session against the API before enabling it in the app. A custom API hostname is not proof that JWT issuer changes.

References: https://supabase.com/docs/guides/platform/custom-domains and https://supabase.com/docs/guides/auth/social-sign-in/auth-google. The original Supabase hostname remains available after activation.
