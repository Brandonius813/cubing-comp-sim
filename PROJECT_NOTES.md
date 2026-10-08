# Cubing Comp Sim: project notes

## Approved implementation checkpoint (October 8, 2026)

This section supersedes all older product/stack/checkpoint statements below. Brandon approved the architecture specification with the following amendments and explicitly authorized implementation, parallel agents, and as much progress as possible. The earlier planning-only boundary is no longer active.

- Website first: React, TypeScript, Vite, custom CSS from the approved Figma. Native Mac/Windows/mobile work begins after the web version is stable. React Native is acceptable; platform languages are not required.
- Guest use needs no account. Local browser data clearing/loss is acceptable; normal app saves, imports, and transfers must remain transactional.
- Unlimited fresh OFFLINE TNoodle generation and TNoodle drawings are mandatory. Reuse pinned upstream source including the accepted unapproved FTO implementation. Do not substitute another algorithm or online service.
- Events: 2–7 cubes, OH, 3/4/5 BLD, Megaminx, Pyraminx, Skewb, Square-1, FTO, Clock. Exclude FMC/Multi-Blind. Clock last, ordinary label. No user-facing event approval/retirement badges or regulations-sync feature.
- Inputs: Space only starts keyboard timing; any key received by the active timer stops. Manual entry also supported. Ignore repeats and editable-field shortcuts.
- Cloud: explicit upload/download replacement, never merge. ONE current save per user. Temporary objects needed for atomic replacement and ordinary infrastructure backups are separate from a user-facing history feature.
- Settings: online/offline connection indicator; distinguish browser network hint from cloud reachability. Connection never gates local scrambling.
- Auth: Supabase Auth with production SMTP is the recommended initial implementation. Account login never implicitly transfers or deletes local history.
- Observability: explicit consent-based product events, separate opt-in client diagnostics, redacted server logs. No solve contents, passwords, reset links, or emails in telemetry.
- Full public implementation specification: docs/architecture-spec.md. Auth alternatives and metric definitions: docs/auth-and-observability.md. Required provider access: docs/access-setup.md.

## Current implementation status

Work is on feat/desktop-web-foundation, with separate reviewable commits. No production deployment or native release has occurred. Local shell network access is restricted. The connected GitHub API is used for branch updates and CI. The actual local checkout is a task-specific checkout; the existing Documents/Codex checkout is unchanged.

TNoodle Java reference and TeaVM compilation succeeded in GitHub Actions. Engine proof passed all 32 seeded fixtures and fresh WebCrypto generation for all 16 events. At application commit `22d7989cc5d465e921bbe6c8771221bef53134a8`, run 37859656656 passed all 84 application tests, seven integrity/SVG regression tests, and the complete Chromium/Firefox/WebKit suites with actual offline reload and fresh generation/drawings for every event. Run 37859656637 passed 21 API tests, actual PostgreSQL transactions, and the Docker build. Run 37859656458 reported zero known dependency vulnerabilities. Playwright 1.64.0 includes the upstream WebKit offline-emulation fix; no offline assertion was bypassed. First 4×4 generation took about 56 seconds in WebKit CI and needs real-device profiling before release. See docs/implementation-handoff.md for evidence, access needs, and remaining launch gates. This is not a production release.

Draft PR: https://github.com/Brandonius813/cubing-comp-sim/pull/2. The local task workspace connection became unavailable during the final handoff; the latest dependency lock and evidence updates are committed on GitHub. Fetch the remote feature branch before continuing from any older local checkout.

## Historical planning record

The following sections describe the earlier setup and are retained for context. They do not override the approved implementation scope above.


## Current setup status (verified 2026-10-06)

This section supersedes the older workspace and cloud status statements in the initial planning record below. Product ideas and the ordered roadmap remain unchanged.

- GitHub is the canonical source of truth: https://github.com/Brandonius813/cubing-comp-sim. The stable Mac working copy is `Documents/Codex/cubing-comp-sim`. At the start of this check, both `main` branches were at `02ca25e`; all four tracked files matched, and the local working tree was clean. No app code exists.
- This check runs inside the separate ChatGPT project. Its generated local mirror has project instructions and an empty `sources/` folder. It is separate from the Git checkout. Reusable local project registration was not verified.
- Codex Cloud originally listed a private `cubing-comp-sim` environment with **Unknown repository**. Opening it failed with **Couldn’t start editing environment**.
- GitHub access in the cloud repository picker works. A replacement draft was created with only `Brandonius813/cubing-comp-sim` selected. It appears in settings with the correct repository, private sharing, and **Unpublished** status.
- **Cloud setup is blocked:** the replacement’s **Continue setup** action also fails with **Couldn’t start editing environment**. The cause is unknown. The original environment was retained. No published replacement, cloud checkout, command execution, or fresh-task verification has been established.
- No app stack, dependencies, database, authentication, app hosting, or deployment configuration has been chosen. Codex Cloud provides a development environment; it does not deploy the app.

