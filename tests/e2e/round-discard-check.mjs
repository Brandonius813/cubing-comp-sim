import assert from 'node:assert/strict';

/** Transaction checks use real IndexedDB; these fixtures never replace the scramble engine. */
export async function checkRoundDiscard(page, databaseName) {
  const result = await page.evaluate(async name => {
    const { BrowserStore } = await import('/src/storage/index.ts');
    const core = await import('/src/core/index.ts');
    const options = { databaseName: `${name}-discard`, broadcast: false };
    const store = new BrowserStore(options);
    const stale = new BrowserStore(options);
    const fixture = eventId => ({ eventId, notation: 'storage-test-only', svg: '<svg/>', engineVersion: 'storage-test-only', generatedAt: Date.now() });
    const add = (round, rawMs) => core.addAttempt(round, core.createAttempt(round, { rawMs, inputMethod: 'manual', scramble: fixture(round.eventId) }));
    let state = await store.load();
    // Coarse browser clocks can give two rounds the same creation time. Insert
    // IDs in reverse prepend order so writes must apply the same tie-break as reads.
    const tiedCreatedAt = Date.now();
    let completed = { ...core.createRound('333'), id: '00000000-0000-4000-8000-000000000001', createdAt: tiedCreatedAt, updatedAt: tiedCreatedAt };
    for (const ms of [10_000, 11_000, 12_000, 13_000, 14_000]) completed = add(completed, ms);
    state = await store.saveRound(completed, state.revision);
    let partial = { ...core.createRound('333'), id: '00000000-0000-4000-8000-000000000002', createdAt: tiedCreatedAt, updatedAt: tiedCreatedAt };
    partial = add(add(partial, 31_000), 32_000);
    state = await store.saveRound(partial, state.revision, { roundId: partial.id, scramble: fixture('333'), stage: 'solving', savedAt: Date.now() });
    if (state.rounds[0].id !== completed.id || state.rounds[1].id !== partial.id) throw new Error('Equal-timestamp writes do not use the deterministic round ID order used by storage reads.');
    const completedBefore = JSON.stringify(state.rounds.find(round => round.id === completed.id));
    const before = JSON.stringify(state);
    const revision = state.revision;
    await stale.load();
    let rejected = false;
    try { await store.discardActiveRound(revision - 1, '222'); }
    catch (error) { rejected = error.name === 'StorageConflictError'; }
    if (!rejected || JSON.stringify(await store.load()) !== before) throw new Error('Stale discard changed history, settings, draft or active round.');

    // Abort after the round deletion is queued, before metadata can commit.
    const nativePut = IDBObjectStore.prototype.put;
    let injected = false;
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (this.name === 'meta' && value?.key === 'state' && value.activeRoundId === null) {
        injected = true;
        throw new DOMException('Injected discard metadata failure', 'QuotaExceededError');
      }
      return nativePut.call(this, value, ...args);
    };
    rejected = false;
    try { await store.discardActiveRound(revision, '222'); }
    catch { rejected = true; }
    finally { IDBObjectStore.prototype.put = nativePut; }
    if (!injected || !rejected || JSON.stringify(await store.load()) !== before) throw new Error('Failed discard did not roll back deletion, settings, draft and active round together.');

    state = await store.discardActiveRound(revision, '222');
    if (state.revision !== revision + 1 || state.activeRoundId !== null || state.draft !== null || state.settings.eventId !== '222') throw new Error('Discard did not atomically commit its metadata and event change.');
    if (state.rounds.length !== 1 || state.rounds[0].id !== completed.id || JSON.stringify(state.rounds[0]) !== completedBefore) throw new Error('Discard failed to remove the partial round or changed completed history.');
    let exported = JSON.parse(await store.exportJson());
    if (exported.rounds.length !== 1 || exported.rounds[0].id !== completed.id || exported.activeRoundId !== null) throw new Error('Discarded attempts remain in export.');
    const after = JSON.stringify(state);
    for (const operation of [() => stale.discardActiveRound(revision, 'clock'), () => stale.saveRound(partial, revision)]) {
      rejected = false;
      try { await operation(); } catch (error) { rejected = error.name === 'StorageConflictError'; }
      if (!rejected || JSON.stringify(await store.load()) !== after) throw new Error('A stale tab changed the discard or resurrected its round.');
    }
    store.close(); stale.close();

    const reopened = new BrowserStore(options);
    state = await reopened.load();
    if (JSON.stringify(state) !== after) throw new Error('Reopening storage recovered a discarded round or draft.');
    state = await reopened.setActiveRound(completed.id, state.revision);
    state = await reopened.discardActiveRound(state.revision, 'clock');
    if (state.rounds.length !== 1 || JSON.stringify(state.rounds[0]) !== completedBefore || state.activeRoundId !== null || state.draft !== null || state.settings.eventId !== 'clock') throw new Error('Ending a completed active round deleted its results.');
    exported = JSON.parse(await reopened.exportJson());
    reopened.close();
    return { rounds: exported.rounds.length, attempts: exported.rounds[0].attempts.length, event: state.settings.eventId };
  }, databaseName);
  assert.deepEqual(result, { rounds: 1, attempts: 5, event: 'clock' });
}
