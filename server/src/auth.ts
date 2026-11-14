import { createClient } from '@supabase/supabase-js';
import { ApiError } from './errors.js';

export interface VerifiedAccount { id: string; emailVerified: boolean; passwordAuthenticatedAt?: number; oauthAuthenticatedAt?: number; appleIdentityLinked?: boolean; appleSubject?: string }
export type VerifyAccount = (authorization: string | undefined) => Promise<VerifiedAccount>;

/** Call only with verified JWT claims; a refreshed iat does not prove sign-in. */
function authenticationTime(amr: unknown, method: string): number | undefined {
  if (!Array.isArray(amr)) return undefined;
  const times = amr.flatMap(entry => entry && typeof entry === 'object' && entry.method === method
    && typeof entry.timestamp === 'number' && Number.isSafeInteger(entry.timestamp * 1000) && entry.timestamp > 0
    && Number.isInteger(entry.timestamp)
    ? [entry.timestamp * 1000] : []);
  return times.length ? Math.max(...times) : undefined;
}

export function passwordAuthenticationTime(amr: unknown): number | undefined {
  return authenticationTime(amr, 'password');
}

/** Requires server-owned identities from getUser, never browser/user metadata. */
export function oauthAuthenticationTime(amr: unknown, userId: string, identities: unknown): number | undefined {
  const authenticatedAt = authenticationTime(amr, 'oauth');
  if (authenticatedAt === undefined || !Array.isArray(identities) || !identities.length) return undefined;
  // OAuth AMR does not identify its provider. Fail closed if another social
  // provider is linked, rather than treating app_metadata.provider as proof.
  if (identities.some(identity => !identity || typeof identity !== 'object'
    || identity.user_id !== userId || !['email', 'google', 'custom:wca', 'apple'].includes(identity.provider))) return undefined;
  // A new provider authorization and code exchange authenticate this same
  // Supabase account. Provider browser sessions may be reused; this is not
  // proof that the provider asked for a fresh password. Identity timestamps
  // can remain unchanged on existing-account sign-in and are not AMR proof.
  return identities.some(identity => ['google', 'custom:wca', 'apple'].includes(identity.provider)) ? authenticatedAt : undefined;
}

export function bearerToken(authorization: string | undefined): string {
  if (!authorization || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization) || authorization.length > 16_384) {
    throw new ApiError(401, 'auth_required');
  }
  return authorization.slice(7);
}

export function createAccountVerifier(url: string, publicKey: string): VerifyAccount {
  const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return async authorization => {
    const token = bearerToken(authorization);
    // getClaims verifies the signature/expiry. getUser checks the current record
    // against the Auth service, including deleted users and verification state.
    // The SDK throws ordinary errors for expired/malformed claims rather than
    // returning an AuthError. Normalize them so invalid tokens return 401.
    const { data: claimsData, error: claimsError } = await client.auth.getClaims(token).catch(() => {
      throw new ApiError(401, 'auth_required');
    });
    if (claimsError || !claimsData) throw new ApiError(401, 'auth_required');
    const claims = claimsData.claims;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== `${url}/auth/v1` || !audience.includes('authenticated') || claims.role !== 'authenticated') throw new ApiError(401, 'auth_required');
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user || data.user.id !== claims.sub) throw new ApiError(401, 'auth_required');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.user.id)) throw new ApiError(401, 'auth_required');
    if (data.user.is_anonymous || claims.is_anonymous === true) throw new ApiError(401, 'auth_required');
    return {
      id: data.user.id, emailVerified: Boolean(data.user.email_confirmed_at),
      appleIdentityLinked: data.user.identities?.some(identity => identity.provider === 'apple') ?? false,
      ...(data.user.identities?.find(identity => identity.provider === 'apple')?.identity_data?.sub
        ? { appleSubject: String(data.user.identities.find(identity => identity.provider === 'apple')!.identity_data!.sub) } : {}),
      passwordAuthenticatedAt: passwordAuthenticationTime(claims.amr),
      oauthAuthenticatedAt: oauthAuthenticationTime(claims.amr, data.user.id, data.user.identities),
    };
  };
}
