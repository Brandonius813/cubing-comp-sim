# Offline TNoodle engine

The application must generate fresh scrambles and their drawings locally. There is no network generation service, pool of prerecorded scrambles, alternate algorithm, or silent fallback.

## Source and scope

The `vendor/tnoodle-lib` directory contains 72 byte-for-byte upstream source/reference files from [thewca/tnoodle-lib](https://github.com/thewca/tnoodle-lib), commit `d01a947d9f028f38085cda9b0507a9cf3d3f38a8` (2026-10-05). It contains the upstream FTO implementation. `upstream-lock.json` records every Git blob hash. `verify-vendor.mjs` recalculates the hashes before building.

Supported event identifiers: `222 333 444 555 666 777 333oh 333bf 444bf 555bf minx pyram skewb sq1 fto clock`. FMC and Multi-Blind are not exposed. The 4×4 mapping uses `FourByFourCubePuzzle`, never the fast random-turn variant. Clock has the same status in the app as other events.

The upstream TNoodle library is GPL-3.0 licensed. Its license is retained under `vendor/tnoodle-lib/LICENSE`; the browser build copies it beside the generated module. The public application repository supplies the complete vendored algorithms, adapters, and build scripts. Each CI engine manifest links to its exact application source commit, separately from the pinned upstream TNoodle commit. Keep that matching source available with every distributed web build. The application's own source license still needs an explicit owner decision before public deployment; repository visibility alone does not grant one. Native store distribution will receive a separate licensing review when native packaging begins. This app is a training simulator and does not claim WCA approval.

## Local build

Prerequisites: Node 22+, JDK 17+, Maven 3.9+. Maven needs network access on the first build to obtain the pinned TeaVM compiler and dependencies. Users of the finished app never need Java, Maven, or that connection.

From the repository root:

```sh
node engine/scripts/reference.mjs 2
node scripts/build-engine.mjs
node engine/scripts/conformance.mjs
node --test engine/scripts/svg-conformance.test.mjs
```

The reference command compiles and runs the original upstream code on the JVM with assertions enabled. It generates deterministic input fixtures for every event and checks parsing, minimum distance, and SVG generation. It writes under ignored `engine/target/`.

The browser command compiles through TeaVM 0.16.0 into an ES2015 JavaScript module. It places `tnoodle.js`, `manifest.json`, and `LICENSE.txt` in `public/engine/`. The manifest records the exact application source commit, upstream TNoodle source version, and output checksum. Compilation clears any earlier conformance proof. Successful conformance checks that the published module is exactly the tested module, then writes `public/engine/conformance.json` with its checksum, source identities, and per-event results. The production build must require a matching passed proof.

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

An active draft retains the generated SVG so a reload can resume the current solve. Completed attempts persist notation, event, generation time, and engine version without duplicating SVG markup for every solve. Historical drawings, when needed, must be reconstructed with the recorded engine version or clearly unavailable if that renderer is no longer present. Never silently redraw an old attempt with a different engine.

The engine can initialize tables at runtime. The first request for large puzzles may take materially longer. The service currently allows 180 seconds, terminates a stuck worker, and supports retry. Real device profiling must set the final performance budget. Do not describe the engine as ready before that first compile and runtime check has completed.

The website's service worker must cache the complete generated module and worker along with the app shell. An offline readiness indicator may only report ready after every required asset is present. The internet indicator itself must never disable local generation.

## Current evidence and remaining gates

On 2026-10-08, source verification passed for all 72 upstream files. GitHub Actions successfully compiled and ran the original JVM reference and compiled the browser engine with TeaVM. The first strict checks exposed and corrected the bounded-random runtime difference and Megaminx face-serialization difference documented above.

Runs [37852096123](https://github.com/Brandonius813/cubing-comp-sim/actions/runs/37852096123) and [37852467665](https://github.com/Brandonius813/cubing-comp-sim/actions/runs/37852467665) both passed the complete engine checks: 32 seeded fixtures across all sixteen events, JVM bounded-random vector comparisons, same-state and SVG comparisons, minimum-distance checks, sixteen fresh WebCrypto-generated scrambles, and rejection of excluded events. Run `37852467665`, job `113568559682`, also published the compiled engine artifact and corresponding conformance evidence.

Three local SVG comparator regression tests pass, including rejection of overlapping/missing faces and sensitivity to color, geometry, and within-face paint changes. The local Mac still lacks a JDK/Maven toolchain; the successful compilation evidence comes from the networked CI jobs.

Browser acceptance run `37853046752` is in progress at this evidence checkpoint. Engine conformance is green; actual browser offline behavior and application storage remain separate checks. Browser acceptance in Chromium, Firefox, and WebKit must:

- Load every event's engine while online, then switch the browser context offline.
- Reload the website offline and generate more fresh scrambles for every event.
- Confirm completed attempt notation and engine version persist after reload, and active draft notation/SVG pairs resume together.
- Exercise first initialization and repeated generation, and measure memory and latency.
- Confirm no scramble-generation requests leave the device.
- Check a failed engine update cannot leave app and engine versions mismatched.

Then smoke test actual Safari and ordinary desktop/laptop hardware. Passing tests provides evidence for this pinned release; it is not mathematical proof that a compiler or upstream software can never contain a defect.
