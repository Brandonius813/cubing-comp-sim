# Mobile TNoodle feasibility bridge

The first mobile implementation keeps the existing pinned TNoodle algorithms and places their compiled JavaScript in an isolated, locally bundled WebView. The app's screens, touch controls and timer remain React Native views. The React Native JavaScript runtime sends a small request and receives notation plus SVG; it never executes TNoodle's expensive generation work.

This is a feasibility implementation, not native-device acceptance or store-distribution approval. Keep the independent TNoodle license review open before distributing store binaries.

## Why this first experiment

The website already has a Java-to-JavaScript TNoodle release with reference fixtures for all sixteen supported events. React Native does not provide the browser's module Web Worker integration. Hosting that same compiled module in a separate WebView runtime is a small way to measure whether reuse works on both Apple and Android devices without rewriting algorithms or tying generation to a server.

The module uses the WebView's `crypto.getRandomValues`. No seeded-production, `Math.random`, online-generation or precomputed-scramble fallback exists. Missing secure randomness is an error. A WebView's hidden layout and separate execution context do not prove acceptable battery, memory, timing responsiveness or background behavior. Those are device gates.

## Runtime contract

```tsx
const engine = useMemo(() => new MobileScrambleService(), []);
// Keep this host mounted while the practice screen exists.
<TnoodleEngineHost key={engineRestart} service={engine} onStatus={setEngineStatus} />
const scramble = await engine.generate('333');
```

Only the validated `generate` action is available in the app bridge. The result retains the existing `GeneratedScramble` contract: event ID, exact notation, matching SVG, engine version and generation timestamp.

Each mounted host has a new channel ID. Requests have monotonic IDs and are serialized. The native side verifies the engine version and complete event list before sending work, then validates every response and checks its event against the pending request. Retired channels, unknown IDs and duplicate responses cannot change the current attempt. A bounded queue avoids unbounded concurrent requests.

Startup has a 15-second timeout; a dispatched generation has the existing website's 180-second timeout. These are temporary failure bounds, not acceptable performance targets. Process termination, invalid responses or a timeout reject pending work and unmount the computation host. Retry remounts a clean host. There is no claim that the engine continues running after the operating system suspends the app.

The WebView loads a static HTML string from the native JavaScript bundle. It has no remote URL, external script, font, table, image or CDN dependency. Its Content Security Policy blocks network/resource loads. Navigation is restricted to its initial blank document; file access, storage and shared cookies are disabled. The host receives no credentials or local history.

## Reproducible preparation

From the repository root, after installing the root development dependencies and the Java/Maven prerequisites:

```sh
npm run engine:verify
node mobile/scripts/engine-bundle.mjs
```

Alternatively, reuse an already verified artifact with its matching manifest, conformance proof and license:

```sh
node mobile/scripts/engine-bundle.mjs --engine-dir /absolute/path/to/public/engine
```

The builder reuses `scripts/assert-engine.mjs`. It checks the compiled bytes' SHA-256, pinned upstream commit, source identities, proof outcome, all sixteen fresh-generation results and at least two seeded reference cases per event. A mismatched or missing artifact blocks preparation.

The bundler removes only the generated module's final ESM export statement and wraps its unchanged algorithm body with the private message bridge. It rejects unexpected export syntax and closing-script injection. No minifier, runtime compiler or algorithm transpilation is added. The engine license and corresponding-source URL remain inside the bundle.

The generated `mobile/assets/engine.generated.ts` is about 650 KB with the current artifact. It is an ignored build output, not a second checked-in algorithm copy. The root vendored source and existing build pipeline remain authoritative. Re-run preparation whenever the engine or bridge changes.

## Automated verification

```sh
node --test mobile/scripts/engine-bundle.test.mjs
cd mobile
node --import tsx --test src/engine/service.test.ts
cd ..
node mobile/scripts/engine-verify.mjs
```

The focused tests cover channel and request isolation, queued jobs, timeouts and restart, mismatched event/version rejection, closing the host, unsupported events, missing secure randomness, and static resource restrictions.

The full verification command first boots the exact production HTML in a fresh Node VM with no DOM, fetch or network APIs. It generates fresh notation and SVG for all sixteen events. A separate test-only copy exposes the compiled conformance functions from the same transformed scope and checks the matching JVM fixtures, bounded-random vectors, puzzle states, SVGs and minimum-distance rules. Those test hooks are never written into the production asset. It also parses/draws the fresh production results and checks their distance constraints.

This creates ignored `mobile/assets/engine.verification.generated.json` with input-engine, production-document and reference-fixture hashes, case counts and measured durations. Its scope explicitly identifies Node VM evidence. It is not a native WebView proof.

For local diagnosis without the Java fixture file, `engine-verify.mjs --smoke` runs the production bridge's sixteen fresh generators only. That mode explicitly records zero fixture cases and cannot satisfy the full CI gate.

Local evidence on October 15, 2026: the three bundler/runtime tests and five service/protocol tests passed, and the exact production bridge generated all sixteen events in Node VM smoke mode using engine SHA-256 `37008dff9676c9c782da7b31bcb0cedf562a07e288bafb0ea16fa68267c17f57`. The first 4×4 request took 176.046 seconds; 4×4 blindfolded later took 8.328 seconds and FTO took 5.132 seconds. This is a serious cold-start performance issue to investigate, not a phone benchmark. The test ran zero reference fixtures because the local fixture file was unavailable. Native timing, audio, rendering and offline-installation tests remain unrun.

## Remaining native gates

- Install a standalone development/release build on an actual iPhone, iPad and Android device. Disable connectivity before first launch and generate fresh scrambles for every event. Loading from a development server or Expo Go is not this test.
- Run matching seeded/state/SVG reference checks inside the actual Apple and Android WebView runtimes. Node equivalence does not establish their compiler/runtime equivalence.
- Measure cold and warm 4×4/FTO latency, memory, battery and native touch/timer responsiveness. Existing website CI had slow cold initialization; these timeout bounds are not performance approval.
- Confirm the native SVG renderer displays each TNoodle drawing correctly, especially large cubes, Clock, Square-1 and FTO.
- Test closing/reopening, memory-pressure process termination, app suspension, failed startup, timed-out work and retry. Check stale messages cannot reach a new attempt.
- Verify no network request is necessary or attempted by the engine. Check `crypto.getRandomValues` availability on the minimum supported OS/WebView versions.
- Test updating the app with saved drafts from a previous engine version; preserve the stored notation and drawing rather than replacing them silently.

If the isolated WebView fails these gates, compare an explicitly hosted background JavaScript runtime/native bridge. The experiment does not authorize weakening the TNoodle correctness or offline requirements.

Implementation references: [React Native WebView guide](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md), [WebView API reference](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md), [WebCrypto getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues), and the repository's [engine documentation](../engine/README.md).
