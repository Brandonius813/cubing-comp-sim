import { validateHistorySnapshot, type HistorySnapshot } from '../storage';
import { CloudError, type AccountSession, type SaveMetadata, type CloudErrorCode } from './types';

const messages: Record<CloudErrorCode, string> = {
  not_configured: 'Cloud saves are not configured yet. Your times remain on this device.',
  offline: 'You are offline. Connect to upload or download a cloud save.',
  auth_required: 'Sign in again to use cloud saves.',
  email_unverified: 'Verify your email before using cloud saves.',
  conflict: 'The cloud save changed on another device. Review the latest save before uploading again.',
  no_save: 'This account does not have a cloud save yet.',
  invalid_save: 'The save could not be validated. Your current times have not been changed.',
  too_large: 'This save exceeds the cloud size limit. Export a local backup instead.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
  auth_error: 'The account request failed. Please try again.',
  network_error: 'The cloud request could not finish. Your local times are unchanged.',
  server_error: 'The cloud service is unavailable. Your local times are unchanged.',
};

export function validateMetadata(value: unknown): SaveMetadata {
  const v = value as Partial<SaveMetadata> | null;
  if (!v || !Number.isSafeInteger(v.revision) || v.revision! < 1 || typeof v.savedAt !== 'string'
    || !Number.isFinite(Date.parse(v.savedAt)) || !Number.isSafeInteger(v.roundCount) || v.roundCount! < 0
    || !Number.isSafeInteger(v.attemptCount) || v.attemptCount! < 0 || !Number.isSafeInteger(v.bytes) || v.bytes! < 1
    || typeof v.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.sha256)) {
    throw new CloudError('invalid_save', messages.invalid_save);
  }
  return v as SaveMetadata;
}

export class CloudSaves {
  readonly configured: boolean;
  private readonly base: string;
  constructor(apiUrl?: string, private readonly fetcher: typeof fetch = fetch) {
    this.base = apiUrl?.replace(/\/$/, '') ?? '';
    this.configured = Boolean(this.base);
  }

  private async request(path: string, session: AccountSession, init: RequestInit = {}): Promise<unknown> {
    if (!this.configured) throw new CloudError('not_configured', messages.not_configured);
    if (!session?.accessToken) throw new CloudError('auth_required', messages.auth_required);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new CloudError('offline', messages.offline);
    let response: Response;
    try {
      response = await this.fetcher(`${this.base}${path}`, {
        ...init, credentials: 'omit', cache: 'no-store',
        headers: { ...init.headers, Authorization: `Bearer ${session.accessToken}` },
        signal: AbortSignal.timeout(120_000),
      });
    } catch { throw new CloudError('network_error', messages.network_error); }
    if (!response.ok) {
      const codes: Record<number, CloudErrorCode> = { 401: 'auth_required', 403: 'email_unverified', 404: 'no_save', 409: 'conflict', 413: 'too_large', 422: 'invalid_save', 429: 'rate_limited' };
      const code = codes[response.status] ?? 'server_error';
      throw new CloudError(code, messages[code]);
    }
    try { return await response.json(); }
    catch { throw new CloudError('invalid_save', messages.invalid_save); }
  }

  async getSaveMetadata(session: AccountSession): Promise<SaveMetadata | null> {
    const result = await this.request('/v1/save/metadata', session) as { save?: unknown };
    return result.save === null ? null : validateMetadata(result.save);
  }

  async upload(snapshot: HistorySnapshot, expectedRevision: number, operationId: string, session: AccountSession): Promise<SaveMetadata> {
    let validated: HistorySnapshot;
    try { validated = validateHistorySnapshot(snapshot); }
    catch { throw new CloudError('invalid_save', messages.invalid_save); }
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new CloudError('conflict', messages.conflict);
    const result = await this.request('/v1/save', session, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': `"${expectedRevision}"`, 'Idempotency-Key': operationId },
      body: JSON.stringify(validated),
    }) as { save?: unknown };
    return validateMetadata(result.save);
  }

  async download(session: AccountSession): Promise<{ metadata: SaveMetadata; snapshot: HistorySnapshot }> {
    const result = await this.request('/v1/save', session) as { save?: unknown; snapshot?: unknown };
    try { return { metadata: validateMetadata(result.save), snapshot: validateHistorySnapshot(result.snapshot) }; }
    catch { throw new CloudError('invalid_save', messages.invalid_save); }
  }
}
