# Development guide

[Project overview](../README.md) · [Documentation index](README.md)

## Prerequisites

Use **Node 24, JDK 21, and Maven 3.9 or newer**, matching the CI toolchain. Java and Maven build the scramble engine; people using the finished website do not need them. The first build requires network access to download compiler dependencies.

## Run locally

From the repository root:

```sh
npm ci
npm run engine:verify
npm run dev
```

Allow several minutes for the first engine build. It runs the upstream Java implementation, compiles the browser implementation, and compares their results. Generated files under `public/engine/` are not committed.

Guest use requires no environment values. To work on accounts or cloud saves, follow [provider setup](access-setup.md) and [API operations](../server/OPERATIONS.md). Keep private values in ignored environment files or the hosting secret manager. Browser-exposed `VITE_` settings must never contain private server credentials.

## Production and offline preview

After engine verification succeeds:

```sh
npm run build
npm run preview
```

Open the local URL printed by Vite. Development mode does not install the offline service worker; use the production preview to check caching and offline reloads. Serve the built app over HTTP rather than opening `index.html` as a file.

The production build requires the matching engine artifact and passed conformance report. `npm run build:ui` is only for layout work; it is not a complete releasable app.

## Checks

Run these from the repository root:

```sh
npm run typecheck
npm test
node --test engine/scripts/svg-conformance.test.mjs scripts/assert-engine.test.mjs
npm run engine:verify
npm run build
npx playwright install --with-deps chromium firefox webkit
BROWSER=chromium npm run test:browser
BROWSER=firefox npm run test:browser
BROWSER=webkit npm run test:browser
```

The browser suite uses the production engine, real IndexedDB, and the service worker. It checks offline reloads and fresh scramble generation with networking disabled, and writes evidence under `test-results/browser/`.

The API has its own dependencies and checks:

```sh
cd server
npm ci
npm run build
npm test
```

Set `TEST_DATABASE_URL` to a disposable local PostgreSQL test database to include the database integration checks. The **Cloud API checks** workflow provisions one automatically and also builds the Docker image. See [API operations](../server/OPERATIONS.md) for service configuration and the staging checks that CI cannot replace.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/ui/`, `src/styles/`, `src/App.tsx` | Simulator screens, dialogs, and presentation |
| `src/core/` | Events, round state, timing, scoring, and statistics |
| `src/scramble/` | Browser worker and scramble-engine interface |
| `src/storage/` | Browser persistence, settings, and history validation |
| `src/audio/`, `src/platform/` | Inspection audio, ambience, and offline status |
| `src/cloud/`, `src/telemetry/` | Optional account, cloud-save, and consent-based reporting clients |
| `engine/` | Pinned TNoodle source, Java/browser adapters, and conformance tools |
| `server/` | Optional cloud API, database migrations, and operations |
| `public/` | Service worker, static assets, and generated engine output |
| `scripts/`, `tests/e2e/` | Build safeguards and browser acceptance checks |
| `.github/workflows/` | CI and guest-preview deployment |
| `docs/` | Architecture, development, and operating references |

Tests for individual application modules live beside their implementation. Keep generated builds, dependency directories, test output, and private configuration out of commits.

## Review and deployment

Use a focused branch and pull request, inspect the diff, and report the checks actually run. [Contribution guidance](../CONTRIBUTING.md) describes owner review; [agent guidance](../AGENTS.md) applies to coding assistants.

Pull requests run checks without publishing. After application changes merge to `main`, the desktop workflow publishes the tested build to the existing Cloudflare guest preview. Documentation-only pushes do not trigger that deployment. See [Cloudflare deployment](cloudflare-deployment.md) for the exact process and manual reruns.
