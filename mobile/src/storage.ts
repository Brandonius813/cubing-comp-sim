import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { emptySave, validateMobileSave, type MobileSave } from './practice';

let database: Promise<SQLiteDatabase> | undefined;
async function getDatabase() {
  if (!database) {
    database = (async () => {
      const db = await openDatabaseAsync('cubing-comp-sim.db');
      await db.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL);');
      return db;
    })().catch(error => { database = undefined; throw error; });
  }
  return database;
}

export async function loadSave(): Promise<MobileSave> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ body: string }>('SELECT body FROM app_state WHERE id = 1');
  // A corrupt or unsupported save must be reported, never replaced with an empty one.
  return row ? validateMobileSave(JSON.parse(row.body)) : emptySave();
}

export async function storeSave(save: MobileSave): Promise<void> {
  const valid = validateMobileSave(save);
  const db = await getDatabase();
  // One SQLite statement atomically commits preferences and the entire compatible
  // history snapshot. A failed write leaves the previous snapshot untouched.
  await db.runAsync('INSERT INTO app_state (id, body) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body', JSON.stringify(valid));
}
