export interface AccountSession {
  accessToken: string;
  user: { id: string; email: string; emailVerified: boolean; providers?: string[]; wcaId?: string };
}

export type AccountProvider = 'google' | 'wca';
export interface AccountCallback { purpose: 'signin' | 'link' | 'delete'; status: 'success' | 'error'; provider?: AccountProvider; reason?: 'email_verification' | 'identity_conflict' | 'account_changed' | 'expired' }

export interface SaveMetadata {
  revision: number;
  savedAt: string;
  roundCount: number;
  attemptCount: number;
  bytes: number;
  sha256: string;
}

export type CloudErrorCode =
  | 'not_configured' | 'offline' | 'auth_required' | 'email_unverified'
  | 'conflict' | 'no_save' | 'invalid_save' | 'too_large' | 'rate_limited'
  | 'auth_error' | 'identity_conflict' | 'network_error' | 'server_error' | 'reauth_required' | 'account_deleting' | 'deletion_not_configured';

export type DeletionResult = { status: 'deleted' | 'pending' };

export class CloudError extends Error {
  constructor(public readonly code: CloudErrorCode, message: string) {
    super(message);
    this.name = 'CloudError';
  }
}