## Finish cloud setup

1. Open **Settings > Codex Cloud > Environments**. Choose the replacement with the correct repository and **Unpublished** label, then **Continue setup**. If the web action fails, try the desktop app.
2. Confirm the checkout, read `AGENTS.md` and this file, and run `pwd`, `git remote -v`, `git status --short --branch`, `git log -1 --oneline`, and `git ls-files`. Report actual outputs. No app dependencies need installation yet.
3. Review the setup, save, and publish. Confirm **Environment published**.
4. Start a fresh cloud task in that environment. Repeat the read-only repository and command checks without editing files or opening another PR.
5. Record the publication and verification results here before marking cloud setup complete. Retain the old environment until the replacement works.

## First branch and pull request exercise

This documentation change uses `docs/cloud-setup-status`, targeting `main`. A branch holds a separate line of changes. A commit saves a snapshot. A pull request shows the difference for review before merging.

The workflow is: refresh `main`, create a branch, make one bounded change, inspect the diff and run relevant checks, commit and push, then open a PR. Review **Files changed** before merging. After a merge, update the Mac working copy with a fast-forward pull. An open PR does not update either `main` automatically.

For this exercise, review the current setup facts and verification steps. The original Mac checkout remains unchanged while the documentation is proposed on GitHub. Cloud setup is still blocked regardless of whether the PR is ready.

## Initial planning record (historical setup status)

The workspace and cloud status statements below reflect the earlier foundation session. Use the current setup status above for those facts.


Last updated: 2026-10-06

This is the working source of truth for project decisions and next steps. Keep it current as decisions are made so a future chat or agent can continue without relying on chat history. Explain technical choices in beginner-friendly terms and record the reason for each decision.

## Project intent

Build a focused cubing app that helps a solver warm up for or simulate a WCA competition. The first impression should be “open the app and get going,” with the competition solve loop at the center. The work should be robust, understandable, and built in small, reviewable pieces. The owner wants to understand and make the important engineering decisions rather than hand the project to one large, opaque AI implementation.

The longer-term product may include a website and native iOS and Android apps, with user data syncing across them. It should collect useful stats without setup, work locally, and offer optional cloud backup/sync. No first-release platform or feature scope has been chosen yet.

## Product ideas captured so far

- Competition-style rounds: show and draw a scramble, optionally wait, begin inspection when ready, provide inspection callouts, record a result by timer or typing, and move to the next solve.
- A scorecard with editable times and penalties; calculate best/worst possible averages when the fifth solve is entered.
- Optional waiting time, background noise, and a round goal.
- Non-blocking stats/results panes, including BPA/WPA percentages, fastest/slowest solve, streaks, competition simulations by event, totals, and rolling averages such as Mo3.
- Scrambles for WCA events, with correctness and event coverage verified against the applicable WCA rules. TNoodle is the proposed starting point, not yet a technical decision.
- Local-first storage with optional account-based cloud sync/import. Possible sign-in methods include email/password, Google, and WCA; the account should stay minimal.
- A quick timer/typing mode switch, a short tutorial, and official cubing icons.
- A deliberate design process in which Brandon directs the product/design and an agent implements an approved design.

These are ideas, not commitments for version one. Product scope and rules must be decided before implementation.

## How we will work

- Make one meaningful decision at a time. For each, compare realistic options, explain the tradeoffs, recommend a default, and record the chosen option and rationale.
- Do not start a large implementation from the original feature dump. First settle the project home, product boundary, and foundations in small steps.
- Keep packages/modules independently understandable. Add a boundary only when it protects a real responsibility; avoid architecture for its own sake.
- Treat competition rules and scramble correctness as domain requirements with explicit sources and verification fixtures.
- Use small changes that can be reviewed and explained. Agents can help with bounded tasks, but important behavior and tradeoffs remain understandable to the owner.

