import type { Round } from '../core';
import { DEFAULT_SETTINGS, validateDraft, validateSettings } from './settings';
import type { Settings, SolveDraft } from './settings';
import { InvalidSaveError, parseHistoryJson, validateHistorySnapshot, validateRound } from './validation';
import type { HistorySnapshot } from './validation';

const DATABASE_VERSION = 1;
const STORES = ['meta', 'rounds', 'recovery'];

export interface LocalState {
  revision: number;
  rounds: Round[];
  activeRoundId: string | null;
  settings: Settings;
  draft: SolveDraft | null;
}

interface Metadata {
  key: 'state';
  revision: number;
  activeRoundId: string | null;
  settings: Settings;
  draft: SolveDraft | null;
}

interface RecoveryRecord { key: 'previous'; snapshot: HistorySnapshot }
interface StoreHandles { meta: IDBObjectStore; rounds: IDBObjectStore; recovery: IDBObjectStore }

export class StorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StorageError';
  }
}

export class StorageConflictError extends StorageError {
  constructor() {
    super('Your local history changed in another tab. Reload the latest history before saving again.');
    this.name = 'StorageConflictError';
  }
}

function storageError(error: unknown): Error {
  if (error instanceof StorageError || error instanceof InvalidSaveError) return error;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new StorageError('Browser storage is full. This change was not saved. Export your history before freeing space.', { cause: error });
  }
  return new StorageError('The browser could not save or read your history. No replacement was committed.', { cause: error });
}

function snapshot(state: LocalState): HistorySnapshot {
  return { app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: Date.now(), rounds: state.rounds, activeRoundId: state.activeRoundId };
}

function stateFromRecords(meta: Metadata | undefined, rounds: Round[]): LocalState {
  if (!meta || !Number.isSafeInteger(meta.revision) || meta.revision < 0) throw new StorageError('The saved history metadata is unreadable. It has not been reset.');
  const checked = validateHistorySnapshot({ app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: 0, rounds, activeRoundId: meta.activeRoundId });
  const settings = validateSettings(meta.settings);
  let draft: SolveDraft | null = null;
  if (meta.draft !== null) {
    const round = checked.rounds.find(candidate => candidate.id === meta.draft?.roundId);
    if (!round || round.id !== meta.activeRoundId || round.completedAt !== undefined) throw new StorageError('The in-progress solve has an invalid round reference.');
    draft = validateDraft(meta.draft, round.eventId);
  }
  return { revision: meta.revision, rounds: checked.rounds.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)), activeRoundId: checked.activeRoundId, settings, draft };
}

/**
 * One IndexedDB transaction commits the round, attempts, active round and draft.
 * Revisions are checked inside that transaction, so simultaneous tabs cannot
 * silently overwrite each other. Success is returned only on transaction complete.
 */
export class BrowserStore {
  private database: Promise<IDBDatabase> | null = null;
  private cachedState: LocalState | null = null;
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;
  private readonly name: string;
  private readonly factory: IDBFactory | undefined;

