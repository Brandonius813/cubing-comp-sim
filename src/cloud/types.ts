export interface AccountSession {
  accessToken: string;
  user: { id: string; email: string; emailVerified: boolean };
}

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
  | 'auth_error' | 'network_error' | 'server_error' | 'reauth_required' | 'account_deleting' | 'deletion_not_configured';

export type DeletionResult = { status: 'deleted' | 'pending' };

export class CloudError extends Error {
  constructor(public readonly code: CloudErrorCode, message: string) {
    super(message);
    this.name = 'CloudError';
  }
}
