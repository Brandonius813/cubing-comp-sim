# Agent guidance

## Before working

- Read `PROJECT_NOTES.md` and this file before taking a task.
- Work on the current approved checkpoint or a specifically assigned GitHub issue. Do not start later roadmap items on your own.
- The owner is learning software engineering. Explain the purpose and tradeoffs of unfamiliar tools and decisions in clear, concise language.

## Project decisions

- Keep work small enough for the owner to review and explain.
- Ask the owner to choose meaningful product or architecture tradeoffs. Once a choice is made, record the choice and rationale in `PROJECT_NOTES.md`.
- Prefer a small end-to-end step over building many abstract packages before they have a clear job.
- Treat WCA behavior and scramble correctness as requirements that need authoritative references and explicit evidence before implementation is considered correct.

## Public repository

- Treat every tracked file, commit, issue, pull request, and workflow log as public.
- Never commit credentials, access tokens, production user data, or private personal notes. Keep real values in the approved secret store; use placeholders in examples.
- Before proposing a commit or pull request, inspect the changed-file list and diff for accidental private data or secrets.

## Change workflow

- Keep commits focused and describe their purpose.
- Prefer a branch and pull request for proposed code or documentation changes. Keep `main` reviewable.
- Follow the task's requested verification. If verification is requested, report exactly what was run and what it established.
- Do not claim an unrun check passed.
