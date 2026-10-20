import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { createSaveRepository } from './storage-core';

let database: Promise<SQLiteDatabase> | undefined;
async function getDatabase() {
  if (!database) {
    database = (async () => {
      const db = await openDatabaseAsync('cubing-comp-sim.db');
      // Additive migration from the foundation: the original state row is untouched.
      await db.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS app_recovery (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL);');
      return db;
    })().catch(error => { database = undefined; throw error; });
  }
  return database;
}

const repository = createSaveRepository({
  async read() {
    const row = await (await getDatabase()).getFirstAsync<{ body: string }>('SELECT body FROM app_state WHERE id = 1');
    return row?.body ?? null;
  },
  async readRecovery() {
    const row = await (await getDatabase()).getFirstAsync<{ body: string }>('SELECT body FROM app_recovery WHERE id = 1');
    return row?.body ?? null;
  },
  async write(body, backup) {
    const db = await getDatabase();
    if (!backup) {
      await db.runAsync('INSERT INTO app_state (id, body) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body', body);
      return;
    }
    // Both statements commit or roll back together. Never lose the recovery copy
    // because a replacement failed after its first statement.
    await db.withExclusiveTransactionAsync(async transaction => {
      await transaction.runAsync('INSERT INTO app_recovery (id, body) SELECT id, body FROM app_state WHERE id = 1 ON CONFLICT(id) DO UPDATE SET body = excluded.body');
      await transaction.runAsync('INSERT INTO app_state (id, body) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body', body);
    });
  },
});

export const loadSave = repository.load;
export const storeSave = repository.store;
/** Compare history and update only the draft inside the serialized write queue. */
export const storeDraft = repository.storeDraft;
/** Only call after explicit confirmation; retains the previous complete local save. */
export const replaceSave = repository.replace;
export const loadRecoverySave = repository.loadRecovery;
export const restoreRecoverySave = repository.restoreRecovery;
