import assert from 'node:assert/strict';

/** Run against the Vite development server so the production storage module is used directly. */
export async function checkBrowserStorage(browser, baseUrl) {
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  const name = `ccs-acceptance-${crypto.randomUUID()}`;
  try {
    for (const page of [first, second]) {
      await page.goto(`${baseUrl}/tests/e2e/harness.html`);
      await page.evaluate(async databaseName => {
        const storage = await import('/src/storage/index.ts');
        const core = await import('/src/core/index.ts');
        window.acceptance = { store: new storage.BrowserStore({ databaseName, broadcast: false }), core };
        window.acceptance.state = await window.acceptance.store.load();
      }, name);
    }
    // Both real tabs read revision zero. Exactly one concurrent write may commit.
    const winners = await Promise.all([first, second].map((page, index) => page.evaluate(async value => {
      const { store, core, state } = window.acceptance;
      const round = core.createRound(value === 0 ? '333' : 'clock');
      try { await store.saveRound(round, state.revision); return 'committed'; }
      catch (error) { return error.name; }
    }, index)));
    assert.deepEqual(winners.sort(), ['StorageConflictError', 'committed']);

    const result = await first.evaluate(async () => {
      const { store, core } = window.acceptance;
      let state = await store.load();
      const winner = state.rounds[0].id;
      if (state.rounds.length !== 1 || state.revision !== 1) throw new Error('Concurrent save lost or duplicated a round.');

      // The same store instance must also reject two operations from one revision.
      const competingSettings = await Promise.allSettled([
        store.saveSettings({ ...state.settings, inputMethod: 'manual' }, state.revision),
        store.saveSettings({ ...state.settings, inputMethod: 'manual' }, state.revision),
      ]);
      if (competingSettings.filter(item => item.status === 'fulfilled').length !== 1
        || competingSettings.filter(item => item.status === 'rejected' && item.reason.name === 'StorageConflictError').length !== 1) throw new Error('Same-instance stale writes were not rejected.');
      state = await store.load();
      if (state.revision !== 2) throw new Error('Same-instance conflict advanced the saved revision.');

      // An interrupted solve remains recoverable after closing and reopening IndexedDB.
      const scramble = { eventId: state.rounds[0].eventId, notation: 'test-only fixture', svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', engineVersion: 'test-only', generatedAt: Date.now() };
      state = await store.saveDraft({ roundId: winner, scramble, stage: 'solving', savedAt: Date.now() }, state.revision);
      window.acceptance.state = state;
      return { winner, revision: state.revision };
    });
    await first.reload();
    const recovery = await first.evaluate(async databaseName => {
      const { BrowserStore } = await import('/src/storage/index.ts');
      const core = await import('/src/core/index.ts');
      const store = new BrowserStore({ databaseName, broadcast: false });
      let state = await store.load();
      if (state.draft?.stage !== 'solving') throw new Error('Reload lost the interrupted solve.');
      const oldId = state.rounds[0].id;
      const exported = JSON.parse(await store.exportJson());
      const before = JSON.stringify(state);

      // Failed validation must leave history, draft, active round and revision intact.
      let refused = false;
      try { await store.replaceFromJson(JSON.stringify({ ...exported, activeRoundId: 'missing-round' }), state.revision); }
      catch { refused = true; }
      if (!refused || JSON.stringify(await store.load()) !== before) throw new Error('Invalid import changed local history.');

      const incomingRound = core.createRound('fto');
      const incoming = { app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: Date.now(), rounds: [incomingRound], activeRoundId: incomingRound.id };
      const previousRevision = state.revision;
      state = await store.replaceFromJson(JSON.stringify(incoming), previousRevision);
      if (state.rounds.length !== 1 || state.rounds[0].id !== incomingRound.id || state.draft !== null) throw new Error('Import did not replace all history atomically.');
      if (state.settings.inputMethod !== 'manual') throw new Error('Import replaced this device’s settings.');
      const backup = JSON.parse(await store.recoveryJson());
      if (backup.rounds.length !== 1 || backup.rounds[0].id !== oldId) throw new Error('Pre-replacement recovery is missing.');

      // Stale state from before replacement cannot resurrect the old history.
      refused = false;
      try { await store.saveRound(exported.rounds[0], previousRevision); }
      catch (error) { refused = error.name === 'StorageConflictError'; }
      if (!refused) throw new Error('Stale writer resurrected overwritten history.');
      const finalState = await store.load();
      store.close();
      return { oldId, revisionBeforeReplace: previousRevision, finalCount: finalState.rounds.length, finalEvent: finalState.rounds[0].eventId };
    }, name);
    assert.equal(recovery.oldId, result.winner);
    assert.equal(recovery.revisionBeforeReplace, result.revision);
    assert.equal(recovery.finalCount, 1);
    assert.equal(recovery.finalEvent, 'fto');
    await first.evaluate(async databaseName => {
      const { BrowserStore } = await import('/src/storage/index.ts');
      const core = await import('/src/core/index.ts');
      const store = new BrowserStore({ databaseName: `${databaseName}-edit`, broadcast: false });
      const fixture = eventId => ({ eventId, notation: 'test-only fixture', svg: '<svg/>', engineVersion: 'test-only', generatedAt: Date.now() });
      let state = await store.load();
      let historical = core.createRound('333');
      historical = core.addAttempt(historical, core.createAttempt(historical, { rawMs: 12_000, inputMethod: 'manual', scramble: fixture('333') }));
      state = await store.saveRound(historical, state.revision);
      const active = core.createRound('clock');
      const draft = { roundId: active.id, scramble: fixture('clock'), stage: 'ready', savedAt: Date.now() };
      state = await store.saveRound(active, state.revision, draft);
      const edited = core.editAttempt(historical, historical.attempts[0].id, { penalty: '+2' });
      state = await store.updateRound(edited, state.revision);
      const persisted = await store.load();
      if (persisted.activeRoundId !== active.id || JSON.stringify(persisted.draft) !== JSON.stringify(draft)) throw new Error('Editing old history changed the current round or draft.');
      if (persisted.rounds.find(round => round.id === historical.id).attempts[0].penalty !== '+2') throw new Error('Historical edit was not committed.');
      store.close();
    }, name);
    return 'Real IndexedDB: two-tab and same-instance CAS, draft reload, import rollback, replacement and recovery, and inactive history edits passed.';
  } finally {
    await context.close();
  }
}
