# Cubing Comp Sim

A focused desktop website for practicing competition rounds. Open it without an account, generate a scramble locally, and record results with the spacebar timer or manual entry. Browser storage saves rounds on this device. Accounts add explicit cloud upload and download.

**Status:** the first website implementation is on `feat/desktop-web-foundation`. It is not deployed to production. Provider accounts, live cloud integration tests, and release review are still required.

## What is implemented

- React and TypeScript interface based on the approved desktop Figma, with local fonts and puzzle icons.
- Sixteen events including FTO and Clock, with Clock last. No Fewest Moves or Multi-Blind.
- Original pinned TNoodle generation and drawing algorithms compiled into a local JavaScript worker. No scramble server or prerecorded pool.
- Space-only timer start, any-key stop, manual entry, inspection, independent penalties, round scoring, goals, and history.
- Transactional IndexedDB storage, unfinished-round recovery, file export/import, and conflict detection between tabs.
- Offline app caching after the first successful online load. Settings show connection and offline readiness separately.
- English/Spanish language settings and separately opt-in product analytics and error reporting.
- Optional Supabase accounts and a Fastify/PostgreSQL/private-object-storage API with one current save per user. Upload and download replace data; login does not transfer it.

Clearing browser site data can remove local history. Export a file or upload a cloud save to preserve it. The website must finish preparing its offline files before its first offline visit.

## Run locally

Use Node 24, JDK 21, and Maven 3.9 or newer. Java and Maven are build tools only; app users do not need them.

```sh
npm ci
npm run engine:verify
npm run dev
```

The first engine build downloads compiler dependencies and runs the original JVM implementation against the compiled browser implementation. Allow several minutes. The engine is generated under `public/engine/` and is not committed.

For the real offline website, build and preview production output:

```sh
npm run build
npm run preview
```

Development mode does not install the offline service worker. A production build refuses to proceed without a matching engine artifact and successful conformance report. `npm run build:ui` is a layout-only build and is not a releasable app.

Guest use requires no environment values. See [access setup](docs/access-setup.md) and [server operations](server/OPERATIONS.md) for hosted features. Keep private keys in ignored environment files or the hosting secret manager.

## Verify

```sh
npm run typecheck
npm test
node --test engine/scripts/svg-conformance.test.mjs
npm run engine:verify
npm run build
npx playwright install --with-deps chromium firefox webkit
BROWSER=chromium npm run test:browser
BROWSER=firefox npm run test:browser
BROWSER=webkit npm run test:browser
```

The browser suite uses the actual production engine with networking disabled, real IndexedDB, and the actual service worker. It saves screenshots and a trace under `test-results/browser/`. API checks run separately from `server/`.

## Project guide

- [Architecture and product specification](docs/architecture-spec.md)
- [Authentication alternatives and observability](docs/auth-and-observability.md)
- [Accounts and access needed for hosting](docs/access-setup.md)
- [Offline engine source, adaptations, and evidence](engine/README.md)
- [Project decisions and historical notes](PROJECT_NOTES.md)
- [Contribution guidance](AGENTS.md)

The vendored TNoodle code is GPL-3.0 licensed; its license and corresponding source are included. Asset licenses are under `public/assets/`. Review distribution obligations before releasing native apps. Website work comes first; native clients are a later phase.
