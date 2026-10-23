import { validateHistorySnapshot, type HistorySnapshot } from '../../src/storage/validation';
import { emptySave, validateMobileDraft, validateMobileSave, type MobileDraft, type MobileSave } from './practice';

/** SQL is injected so failure/ordering behavior can be exercised without a device. */
export interface SaveDriver {
  read(): Promise<string | null>;
  readRecovery(): Promise<string | null>;
  write(body: string, backup: boolean): Promise<void>;
}

export function createSaveRepository(driver: SaveDriver) {
  let tail: Promise<unknown> = Promise.resolve();
  function serialized<T>(action: () => Promise<T>): Promise<T> {
    const result = tail.then(action);
    tail = result.catch(() => undefined);
    return result;
  }
  function write(save: MobileSave, backup: boolean): Promise<void> {
    // Validate and serialize NOW, so mutation by a caller cannot alter a queued write.
    const body = JSON.stringify(validateMobileSave(save));
    return serialized(() => driver.write(body, backup));
  }
  return {
    load: () => serialized(async () => {
      const body = await driver.read();
      return body === null ? emptySave() : validateMobileSave(JSON.parse(body));
    }),
    store: (save: MobileSave) => write(save, false),
    replace: (save: MobileSave) => write(save, true),
    storeDraft: (draft: MobileDraft, expectedHistory: HistorySnapshot): Promise<boolean> => {
      // Capture immutable validated input before entering the queue. The current
      // settings/history must be read INSIDE it, after earlier explicit commits.
      const incoming = validateMobileDraft(draft, draft.scramble.eventId);
      const expected = JSON.stringify(validateHistorySnapshot(expectedHistory));
      return serialized(async () => {
        const body = await driver.read();
        // The caller initializes an empty save once at load, fixing exportedAt.
        if (body === null) return false;
        const current = validateMobileSave(JSON.parse(body));
        if (JSON.stringify(current.history) !== expected
          || current.preferences.eventId !== incoming.scramble.eventId
          || (current.draft !== undefined && current.draft.id !== incoming.id)
          || current.history.rounds.some(round => round.attempts.some(attempt => attempt.id === incoming.id))) return false;
        const next = validateMobileSave({ ...current, draft: incoming });
        await driver.write(JSON.stringify(next), false);
        return true;
      });
    },
    loadRecovery: () => serialized(async () => {
      const body = await driver.readRecovery();
      return body === null ? null : validateMobileSave(JSON.parse(body));
    }),
    restoreRecovery: () => serialized(async () => {
      const body = await driver.readRecovery();
      if (body === null) throw new Error('No recovery copy is available.');
      const valid = validateMobileSave(JSON.parse(body));
      // Backup and restore swap atomically, allowing an accidental restore to be undone.
      await driver.write(JSON.stringify(valid), true);
      return valid;
    }),
  };
}
