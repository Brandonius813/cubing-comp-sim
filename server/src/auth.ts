import { createClient } from '@supabase/supabase-js';
import { ApiError } from './errors.js';

export interface VerifiedAccount { id: string; emailVerified: boolean; passwordAuthenticatedAt?: number }
export type VerifyAccount = (authorization: string | undefined) => Promise<VerifiedAccount>;

/** Only a signed password AMR proves password entry; a refreshed iat does not. */
export function passwordAuthenticationTime(amr: unknown): number | undefined {
  if (!Array.isArray(amr)) return undefined;
  const times = amr.flatMap(entry => entry && typeof entry === 'object' && entry.method === 'password'
    && typeof entry.timestamp === 'number' && Number.isSafeInteger(entry.timestamp) && entry.timestamp > 0
    ? [entry.timestamp * 1000] : []);
  return times.length ? Math.max(...times) : undefined;
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
    const { data: claimsData, error: claimsError } = await client.auth.getClaims(token);
    if (claimsError || !claimsData) throw new ApiError(401, 'auth_required');
    const claims = claimsData.claims;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== `${url}/auth/v1` || !audience.includes('authenticated') || claims.role !== 'authenticated') throw new ApiError(401, 'auth_required');
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user || data.user.id !== claims.sub) throw new ApiError(401, 'auth_required');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.user.id)) throw new ApiError(401, 'auth_required');
    return { id: data.user.id, emailVerified: Boolean(data.user.email_confirmed_at), passwordAuthenticatedAt: passwordAuthenticationTime(claims.amr) };
  };
}
