# Google and WCA account rollout

Status: October 14, 2026. The owner registered the staging WCA application. Its custom OIDC provider is configured in staging Supabase, and live initial redirect checks passed for the callback, scopes, OAuth state and S256 challenge. WCA recognizes the registered application ID. The staging manifest enables WCA for controlled human acceptance; production remains gated. Actual consent/code exchange, any additional email confirmation, linking and cloud acceptance remain unverified. Google is not enabled by this change. Start WCA sign-in from CompSim, because the Authorize shortcut on WCA’s application administration page bypasses the app/Supabase flow and cannot complete its callback.

## What Brandon needs to provide

1. An owner-controlled Google Cloud project, OAuth consent configuration, and a **Web application** OAuth client for staging; a separate Google Cloud project and client for production later. Google setup needs a support email and developer contact email chosen by the owner. Add the staging testers while the consent screen is in Testing.
2. An owner-controlled [WCA OAuth application](https://www.worldcubeassociation.org/oauth/applications) for staging, with its application ID and secret. Use a separately registered application for production. The WCA login remains on the WCA website; Cubing Comp Sim never asks for a WCA password.
3. Configure the client ID/secret in the staging Supabase provider dashboard, or provide controlled access/private credential files so the operator can do it. Provider secrets never enter chat, frontend environment variables, Git, or public workflow logs.
4. Complete one real consent flow per provider using the staging site and a controlled account. WCA may also require an email confirmation; allow access to the chosen test inbox or complete that step yourself. Record acceptance without preserving email addresses, tokens, callback URLs containing codes, or personal profile data.

## Exact staging addresses

| Purpose | Value |
| --- | --- |
| App / Google authorized JavaScript origin | `https://staging.cubingcompsim.com` |
| Supabase project | `https://sgagluvbcsndtnwnmzbb.supabase.co` |
| Google authorized redirect URI | `https://sgagluvbcsndtnwnmzbb.supabase.co/auth/v1/callback` |
| WCA application redirect URI | `https://sgagluvbcsndtnwnmzbb.supabase.co/auth/v1/callback` |
| Supabase Auth Site URL | `https://staging.cubingcompsim.com` |
| Supabase allowed app redirect | `https://staging.cubingcompsim.com` |

Always compare the external provider callback to the read-only Callback URL shown in that project's Supabase provider form. An external provider returns to Supabase first; Supabase then returns to the app. The app uses its configured origin for its return URL. Production callbacks cannot be completed until the separate production Supabase project exists. They will have that project's own reference; do not register staging callbacks as production callbacks.

## Google registration

In the [Google Auth Platform](https://console.cloud.google.com/auth/overview), create or select the project, configure Branding with the app name and owner-selected support/contact emails, select the appropriate audience, and add test users for staging. Request only the basic sign-in scopes (`openid`, `email`, `profile`). Add a Web application client with the staging origin and exact Supabase callback above. Configure its client ID/secret in the [staging Google provider](https://supabase.com/dashboard/project/sgagluvbcsndtnwnmzbb/auth/providers?provider=Google) and enable Google.

Google's branding guidance calls for an app homepage, published privacy policy and terms of service, and verified authorized domains for production brand verification. The owner must approve those public documents and contact addresses; this task does not invent contact details or assert unpublished policies exist. Verify `cubingcompsim.com` through Google's requested ownership process when preparing the production consent screen. Select production publishing status only after acceptance and any required verification. Google's OAuth guidance calls for separate staging and production projects, each with its own clients, to isolate test redirects, consent settings and credentials. [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google), [Google production preparation](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance).

## WCA registration and direct OIDC configuration

Register a confidential WCA application named for the staging environment, with the exact Supabase callback. In [staging Supabase Auth Providers](https://supabase.com/dashboard/project/sgagluvbcsndtnwnmzbb/auth/providers), choose New Provider and Auto-discovery (OIDC):

| Field | Value |
| --- | --- |
| Identifier | `custom:wca` |
| Name | `World Cube Association` |
| Issuer | `https://www.worldcubeassociation.org` |
| Scopes | `public`, `openid`, `profile`, `email` |
| Client ID / secret | Values from the owner's staging WCA application |
| PKCE | Enabled |
| Allow users without email | Disabled |
| Skip nonce check | Disabled |

The production WCA discovery endpoint was read successfully on October 12. It resolves authorization to `/oauth/authorize`, tokens to `/oauth/token`, UserInfo to `/oauth/userinfo`, and public signing keys to `/oauth/discovery/keys`, with RS256 ID tokens. Its flat OIDC claims remove the need for a profile adapter. The older `/api/v0/me` route returns a nested `me` object and must not be used as this provider's UserInfo endpoint. The stable account identity is `sub` (the WCA website account ID); `preferred_username` carries the optional WCA competitor ID. A person without a WCA ID still has a WCA website account and must be able to sign in. [WCA discovery](https://www.worldcubeassociation.org/.well-known/openid-configuration), [WCA OIDC implementation](https://github.com/thewca/worldcubeassociation.org/blob/master/config/initializers/doorkeeper_openid_connect.rb), [WCA v0 OAuth documentation](https://docs.worldcubeassociation.org/knowledge_base/v0_api.html).

WCA's current public OIDC implementation does **not** emit `email_verified`. Supabase therefore handles that email as unverified and can send an additional confirmation before issuing a new account session. Keep email confirmation enabled and test delivery. Do not insert a constant verified-email mapping or disable verification to bypass the flow. Existing confirmed accounts and manual linking need their own acceptance checks. [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [Supabase callback handling](https://github.com/supabase/auth/blob/master/internal/api/external.go).

Supabase also automatically links supported OAuth identities with the same verified email after authenticating with the provider. The app does not compare email strings or attach accounts itself. The explicit Connect flow is needed when connecting another authenticated identity, especially one with a different email; enable **Allow manual linking** in Supabase Auth settings before accepting that feature. Do not describe all OAuth identities as separate accounts or promise that linking happens only through Connect. Treat the resulting Supabase user ID as the cloud-save owner. [Supabase linking strategies](https://supabase.com/docs/guides/auth/auth-identity-linking).

PKCE compatibility remains an explicit acceptance gate: the WCA discovery response does not advertise supported challenge methods, and its current public database schema lacks Doorkeeper's `code_challenge` column. That source evidence means enforcement cannot be assumed from the dependency's PKCE capability. Leave provider PKCE enabled while verifying the actual deployment. A redirect containing an S256 challenge proves that Supabase sends it; it does not prove WCA enforces it. If the actual consent/code exchange rejects PKCE, investigate with the WCA maintainers before choosing a documented server-side confidential-client exception. Browser-to-Supabase PKCE and OAuth state remain required in either case. [WCA schema](https://github.com/thewca/worldcubeassociation.org/blob/master/db/schema.rb), [Doorkeeper PKCE detection](https://github.com/doorkeeper-gem/doorkeeper/blob/v5.9.9/lib/doorkeeper/models/access_grant_mixin.rb), [Supabase custom providers](https://supabase.com/docs/guides/auth/custom-oauth-providers).

## Operator setup and release gates

`node deploy/configure-wca.mjs ENVIRONMENT_JSON PRIVATE_JSON` validates a private setup file and reports only public callback/scopes; it does not change the provider. Add `--apply` to create or update `custom:wca` and read it back. Private JSON must remain outside the public checkout in a directory with mode 700 and a file with mode 600, containing `projectRef`, `supabaseAdminKey`, `wcaClientId`, and `wcaClientSecret`. The key is an environment-specific server-only Supabase secret/admin key. Register the application before applying; the script does not create a WCA account/application. The frontend remains gated after provider setup.

`node deploy/check-auth-providers.mjs deploy/environments/staging.json google,wca` checks initial redirects using the publishable-key variable named by the manifest. It does not follow the redirect or sign a person in. Expected provider hosts, callback URI, OAuth state, authorization-code flow and WCA scopes/provider S256 challenge are verified without printing redirect state or responses. Check each provider separately while registrations are in progress. This check never edits the manifest.

After registration, pass the initial redirect check and establish usable confirmation-email delivery, then add that provider to the **staging** manifest's `authProviders` list and deploy the acceptance build. This opens the staging button for controlled testing; it does not authorize a production rollout. Accept its real consent flow, cancellation/error display, reload/session recovery, sign-out, and local-history preservation. For WCA, test a website account without a WCA competitor ID and the additional email confirmation. Also test connecting a second provider to a signed-in account while preserving the existing account/save. Test explicit upload/download with two controlled users to establish save isolation; login alone never uploads or replaces local history. If a provider fails acceptance, remove it from the staging list until repaired.

The deployment builder always writes `VITE_AUTH_PROVIDERS` from the selected manifest, overriding inherited values. It rechecks live initial redirects for every enabled provider before building, and records the enabled list in public deployment metadata. Keep the **production** list empty until staging human acceptance is recorded and separate production resources and registrations are configured. Test a controlled production release before announcing account availability. Initial redirect success is configuration evidence, not a claim of working human login or provider PKCE enforcement.
