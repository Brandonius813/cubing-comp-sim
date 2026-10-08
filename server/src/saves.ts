import { createHash, randomUUID } from 'node:crypto';
import { gzip as gzipCallback, gunzip as gunzipCallback } from 'node:zlib';
import { promisify } from 'node:util';
import { validateHistorySnapshot, type HistorySnapshot } from '../../src/storage/validation';
import { ApiError } from './errors.js';
import { publicMetadata, type SaveMetadata, type SaveObjects, type SaveRepository } from './contracts.js';

export const MAX_SAVE_BYTES = 100 * 1024 * 1024;
const gzip = promisify(gzipCallback);
const gunzip = promisify(gunzipCallback);
export function uploadHeaders(ifMatch: string | undefined, operationId: string | undefined): { expectedRevision: number; operationId: string } {
  if (!ifMatch || !/^"(?:0|[1-9][0-9]*)"$/.test(ifMatch)) throw new ApiError(400, 'revision_required');
  const expectedRevision = Number(ifMatch.slice(1, -1));
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision >= 2_147_483_647) throw new ApiError(400, 'invalid_revision');
  if (!operationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) throw new ApiError(400, 'operation_id_required');
  return { expectedRevision, operationId };
}

export class SaveService {
  constructor(private readonly repository: SaveRepository, private readonly objects: SaveObjects, private readonly reportCleanupFailure: () => void = () => undefined) {}

  async metadata(userId: string): Promise<SaveMetadata | null> {
    const save = await this.repository.current(userId);
    return save ? publicMetadata(save) : null;
  }

  async upload(userId: string, input: unknown, expectedRevision: number, operationId: string): Promise<SaveMetadata> {
    let snapshot: HistorySnapshot;
    try { snapshot = validateHistorySnapshot(input); } catch { throw new ApiError(422, 'invalid_save'); }
    const bytes = Buffer.from(JSON.stringify(snapshot));
    if (bytes.length > MAX_SAVE_BYTES) throw new ApiError(413, 'too_large');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const receipt = await this.repository.receipt(userId, operationId);
    if (receipt) {
      if (receipt.sha256 !== sha256 || receipt.expectedRevision !== expectedRevision) throw new ApiError(409, 'idempotency_conflict');
      return receipt.save;
    }
    const current = await this.repository.current(userId);
    if ((current?.revision ?? 0) !== expectedRevision) throw new ApiError(409, 'revision_conflict');
    const objectKey = `saves/${userId}/${randomUUID()}.json.gz`;
    // Every upload gets a new object. It cannot damage the currently committed
    // save. If commit outcome is unknown, leave cleanup to the age-based sweep.
    await this.objects.put(objectKey, await gzip(bytes));
    const result = await this.repository.replace(userId, expectedRevision, operationId, {
      objectKey, sha256, bytes: bytes.length, roundCount: snapshot.rounds.length,
      attemptCount: snapshot.rounds.reduce((sum, round) => sum + round.attempts.length, 0),
    });
    const obsolete = result.replay ? objectKey : result.previousKey;
    if (obsolete) { try { await this.objects.delete(obsolete); } catch { this.reportCleanupFailure(); } }
    return result.save;
  }

  async download(userId: string): Promise<{ save: SaveMetadata; snapshot: HistorySnapshot }> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await this.repository.current(userId);
      if (!current) throw new ApiError(404, 'no_save');
      try {
        const raw = await gunzip(await this.objects.get(current.objectKey), { maxOutputLength: MAX_SAVE_BYTES });
        if (createHash('sha256').update(raw).digest('hex') !== current.sha256) throw new ApiError(500, 'save_integrity_failed');
        return { save: publicMetadata(current), snapshot: validateHistorySnapshot(JSON.parse(raw.toString('utf8'))) };
      } catch (error) {
        // A simultaneous replace may have removed the old object after this
        // request read its pointer. Retry only if the pointer actually changed.
        const latest = await this.repository.current(userId);
        if (latest?.revision !== current.revision) continue;
        if (error instanceof ApiError) throw error;
        throw new ApiError(503, 'save_unavailable');
      }
    }
    throw new ApiError(409, 'revision_conflict');
  }

  async cleanup(now = Date.now()): Promise<number> {
    let removed = 0;
    // An in-flight upload is never this old; API requests have a 2 minute limit.
    // No historic object can become current again because upload keys are unique.
    for await (const key of this.objects.oldObjects(new Date(now - 24 * 60 * 60 * 1000))) {
      if (!(await this.repository.isCurrentObject(key))) { await this.objects.delete(key); removed++; }
    }
    await this.repository.pruneReceipts();
    return removed;
  }
}
