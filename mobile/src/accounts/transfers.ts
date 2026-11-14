import { validateHistorySnapshot, type HistorySnapshot } from '../../../src/storage/validation';
import { CloudError, type AccountSession, type SaveMetadata } from '../../../src/cloud/types';
import type { CloudSaves } from '../../../src/cloud/api';

export interface TransferTicket {
  readonly userId: string;
  readonly direction: 'upload' | 'download';
  readonly metadata: SaveMetadata | null;
  readonly snapshot: HistorySnapshot;
  readonly operationId: string;
}
/** A prepared transfer is a one-use confirmation, scoped to a live account.
 * Authentication never invokes this class. Replacement must be atomic in the
 * supplied persistence adapter and must preserve a recovery copy. */
export class ExplicitTransfers {
  private pending: TransferTicket | null = null;
  private busy = false;
  constructor(private readonly cloud: Pick<CloudSaves, 'getSaveMetadata' | 'upload' | 'download'>,
    private readonly session: () => Promise<AccountSession>, private readonly uuid: () => string) {}
  cancel(): void { this.pending = null; }
  async prepareUpload(local: HistorySnapshot): Promise<TransferTicket> {
    return this.prepare('upload', local);
  }
  async prepareDownload(): Promise<TransferTicket> { return this.prepare('download'); }
  private async prepare(direction: TransferTicket['direction'], local?: HistorySnapshot): Promise<TransferTicket> {
    if (this.busy) throw new Error('A cloud operation is already in progress.');
    this.busy = true; this.pending = null;
    try {
      const account = await this.session();
      const downloaded = direction === 'download' ? await this.cloud.download(account) : null;
      const metadata = downloaded?.metadata ?? (direction === 'upload' ? await this.cloud.getSaveMetadata(account) : null);
      if ((await this.session()).user.id !== account.user.id) throw new CloudError('auth_required', 'The account changed. Start the transfer again.');
      // Take a validated copy now so later local edits cannot alter confirmation.
      const snapshot = validateHistorySnapshot(downloaded?.snapshot ?? local);
      const ticket = { userId: account.user.id, direction, metadata, snapshot, operationId: this.uuid() };
      this.pending = ticket; return ticket;
    } finally { this.busy = false; }
  }
  async confirm(ticket: TransferTicket, replace: (snapshot: HistorySnapshot) => Promise<void>): Promise<SaveMetadata | null> {
    if (this.busy || this.pending !== ticket) throw new Error('This confirmation expired. Review the transfer again.');
    this.busy = true; this.pending = null;
    try {
      const account = await this.session();
      if (account.user.id !== ticket.userId) throw new CloudError('auth_required', 'The account changed. Nothing was replaced.');
      const snapshot = validateHistorySnapshot(ticket.snapshot);
      if (ticket.direction === 'upload') return await this.cloud.upload(snapshot, ticket.metadata?.revision ?? 0, ticket.operationId, account);
      // Local persistence must implement its own snapshot revision check if
      // practice can change while the confirmation is displayed.
      await replace(snapshot);
      return ticket.metadata;
    } finally { this.busy = false; }
  }
}
