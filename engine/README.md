# Offline TNoodle engine

The application must generate fresh scrambles and their drawings locally. There is no network generation service, pool of prerecorded scrambles, alternate algorithm, or silent fallback.

## Source and scope

The `vendor/tnoodle-lib` directory contains 72 byte-for-byte upstream source/reference files from [thewca/tnoodle-lib](https://github.com/thewca/tnoodle-lib), commit `d01a947d9f028f38085cda9b0507a9cf3d3f38a8` (2026-10-05). It contains the upstream FTO implementation. `upstream-lock.json` records every Git blob hash. `verify-vendor.mjs` recalculates the hashes before building.

Supported event identifiers: `222 333 444 555 666 777 333oh 333bf 444bf 555bf minx pyram skewb sq1 fto clock`. FMC and Multi-Blind are not exposed. The 4×4 mapping uses `FourByFourCubePuzzle`, never the fast random-turn variant. Clock has the same status in the app as other events.

The repository is GPL-3.0 licensed. Its license is retained under `vendor/tnoodle-lib/LICENSE`; the browser build copies it beside the generated module. Corresponding source includes the complete vendored algorithms, adapters, and build scripts here. The application publisher must provide the corresponding application source as required by its chosen distribution and licenses. This app is a training simulator and does not claim WCA approval.

## Local build

Prerequisites: Node 22+, JDK 17+, Maven 3.9+. Maven needs network access on the first build to obtain the pinned TeaVM compiler and dependencies. Users of the finished app never need Java, Maven, or that connection.

From the repository root:

```sh
node engine/scripts/reference.mjs 2
node scripts/build-engine.mjs
node engine/scripts/conformance.mjs
```

The reference command compiles and runs the original upstream code on the JVM with assertions enabled. It generates deterministic input fixtures for every event and checks parsing, minimum distance, and SVG generation. It writes under ignored `engine/target/`.

The browser command compiles through TeaVM 0.16.0 into an ES2015 JavaScript module. It places `tnoodle.js`, `manifest.json`, and `LICENSE.txt` in `public/engine/`. The manifest records the exact source version and output checksum.

The conformance command compares the compiled JavaScript's seeded puzzle states and drawings against the JVM reference. SVG attribute/style ordering is normalized and geometric coordinates are rounded to 1e-6 pixels. Colors and paint ordering must match. Megaminx alone traverses an upstream enum-keyed HashMap when drawing whole faces, so those face groups can appear in a different serialization order. The comparator requires exactly twelve convex, disjoint pentagons, eleven stickers per face, opaque fills, and common black borders before sorting intact face groups. Every sticker position/color and within-face paint order remains significant. A separate exact Megaminx move-sequence assertion also applies. A search using a time budget can find different valid move sequences for the same sampled state, so equality of scramble strings is not required for search-based events. The test also generates fresh WebCrypto scrambles for every event and checks minimum distance.

Do not release a generated engine that fails this comparison.

## Explicit platform adaptations

1. The original source is never modified in the vendor directory. `prepare-browser.mjs` copies sources into an ignored generated directory and replaces only `Puzzle.getSecureRandom()`. The JVM's SUN SHA1PRNG provider has no browser equivalent. TeaVM's `new SecureRandom()` uses browser WebCrypto. The randomness source changes; TNoodle's sampling, search, filtering, and drawing algorithms remain unchanged. Lack of WebCrypto is an error, never a reason to use Math.random.
2. The `compatibility/` directory defines inert GWT export annotations, an inert GWT marker interface, and the diagnostic logging methods the solvers call. GWT's old export runtime is not used. These do not implement puzzle behavior.
3. `EngineCommon` uses an explicit constructor mapping instead of TNoodle's reflective registry. It still constructs the original upstream puzzle classes and calls `generateWcaScramble` and `drawScramble` directly.
4. `BrowserEngine` exposes a small JavaScript boundary. Production generation uses fresh secure entropy. Seeded generation is exported only for conformance tests and is never called by application code.
5. `JvmCompatibleRandom` preserves Java's specified `Random.nextInt(bound)` mapping over raw entropy. TeaVM 0.16 uses a different, also uniform bounded-integer algorithm by default. That difference made identical seeds sample different puzzle states in the first CI run. The adapter restores the JVM contract for production and conformance inputs. A 96-value vector spanning powers of two, rejection-heavy bounds, puzzle bounds, and `Integer.MAX_VALUE` is compared with the real JVM before puzzle conformance assertions. No puzzle or drawing assertion was removed or weakened.

## Application contract

`src/scramble` exports:

```ts
const engine = createScrambleService();
const scramble = await engine.generate('333');
// { eventId, notation, svg, engineVersion, generatedAt: Date.now() }
engine.dispose();
```

Generation runs in a module Web Worker. Initialization and generation never occupy the timer/UI thread. The worker loads only a same-origin local engine module and checks its exact version. A missing module, unsupported event, secure randomness failure, or generator failure rejects the request. No solve can start without a complete notation/SVG pair.

The engine can initialize tables at runtime. The first request for large puzzles may take materially longer. The service currently allows 180 seconds, terminates a stuck worker, and supports retry. Real device profiling must set the final performance budget. Do not describe the engine as ready before that first compile and runtime check has completed.

The website's service worker must cache the complete generated module and worker along with the app shell. An offline readiness indicator may only report ready after every required asset is present. The internet indicator itself must never disable local generation.

## Current evidence and remaining gates

On 2026-10-08, local source verification passed for all 72 upstream files. This Mac environment cannot compile Java because it has only a Java 8 runtime and no JDK compiler. Networked GitHub Actions subsequently compiled and ran the original JVM reference successfully and compiled the browser engine with TeaVM successfully in run `37850793623`, job `113562901361`.

That first conformance run exposed the bounded-random difference described above at the 2×2 seeded-state assertion. It failed closed. Run `37851219759` then passed all twenty seeded cube cases through 5×5 blindfolded and all associated random-vector comparisons with the `webcrypto.2` adapter. It exposed Megaminx's irrelevant whole-face serialization ordering, addressed by the geometry-checked comparator described above. Three local comparator regression tests pass, including rejection of overlapping/missing faces and sensitivity to color/geometry/within-face paint changes. Full JVM/JavaScript conformance and real browser offline generation remain release gates until those checks pass. No compiled artifact has been fabricated.

After successful compilation/conformance, run a browser acceptance job in Chromium, Firefox, and WebKit that:

- Loads every event's engine while online, then switches the browser context offline.
- Reloads the website offline and generates more fresh scrambles for every event.
- Confirms notation and drawings persist with saved attempts after reload.
- Exercises first initialization and repeated generation, measures memory and latency.
- Confirms no scramble-generation requests leave the device.
- Checks a failed engine update cannot leave app and engine versions mismatched.

Then smoke test actual Safari and ordinary desktop/laptop hardware. Passing tests provides evidence for this pinned release; it is not mathematical proof that a compiler or upstream software can never contain a defect.
