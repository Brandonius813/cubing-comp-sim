/* Bundled inside the isolated WebView, never imported by the React Native UI. */
function installEngineBridge(engine, configuration) {
  const { channel, engineVersion, events } = configuration;
  const send = message => globalThis.ReactNativeWebView.postMessage(JSON.stringify({ version: 1, channel, ...message }));
  if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function'
    || engine.engineVersion() !== engineVersion) {
    send({ type: 'error', code: 'ENGINE_UNAVAILABLE' });
    return;
  }
  let lastId = 0;
  globalThis.__ccsEngineReceive = request => {
    if (!request || request.version !== 1 || request.channel !== channel || request.type !== 'generate'
      || !Number.isSafeInteger(request.id) || request.id <= lastId) return;
    lastId = request.id;
    if (!events.includes(request.eventId)) { send({ type: 'error', id: request.id, code: 'UNSUPPORTED_EVENT' }); return; }
    try {
      const started = performance.now();
      if (request.notation !== undefined && (typeof request.notation !== 'string' || !request.notation.trim() || request.notation.length > 20000)) throw new Error('Invalid notation.');
      const [notation, svg] = request.notation === undefined ? engine.generate(request.eventId) : [request.notation, engine.draw(request.eventId, request.notation)];
      if (typeof notation !== 'string' || !notation.trim() || typeof svg !== 'string'
        || !svg.startsWith('<svg') || !svg.trimEnd().endsWith('</svg>')) throw new Error('Invalid engine output.');
      send({ type: 'result', id: request.id, durationMs: Math.max(0, performance.now() - started),
        scramble: { eventId: request.eventId, notation, svg, engineVersion, generatedAt: Date.now() } });
    } catch { send({ type: 'error', id: request.id, code: 'GENERATION_FAILED' }); }
  };
  send({ type: 'ready', engineVersion, events });
}
