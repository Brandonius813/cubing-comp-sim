# Cubing Comp Sim

**Practice the full rhythm of a speedcubing competition.**

Cubing Comp Sim is a browser app for rehearsing competition rounds: scramble your puzzle, wait for your turn, inspect, solve, and record your result. A persistent scorecard follows you through the round so you can focus on your next attempt.

Created and maintained by [Brandon True](https://github.com/Brandonius813).

**[Try the guest preview](https://morning-base-55f2.btrue813.workers.dev/)** · [Explore the documentation](docs/README.md) · [Run it locally](docs/development.md)

## Why it exists

A competition includes more than a timer. There is waiting between attempts, limited inspection time, and a small number of solves that determine your round result. This app brings that sequence into everyday practice, with controls for the pace and conditions of a simulated round.

## What you can do

- **Rehearse a round:** follow scramble, inspection, solve, and confirmation steps with Space and Enter to advance. Hold Space to arm the timer, release to start, and press any key to stop. Manual entry is also available.
- **Practice across 16 events:** generate fresh scrambles and puzzle drawings on your device, including cubes from 2×2 through 7×7, blindfolded events, Megaminx, FTO, and Clock.
- **Keep one scorecard in view:** edit times, apply +2 or DNF penalties, and track your round result without leaving the solve flow.
- **Review your progress:** explore completed rounds, event statistics, and the mean of three rounds. Export your history for a backup.
- **Set your practice conditions:** choose fixed or random waits up to five minutes, inspection voice and volume, theme, fonts, and interface language.
- **Use it without an account:** rounds stay in your browser. Once offline preparation finishes, you can return to the app and generate new scrambles without a connection.

## Current status

The desktop web app is available as an **early guest preview** and is under active development. Accounts and cloud saves require separately configured services; they are not needed for guest practice. Translation review, audio assets, and real-device testing are ongoing. Native apps are a later phase.

Local history belongs to the browser and site address you use. Export it before clearing site data or moving to another address.

## How it is built

The interface uses **React, TypeScript, and Vite**. An offline **TNoodle** engine generates scrambles and drawings in a background worker, while **IndexedDB** stores rounds on the device. Automated checks compare the browser engine with its Java reference and exercise the app in Chromium, Firefox, and WebKit. GitHub Actions publishes tested guest builds to **Cloudflare Workers**.

The optional account backend uses **Supabase Auth, Fastify, PostgreSQL, and private object storage**. Cloud upload and download are explicit actions; signing in does not automatically move or merge local results.

For implementation details, start with the [documentation index](docs/README.md) and [development guide](docs/development.md).

## Project ownership

This project is maintained by Brandon True. Public visibility allows people to inspect the work; changes to this repository remain under the owner's control. See [contribution and review guidance](CONTRIBUTING.md).

## Credits

Scramble generation and puzzle drawings use [TNoodle](https://github.com/thewca/tnoodle-lib). Its [GPL-3.0 license](engine/vendor/tnoodle-lib/LICENSE), source, and build adaptations are included; see the [engine documentation](engine/README.md). Font and icon notices are included under [public/assets](public/assets/). An application-wide license has not yet been selected.

Cubing Comp Sim is an independent training project and does not claim WCA approval.
