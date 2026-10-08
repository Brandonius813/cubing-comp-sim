export interface SaveMetadata {
  revision: number; savedAt: string; roundCount: number; attemptCount: number; bytes: number; sha256: string;
}
export interface StoredSave extends SaveMetadata { objectKey: string }
export interface UploadReceipt { expectedRevision: number; sha256: string; save: SaveMetadata }
export interface SaveRepository {
  current(userId: string): Promise<StoredSave | null>;
  receipt(userId: string, operationId: string): Promise<UploadReceipt | null>;
  replace(userId: string, expectedRevision: number, operationId: string, incoming: Omit<StoredSave, 'revision' | 'savedAt'>): Promise<{ save: SaveMetadata; previousKey: string | null; replay: boolean }>;
  isCurrentObject(key: string): Promise<boolean>;
  pruneReceipts(): Promise<void>;
}
export interface SaveObjects {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  oldObjects(before: Date): AsyncIterable<string>;
}
export function publicMetadata(save: StoredSave): SaveMetadata {
  const { revision, savedAt, roundCount, attemptCount, bytes, sha256 } = save;
  return { revision, savedAt, roundCount, attemptCount, bytes, sha256 };
}
