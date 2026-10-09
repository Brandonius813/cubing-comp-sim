/** Verify physical IndexedDB migration and rollback using genuine version-1 records. */
export async function checkStorageMigration(page, name) {
  await page.evaluate(async prefix => {
    const { BrowserStore, DEFAULT_SETTINGS } = await import('/src/storage/index.ts');
    const core = await import('/src/core/index.ts');
    const now = Date.now();
    const drawing = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
    const scramble = eventId => ({ eventId, notation: 'legacy migration fixture', svg: drawing, engineVersion: 'test-only-v1', generatedAt: now });
    let history = { ...core.createRound('333'), id: 'a-history' };
    history = core.addAttempt(history, core.createAttempt(history, { rawMs: 12_340, penalty: '+2', inputMethod: 'manual', scramble: scramble('333') }));
    // Reintroduce the old physical storage shape instead of going through new validation.
    delete history.attempts[0].inspectionPenalty;
    history.attempts[0].inspectionMs = 15_500;
    history.attempts[0].scramble.svg = drawing;
    const active = { ...core.createRound('clock'), id: 'b-active' };
    const draft = { roundId: active.id, scramble: scramble('clock'), stage: 'ready', savedAt: now };
    const meta = { key: 'state', revision: 7, activeRoundId: active.id, settings: { ...DEFAULT_SETTINGS, language: 'es' }, draft };
    const recovery = { key: 'previous', snapshot: { app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: now, rounds: [history], activeRoundId: history.id } };

    async function seed(databaseName, corrupt = false) {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('meta', { keyPath: 'key' }).put(meta);
          const rounds = db.createObjectStore('rounds', { keyPath: 'id' });
          rounds.put(history);
          rounds.put(active);
          db.createObjectStore('recovery', { keyPath: 'key' }).put(recovery);
          if (corrupt) {
            // This sorts after valid rows, so the migration must undo earlier cursor writes.
            const invalid = structuredClone(history);
            invalid.id = 'z-corrupt';
            invalid.attempts[0].id = crypto.randomUUID();
            invalid.attempts[0].roundId = invalid.id;
            invalid.attempts[0].rawMs = 'corrupt original value';
            rounds.put(invalid);
          }
        };
        request.onsuccess = () => { request.result.close(); resolve(); };
        request.onerror = () => reject(request.error);
      });
    }

    async function readRaw(databaseName) {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(['meta', 'rounds', 'recovery'], 'readonly');
          const metadata = tx.objectStore('meta').get('state');
          const rounds = tx.objectStore('rounds').getAll();
          const backup = tx.objectStore('recovery').get('previous');
          tx.oncomplete = () => resolve({ version: db.version, meta: metadata.result, rounds: rounds.result, recovery: backup.result });
          tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
    }

    const goodName = `${prefix}-migration`;
    await seed(goodName);
    const store = new BrowserStore({ databaseName: goodName, broadcast: false });
    const migrated = await store.load();
    if (migrated.revision !== 8 || core.attemptTimeMs(migrated.rounds.find(round => round.id === history.id).attempts[0]) !== 14_340) throw new Error('Migration changed the old effective result or failed to advance the revision.');
    store.close();
    const raw = await readRaw(goodName);
    if (raw.version !== 2 || raw.meta.revision !== 8 || raw.meta.activeRoundId !== active.id) throw new Error('Database upgrade did not commit the expected metadata.');
    if (JSON.stringify(raw.meta.draft) !== JSON.stringify(draft) || raw.meta.settings.language !== 'es') throw new Error('Migration changed the active draft or device settings.');
    for (const round of [...raw.rounds, ...raw.recovery.snapshot.rounds]) {
      for (const attempt of round.attempts) {
        if (Object.hasOwn(attempt.scramble, 'svg')) throw new Error('Migration left a historical SVG in the physical database.');
        if (attempt.scramble.notation !== history.attempts[0].scramble.notation || attempt.rawMs !== 12_340 || attempt.penalty !== '+2' || attempt.inspectionPenalty !== 'none') throw new Error('Migration changed historical source data or doubled its inspection penalty.');
      }
    }
    const reopened = new BrowserStore({ databaseName: goodName, broadcast: false });
    if ((await reopened.load()).revision !== 8) throw new Error('Reopening reran the completed migration.');
    reopened.close();

    const badName = `${prefix}-migration-rollback`;
    await seed(badName, true);
    const before = await readRaw(badName);
    const invalidStore = new BrowserStore({ databaseName: badName, broadcast: false });
    let rejected = false;
    try { await invalidStore.load(); } catch { rejected = true; }
    invalidStore.close();
    if (!rejected) throw new Error('Migration accepted a corrupt historical attempt.');
    const after = await readRaw(badName);
    if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error('Failed migration changed the database version, revision, history, recovery, or draft.');
  }, name);
}
