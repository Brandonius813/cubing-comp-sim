# Contribution and review guidance

Cubing Comp Sim is maintained by [Brandon True](https://github.com/Brandonius813). Product direction, repository access, and merge decisions belong to the owner.

## Feedback and proposed changes

Use an issue to describe a bug or suggest an improvement. Include the event, steps to reproduce, expected behavior, browser, and device where relevant. Discuss substantial changes before starting implementation.

A pull request proposes a change for review; it does not grant write access or permission to merge. Public visitors can read the repository and work in their own forks without changing this repository.

## Owner review

- Keep each branch focused on one purpose and explain the user-visible result.
- Include relevant verification results and identify checks that were not run.
- Preserve upstream source attribution and third-party license notices.
- Keep credentials, private personal notes, and user data out of files, commits, issues, and logs.
- Leave merge and deployment decisions with the owner unless explicitly authorized for the task.

[Development instructions](docs/development.md) cover setup and checks. Coding assistants must also follow [AGENTS.md](AGENTS.md).

## Access and ownership

The repository is intended to have one human maintainer. GitHub's collaborator permissions control who can write; only grant access deliberately. Owner-authorized integrations can act within their configured permissions.

[CODEOWNERS](.github/CODEOWNERS) identifies Brandon as the review owner for all files. It does not replace access settings or enforce a merge restriction by itself. Branch rules are configured separately in GitHub.
