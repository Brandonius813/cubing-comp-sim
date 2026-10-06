# Competition Cubing Simulator — project notes

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

1. **Choose the project home and shared source of truth.** Understand this local folder, the separate ChatGPT “Cubing Comp Sim” project, and what GitHub would add. Decide where project documents live and how future chats/agents find them. **Decision recorded below; repository bootstrap is next.**
2. **Learn and choose the Git/GitHub workflow.** Repository vs. working folder, commits, branches, pull requests, and later whether Git worktrees help parallel work. Create/connect a repository only after agreeing on its location and workflow. **In progress.**
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
- A stable local repository workspace has been chosen: `Documents/Codex/cubing-comp-sim`. Its local Git setup is in progress; no app code has been written.
- Local files are not automatically a GitHub backup or synced to another computer. A GitHub remote must be created and changes pushed.
- A separate ChatGPT project named **Cubing Comp Sim** exists. This chat is not currently attached to that project, and the ChatGPT project is not the same thing as this local folder or a GitHub repository.
- The desktop app's Projects view can also register local projects that connect chats to folders on this Mac. This folder is not currently registered as a local project. A cloud ChatGPT project and a local Codex project are different: the former shares project sources/instructions between its chats; the latter gives local chats access to the selected folder. Neither replaces Git history or a remote GitHub repository.
- GitHub CLI is installed, but its saved GitHub authentication is invalid. Re-authentication is needed before creating the public repository or publishing changes.
- No GitHub repository or issue board has been created yet. Decisions to use a public repository and GitHub Issues/Projects instead of Jira have been recorded below.
- Proposed repository slug: `cubing-comp-sim` (provisional until the public repository is created).

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

No product, architecture, hosting, or stack decisions have been made yet. Record future decisions here in this format:

### Decision: [short name]

- **Choice:**
- **Reason:**
- **Tradeoffs accepted:**
- **Revisit if:**