## Ordered action list

Each item is a checkpoint, not permission to start all later work. We will finish and record one checkpoint before moving to the next.

1. **Choose the project home and shared source of truth.** Understand this local folder, the separate ChatGPT “Cubing Comp Sim” project, and what GitHub would add. Decide where project documents live and how future chats/agents find them. **Complete: public GitHub repository is the durable home for code/engineering decisions; the local folder is its working copy.**
2. **Learn and choose the Git/GitHub workflow.** Repository vs. working folder, commits, branches, pull requests, and later whether Git worktrees help parallel work. **In progress: Git is initialized locally; the public remote is created and the initial commits are pushed. Next: publish a Codex Cloud environment, then learn the branch/PR review loop.**
3. **Define the first user and product boundary.** Specify the primary competition-practice scenario, first-release platforms, one complete core loop, and what is explicitly deferred.
4. **Write down WCA behavior.** Verify inspection, +2/DNF handling, round size, averages, and BPA/WPA semantics from authoritative rules; identify which behavior is simulation guidance versus official competition procedure.
5. **Study scramble generation.** Evaluate TNoodle and alternatives, event-by-event coverage, WCA specification/versioning, licensing, runtime/platform compatibility, reproducibility, and a correctness test plan before selecting an implementation.
6. **Choose the app architecture and package boundaries.** Compare a shared codebase with separate clients for web and native apps. Define the smallest useful boundaries for rules/domain logic, scramble generation, storage/sync, and user interface.
7. **Design the data model and local-first behavior.** Define attempts, rounds, scrambles, settings, and stats; decide what is cached, how offline use works, what sync conflicts mean, and how data changes are migrated.
8. **Choose cloud, authentication, and sync.** Compare providers and costs; decide whether to launch without accounts first; assess email, Google, and WCA sign-in; define export/import, privacy, and account recovery.
9. **Choose the design workflow.** Create user flows and wireframes, select a design tool (Figma is one candidate), agree on visual direction and interaction details, then approve a design before UI implementation. Verify icon-set usage rights.
10. **Set up project management and agent collaboration.** Compare Jira and lighter alternatives against the chosen workflow. Define issue size, acceptance criteria, review cadence, and how agents can work remotely/asynchronously without bypassing review.
11. **Choose quality and reliability practices.** Define correctness tests for rules/scrambles, UI and cross-platform checks, accessibility, performance expectations, security/privacy review, and what must pass before changes merge.
12. **Choose hosting and operations.** Compare web hosting, API/database/auth hosting, environments, deployment, backups, monitoring, incident recovery, and costs at hobby scale and at larger scale.
13. **Plan a small end-to-end first release.** Turn approved decisions into a sequence of reviewable vertical slices (each slice works end to end), rather than implementing every package or feature at once.
14. **Release, learn, and maintain.** Decide how to get early cuber feedback, handle releases and app-store distribution, measure reliability and adoption, and keep dependencies/rules current.

## Workspace facts (checked 2026-10-06)

