# Provider authentication audit

## Findings

- An unfinished, unverified custom-provider identity can coexist with a confirmed email account for the same address. Supabase can then reject OAuth callbacks with `Multiple accounts with the same email address in the same linking domain detected`. An application email-string merge is not a safe repair. Resolve the incomplete identity through an authorized account cleanup, then authenticate both sides through the supported Connect flow. No account cleanup is included in this change.
- Linking and deletion confirmation previously exchanged a callback code before checking whether another tab had switched or signed out the active account. Check the initiating account before exchange. This guard covers a change already visible before exchange; it does not claim atomicity against changes during the network request.
- Duplicate identities and missing/expired redirect intent previously produced only a generic retry message. Return fixed, actionable messages without exposing raw provider errors. Already-linked errors returned directly by the SDK receive the same conflict handling.
- If browser storage rejected both setting and removing the intent, cleanup masked the intended authentication error. Cleanup now tolerates unavailable storage.

## Verification

Targeted unit tests cover Google and WCA sign-in/link callbacks, stable account IDs, stale-account and signed-out callbacks, duplicate-identity errors in query strings and fragments, URL credential cleanup, missing intent, unavailable storage, deletion proof, and provider-token stripping. These mock the auth SDK and do not establish provider consent, delivery, or live identity linking. Run `npx vitest run src/cloud src/ui/i18n.test.ts` and `npx tsc -b`.

## Required live acceptance

For each provider, use a controlled account to test consent, cancellation, return to the app, reload, sign-out, and sign-in again. Check the resulting user ID rather than just the visible email.

1. Verified email account followed by Google with the same verified email: retain the original account and cloud-save ownership.
2. Signed-in email account followed by Connect WCA: retain that account and show WCA connected; do not create an unrelated cloud-save owner.
3. Different-email provider: connect only from the authenticated account after provider authentication.
4. New WCA signup: complete any required email verification, then sign in again. Also test a WCA website account without a competitor ID.
5. Existing incomplete WCA signup colliding with an email account: show useful guidance; do not auto-merge or disable verification. Obtain explicit approval before deleting the unused signup, and first check sessions and application data.
6. Two tabs: change the active account while away at the provider, then return. The old linking/confirmation flow must not claim success.
7. Existing local results and settings must survive every success, cancellation, and failure. Cloud upload/download remains explicit.

Google branding approval is separate from these acceptance checks. No completed live provider flow is claimed by this audit.