  constructor(options: { databaseName?: string; indexedDB?: IDBFactory; broadcast?: boolean } = {}) {
    this.name = options.databaseName ?? 'cubing-comp-sim';
    this.factory = options.indexedDB ?? globalThis.indexedDB;
    if (options.broadcast !== false && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`${this.name}:changes`);
      this.channel.onmessage = () => this.notify(false);
    }
  }

  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    if (!this.factory) return Promise.reject(new StorageError('This browser does not make local storage available. Times cannot be saved.'));
    this.database = new Promise((resolve, reject) => {
      const request = this.factory!.open(this.name, DATABASE_VERSION);
      let rejected = false;
      request.onupgradeneeded = event => {
        const db = request.result;
        if (event.oldVersion === 0) {
          const meta = db.createObjectStore('meta', { keyPath: 'key' });
          db.createObjectStore('rounds', { keyPath: 'id' });
          db.createObjectStore('recovery', { keyPath: 'key' });
          meta.put({ key: 'state', revision: 0, activeRoundId: null, settings: { ...DEFAULT_SETTINGS }, draft: null } satisfies Metadata);
        }
        // Future schema migrations belong here, in the upgrade transaction.
        // Never delete a database to recover from an upgrade error.
      };
      request.onblocked = () => {
        rejected = true;
        reject(new StorageError('Close other Cubing Comp Sim tabs so local history can be opened.'));
      };
      request.onerror = () => reject(storageError(request.error));
      request.onsuccess = () => {
        const db = request.result;
        if (rejected) { db.close(); return; }
        db.onversionchange = () => { db.close(); this.database = null; this.notify(false); };
        resolve(db);
      };
    });
    return this.database;
  }

  async load(): Promise<LocalState> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['meta', 'rounds'], 'readonly');
      const metaRequest = transaction.objectStore('meta').get('state');
      const roundsRequest = transaction.objectStore('rounds').getAll();
      transaction.onabort = () => reject(storageError(transaction.error));
      transaction.onerror = () => { /* The abort handler returns the failure. */ };
      transaction.oncomplete = () => {
        try {
          const state = stateFromRecords(metaRequest.result as Metadata | undefined, roundsRequest.result as Round[]);
          this.cachedState = state;
          resolve(state);
        }
        catch (error) { reject(storageError(error)); }
      };
    });
  }

  private async mutate(expectedRevision: number, operation: (state: LocalState, stores: StoreHandles) => LocalState): Promise<LocalState> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new StorageConflictError();
    const db = await this.open();
    // Obtain a validated snapshot before taking the write lock. The metadata CAS
    // below proves this snapshot is still current without reading every round.
    const baseline = this.cachedState?.revision === expectedRevision ? this.cachedState : await this.load();
    if (baseline.revision !== expectedRevision) throw new StorageConflictError();
    const result = await new Promise<LocalState>((resolve, reject) => {
      const transaction = db.transaction(STORES, 'readwrite');
      const stores: StoreHandles = { meta: transaction.objectStore('meta'), rounds: transaction.objectStore('rounds'), recovery: transaction.objectStore('recovery') };
      const metaRequest = stores.meta.get('state');
      let next: LocalState | undefined;
      let operationError: unknown;
      const abort = (error: unknown) => {
        operationError = error;
        transaction.abort();
      };
      const apply = (state: LocalState) => {
        try {
          next = operation(state, stores);
          next.revision = state.revision + 1;
          stores.meta.put({ key: 'state', revision: next.revision, activeRoundId: next.activeRoundId, settings: next.settings, draft: next.draft } satisfies Metadata);
        } catch (error) { abort(error); }
      };
      metaRequest.onsuccess = () => {
        try {
          const meta = metaRequest.result as Metadata | undefined;
          if (!meta) throw new StorageError('The saved history metadata is unreadable.');
          if (meta.revision !== expectedRevision) throw new StorageConflictError();
          // Only this metadata record is read during the write transaction.
          apply(baseline);
        } catch (error) { abort(error); }
      };
      transaction.onerror = () => { /* IndexedDB aborts all writes on request error. */ };
      transaction.onabort = () => reject(storageError(operationError ?? transaction.error));
      transaction.oncomplete = () => {
        if (!next) { reject(new StorageError('Local save did not complete.')); return; }
        this.cachedState = next;
        resolve(next);
      };
    });
    this.notify(true);
    return result;
  }

  saveRound(round: Round, expectedRevision: number, draft: SolveDraft | null = null): Promise<LocalState> {
    const checked = validateRound(round);
    const checkedDraft = draft === null ? null : validateDraft(draft, checked.eventId);
    if (checkedDraft && (checkedDraft.roundId !== checked.id || checked.completedAt !== undefined)) throw new InvalidSaveError('The draft does not belong to an unfinished round.');
    return this.mutate(expectedRevision, (state, stores) => {
      const rounds = state.rounds.filter(previous => previous.id !== checked.id);
      const checkedAttemptIds = new Set(checked.attempts.map(attempt => attempt.id));
      if (rounds.some(previous => previous.attempts.some(attempt => checkedAttemptIds.has(attempt.id)))) throw new InvalidSaveError('Attempt id belongs to another round.');
      stores.rounds.put(checked);
      return { ...state, rounds: [checked, ...rounds].sort((a, b) => b.createdAt - a.createdAt), activeRoundId: checked.id, draft: checkedDraft };
    });
  }

  saveSettings(settings: Settings, expectedRevision: number): Promise<LocalState> {
    const checked = validateSettings(settings);
    return this.mutate(expectedRevision, state => ({ ...state, settings: checked }));
  }

  saveDraft(draft: SolveDraft | null, expectedRevision: number): Promise<LocalState> {
    return this.mutate(expectedRevision, state => {
      if (draft === null) return { ...state, draft: null };
      const round = state.rounds.find(candidate => candidate.id === draft.roundId);
      if (!round || round.id !== state.activeRoundId || round.completedAt !== undefined) throw new InvalidSaveError('The draft does not belong to the active unfinished round.');
      return { ...state, draft: validateDraft(draft, round.eventId) };
    });
  }

  setActiveRound(id: string | null, expectedRevision: number): Promise<LocalState> {
    return this.mutate(expectedRevision, state => {
      if (id !== null && !state.rounds.some(round => round.id === id)) throw new InvalidSaveError('Active round not found.');
      return { ...state, activeRoundId: id, draft: id === state.activeRoundId ? state.draft : null };
    });
  }

  async exportJson(): Promise<string> {
    return JSON.stringify(snapshot(await this.load()));
  }

  /** Settings stay on this device; imported/cloud history replaces all events. */
  replaceFromJson(json: string, expectedRevision: number): Promise<LocalState> {
    const incoming = parseHistoryJson(json);
    return this.mutate(expectedRevision, (state, stores) => {
      stores.recovery.put({ key: 'previous', snapshot: snapshot(state) } satisfies RecoveryRecord);
      stores.rounds.clear();
      for (const round of incoming.rounds) stores.rounds.put(round);
      return { ...state, rounds: incoming.rounds.sort((a, b) => b.createdAt - a.createdAt), activeRoundId: incoming.activeRoundId, draft: null };
    });
  }

  /** One local pre-replacement copy. This is separate from the single cloud save. */
  async recoveryJson(): Promise<string | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('recovery', 'readonly');
      const request = transaction.objectStore('recovery').get('previous');
      transaction.onabort = () => reject(storageError(transaction.error));
      transaction.oncomplete = () => {
        try {
          const saved = request.result as RecoveryRecord | undefined;
          resolve(saved ? JSON.stringify(validateHistorySnapshot(saved.snapshot)) : null);
        } catch (error) { reject(storageError(error)); }
      };
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(broadcast: boolean): void {
    if (broadcast) this.channel?.postMessage({ changed: true });
    for (const listener of this.listeners) {
      // An observer failure must never turn a committed save into a failed save.
      try { listener(); } catch { /* Other observers must still receive the update. */ }
    }
  }

  close(): void {
    void this.database?.then(db => db.close(), () => undefined);
    this.database = null;
    this.cachedState = null;
    this.channel?.close();
    this.channel = null;
    this.listeners.clear();
  }
}
