import { emptySave, validateMobileSave, type MobileSave } from './practice';

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
