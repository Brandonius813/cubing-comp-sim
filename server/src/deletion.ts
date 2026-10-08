import { createClient } from '@supabase/supabase-js';
import type { VerifiedAccount } from './auth.js';
import { ApiError } from './errors.js';
import type { SaveObjects } from './contracts.js';

export interface DeletionRepository {
  request(userId: string): Promise<void>;
  isBlocked(userId: string): Promise<boolean>;
  detachCloudData(userId: string): Promise<string | null>;
  complete(userId: string): Promise<void>;
  pending(): Promise<string[]>;
  pruneCompleted(): Promise<void>;
}
export type DeleteIdentity = (userId: string) => Promise<void>;
export type DeletionResult = { status: 'deleted' | 'pending' };

export function requireRecentPassword(account: VerifiedAccount, now = Date.now()): void {
  const authenticatedAt = account.passwordAuthenticatedAt;
  if (authenticatedAt === undefined || !Number.isFinite(authenticatedAt)
    || authenticatedAt < now - 5 * 60 * 1000 || authenticatedAt > now + 30_000) {
    throw new ApiError(403, 'reauth_required');
  }
}

export function createIdentityDeleter(url: string, serviceRoleKey: string): DeleteIdentity {
  // This separate admin client never accepts caller headers or client sessions.
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return async userId => {
    const { error } = await admin.auth.admin.deleteUser(userId, false);
    // Makes retries safe after a lost response or an interrupted cleanup process.
    const alreadyAbsent = error?.code === 'user_not_found' || (error?.status === 404 && /^user not found\.?$/i.test(error.message));
    if (error && !alreadyAbsent) throw new ApiError(503, 'identity_deletion_unavailable');
  };
}

export class AccountDeletion {
  constructor(private readonly repository: DeletionRepository, private readonly objects: Pick<SaveObjects, 'delete'>,
    private readonly deleteIdentity: DeleteIdentity, private readonly reportPending: () => void = () => undefined) {}

  isBlocked(userId: string): Promise<boolean> { return this.repository.isBlocked(userId); }

  async request(account: VerifiedAccount, confirmation: unknown): Promise<DeletionResult> {
    if (confirmation !== 'DELETE_ACCOUNT') throw new ApiError(400, 'confirmation_required');
    requireRecentPassword(account);
    // Persist the deletion request before contacting either external service.
    // Its per-account lock excludes any future cloud-save commit.
    await this.repository.request(account.id);
    return this.finish(account.id);
  }

  private async finish(userId: string): Promise<DeletionResult> {
    try {
      await this.deleteIdentity(userId);
      const objectKey = await this.repository.detachCloudData(userId);
      if (objectKey) await this.objects.delete(objectKey);
      await this.repository.complete(userId);
      return { status: 'deleted' };
    } catch {
      // The durable request remains blocked and will be retried by cleanup.
      this.reportPending();
      return { status: 'pending' };
    }
  }

  async retryPending(): Promise<{ completed: number; pending: number }> {
    const result = { completed: 0, pending: 0 };
    for (const userId of await this.repository.pending()) {
      const outcome = await this.finish(userId);
      result[outcome.status === 'deleted' ? 'completed' : 'pending']++;
    }
    await this.repository.pruneCompleted();
    return result;
  }
}
