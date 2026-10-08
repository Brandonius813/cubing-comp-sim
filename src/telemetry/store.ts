import type { OutboxState, OutboxStore } from './types';

/** A separate database: telemetry never migrates, scans, or clears solve storage. */
export function createIndexedDbOutbox(): OutboxStore {
  let opening: Promise<IDBDatabase> | undefined;
  function open(): Promise<IDBDatabase> {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('Telemetry storage unavailable')); return; }
      const request = indexedDB.open('cubing-comp-sim-telemetry-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('outbox');
      request.onerror = () => reject(new Error('Telemetry storage unavailable'));
      request.onblocked = () => reject(new Error('Telemetry storage blocked'));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); opening = undefined; };
        resolve(database);
      };
    });
    return opening;
  }
  return {
    async read() {
      const database = await open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction('outbox', 'readonly');
        const request = transaction.objectStore('outbox').get('state');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Telemetry read failed'));
      });
    },
    async write(state: OutboxState) {
      const database = await open();
      return new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('outbox', 'readwrite');
        const store = transaction.objectStore('outbox');
        if (state.events.length === 0 && Object.keys(state.identities).length === 0) store.delete('state');
        else store.put(state, 'state');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('Telemetry write failed'));
        transaction.onabort = () => reject(new Error('Telemetry write aborted'));
      });
    },
  };
}