- This conversation began in a generated local Codex task folder under `Documents/Codex`, not in a Git repository. It is not registered as a reusable local project.
- Stable local repository workspace: `Documents/Codex/cubing-comp-sim`. Git is initialized on branch `main`; commits `4e804f9` and `d52b4a0` contain project documentation and workflow scaffolding only. No app code has been written.
- Public GitHub repository: [github.com/Brandonius813/cubing-comp-sim](https://github.com/Brandonius813/cubing-comp-sim). The local `main` branch tracks `origin/main`; both initial commits were pushed successfully.
- A separate ChatGPT project named **Cubing Comp Sim** exists. This chat is not currently attached to that project, and the ChatGPT project is not the same thing as this local folder or a GitHub repository.
- The desktop app's Projects view can also register local projects that connect chats to folders on this Mac. This folder is not currently registered as a local project. A cloud ChatGPT project and a local Codex project are different: the former shares project sources/instructions between its chats; the latter gives local chats access to the selected folder. Neither replaces Git history or a remote GitHub repository.
- GitHub CLI is installed and authenticated; it created the public repository and pushed the initial commits.
- The GitHub repository is the public source of truth. Keep credentials, private user data, and private planning out of it.
- GitHub Issues and Projects are the chosen starting tracker instead of Jira. No issue or project board has been created yet.
- Codex Cloud has not been configured yet. The official desktop/web flow is: **Work in > Cloud > Select environment > Create environment**, choose this GitHub repository, let Codex prepare and test setup, review it, then publish. Each task uses an isolated workspace; the published environment is the reusable setup, not a shared live checkout.

## Workspace and collaboration options (comparison, not decisions)

- **Local folder / local Codex project:** Code and notes stay on the Mac. Registering a folder as a local project can make it available to related Codex chats on that computer. It does not by itself create version history, an off-device copy, or a cloud coding environment.
- **ChatGPT project:** Good for organizing planning chats, shared instructions, and uploaded/connected sources across devices. It does not directly read a folder on the Mac; the sources have to be uploaded or connected.
- **GitHub repository:** Best candidate for the versioned source of truth for code and public-safe engineering/product docs. Owner prefers public visibility for portfolio value. Public means repository content and activity are visible to everyone and can be forked, so keep credentials, private user data, and personal-only planning out of it.
- **Work tracking:** GitHub Issues and Projects are the lightest starting point because they connect task cards to code changes and PRs. Jira is an option if workflow and reporting needs become complex; using it would still require GitHub for code.
- **Working away from the Mac:** Local Codex runs against the local workspace. Codex Cloud can run against a connected GitHub repo on an OpenAI-managed machine while the Mac sleeps, after a cloud environment is configured. This is a later setup decision, not enabled here.

References: [ChatGPT Projects and local projects](https://learn.chatgpt.com/docs/projects?surface=app), [GitHub repository visibility](https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories), [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects), [Codex Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments), [Codex commands and context status](https://learn.chatgpt.com/docs/developer-commands).

## Codex harness basics

- **Chat/thread:** the conversation and current task. Separate chats have separate transcripts.
- **Project/workspace:** selects the files and instructions a chat can use. For this software, the local folder is currently the workspace, but it is not registered as a reusable local project yet.
- **Execution environment:** where file edits and commands run. This task is local on the Mac. Codex Cloud is a separate remote environment that can use a connected GitHub repository.
- **Repository:** Git history and shared code/docs. There is no repository configured for this project yet.
- **Usage vs. context:** account usage is viewed in ChatGPT Settings > Usage; ChatGPT Work and Codex share usage. In a Codex chat, type `/` and choose `/status` to inspect chat context use and rate limits. `/compact` summarizes a long thread to free context. Usage is not a fixed number of messages; model and task size affect it.
- Keep durable project instructions in `AGENTS.md` or checked-in docs such as this file; do not depend on chat history alone.

Reference: [Codex command guide](https://learn.chatgpt.com/docs/developer-commands), [ChatGPT Work and Codex usage](https://learn.chatgpt.com/docs/pricing), [Projects and chats](https://learn.chatgpt.com/docs/projects).

## Decisions

### Decision: Public project home and work tracking (2026-10-06)

- **Choice:** Use a public GitHub repository as the canonical home for all code and engineering decisions. Use GitHub Issues and Projects instead of Jira for now. Prioritize getting the repository into Codex Cloud so the laptop is not a bottleneck.
- **Reason:** Public code and engineering history support the portfolio goal; GitHub keeps changes reviewable and accessible to local and cloud agents; its built-in issue/project tools keep tasks near code and pull requests.
- **Tradeoffs accepted:** Anyone can view and fork public repository content, so pushed files and issue/project discussions must be public-safe. Codex Cloud requires a connected repository and a configured environment before remote work can run.
- **Revisit if:** Public visibility becomes unsuitable, or project tracking grows beyond what GitHub Issues and Projects handle comfortably.

### Decision: Public repository created (2026-10-06)

- **Choice:** Publish the project foundation to `https://github.com/Brandonius813/cubing-comp-sim` as a public repository on `main`.
- **Reason:** This makes the source of truth accessible to Codex Cloud and keeps engineering decisions and change history reviewable for the portfolio.
- **Tradeoffs accepted:** Repository contents and activity are visible to everyone and can be forked. Review files and issue discussions for public suitability before pushing or posting.
- **Revisit if:** Any required content cannot safely be public; in that case remove it from the repository and reconsider visibility before adding further material.

No product, architecture, hosting, or stack decisions have been made yet. Record future decisions here in this format:

### Decision: [short name]

- **Choice:**
- **Reason:**
- **Tradeoffs accepted:**
- **Revisit if:**
