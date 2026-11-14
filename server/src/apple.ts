import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import type { Pool } from 'pg';
import type { VerifiedAccount } from './auth.js';
import { ApiError } from './errors.js';

export interface AppleConfig { teamId: string; keyId: string; privateKey: string; encryptionKey: string; clients: string[] }
export interface AppleGrant { clientId: string; token: string }
export interface AppleGrantStore {
  save(userId: string, clientId: string, encrypted: string): Promise<void>;
  list(userId: string): Promise<{ clientId: string; encrypted: string }[]>;
  remove(userId: string, clientId: string): Promise<void>;
}
export class PostgresAppleGrants implements AppleGrantStore {
  constructor(private readonly pool: Pool) {}
  async save(userId: string, clientId: string, encrypted: string) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId]);
      if ((await db.query('SELECT 1 FROM account_deletions WHERE user_id=$1', [userId])).rowCount) throw new ApiError(410, 'account_deleting');
      await db.query('INSERT INTO apple_grants(user_id,client_id,encrypted_grant) VALUES($1,$2,$3) ON CONFLICT(user_id,client_id) DO UPDATE SET encrypted_grant=EXCLUDED.encrypted_grant', [userId, clientId, encrypted]);
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { db.release(); }
  }
  async list(userId: string) {
    const result = await this.pool.query('SELECT client_id,encrypted_grant FROM apple_grants WHERE user_id=$1', [userId]);
    return result.rows.map(row => ({ clientId: String(row.client_id), encrypted: String(row.encrypted_grant) }));
  }
  async remove(userId: string, clientId: string) { await this.pool.query('DELETE FROM apple_grants WHERE user_id=$1 AND client_id=$2', [userId, clientId]); }
}
const issuer = 'https://appleid.apple.com';
const jwks = createRemoteJWKSet(new URL(issuer + '/auth/keys'));
/** Each grant is authenticated against the current server-verified Apple subject.
 * Tokens never enter logs or client storage. AAD prevents cross-account swaps. */
export class AppleGrants {
  private readonly key: Buffer;
  constructor(private readonly config: AppleConfig, private readonly store: AppleGrantStore,
    private readonly request: typeof fetch = fetch,
    private readonly verify = async (token: string, audience: string) => (await jwtVerify(token, jwks, { issuer, audience })).payload) {
    this.key = Buffer.from(config.encryptionKey, 'base64');
    if (this.key.length !== 32 || !config.clients.length) throw new Error('Invalid Apple server configuration');
  }
  private async secret(clientId: string) {
    return new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: this.config.keyId })
      .setIssuer(this.config.teamId).setSubject(clientId).setAudience(issuer).setIssuedAt().setExpirationTime('5m')
      .sign(await importPKCS8(this.config.privateKey.replace(/\\n/g, '\n'), 'ES256'));
  }
  private seal(userId: string, clientId: string, token: string): string {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(JSON.stringify([userId, clientId])));
    const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
  }
  private open(userId: string, clientId: string, encrypted: string): string {
    const bytes = Buffer.from(encrypted, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(JSON.stringify([userId, clientId]))); decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
  }
  async capture(account: VerifiedAccount, body: unknown): Promise<void> {
    if (!account.appleSubject || !body || typeof body !== 'object') throw new ApiError(400, 'invalid_apple_grant');
    const input = body as Record<string, unknown>;
    const { clientId, code, refreshToken } = input;
    if (typeof clientId !== 'string' || !this.config.clients.includes(clientId)
      || !((typeof code === 'string' && refreshToken === undefined) || (code === undefined && typeof refreshToken === 'string'))) throw new ApiError(400, 'invalid_apple_grant');
    const credential = (code ?? refreshToken) as string;
    if (!credential || credential.length > 8192) throw new ApiError(400, 'invalid_apple_grant');
    const params = new URLSearchParams({ client_id: clientId, client_secret: await this.secret(clientId),
      grant_type: typeof code === 'string' ? 'authorization_code' : 'refresh_token',
      [typeof code === 'string' ? 'code' : 'refresh_token']: credential });
    const response = await this.request(issuer + '/auth/token', { method: 'POST', body: params, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new ApiError(503, 'apple_grant_unavailable');
    const data = await response.json() as { id_token?: string; refresh_token?: string };
    if (typeof data.id_token !== 'string') throw new ApiError(503, 'apple_grant_unavailable');
    const claims = await this.verify(data.id_token, clientId);
    if (claims.sub !== account.appleSubject) throw new ApiError(403, 'apple_identity_mismatch');
    const token = data.refresh_token ?? refreshToken;
    if (typeof token !== 'string' || !token) throw new ApiError(503, 'apple_grant_unavailable');
    await this.store.save(account.id, clientId, this.seal(account.id, clientId, token));
  }
  async hasGrant(userId: string) { return (await this.store.list(userId)).length > 0; }
  async revoke(userId: string): Promise<void> {
    for (const grant of await this.store.list(userId)) {
      const token = this.open(userId, grant.clientId, grant.encrypted);
      const response = await this.request(issuer + '/auth/revoke', { method: 'POST', signal: AbortSignal.timeout(15000),
        body: new URLSearchParams({ client_id: grant.clientId, client_secret: await this.secret(grant.clientId), token, token_type_hint: 'refresh_token' }) });
      if (!response.ok) throw new ApiError(503, 'apple_revocation_unavailable');
      await this.store.remove(userId, grant.clientId);
    }
  }
}
