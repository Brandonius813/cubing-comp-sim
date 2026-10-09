# Documentation

[Back to the project overview](../README.md)

The root README introduces the app. This directory contains development, design, and deployment references.

## Start here

| Goal | Read |
| --- | --- |
| Run, build, or test the app | [Development guide](development.md) |
| Understand the product and architecture | [Architecture specification](architecture-spec.md) |
| Find the code for a feature | [Repository map](development.md#repository-map) |
| Understand ownership and proposed changes | [Contribution and review guidance](../CONTRIBUTING.md) |

## Components and experience

- [Offline scramble engine](../engine/README.md): upstream source, browser adaptations, and correctness evidence.
- [Accounts and observability](auth-and-observability.md): identity, cloud saves, and optional diagnostics.
- [Language coverage](languages.md): available catalogs and review needs.
- [Audio assets](audio-assets.md): inspection voices and background recordings.

## Deployment and operations

- [Preview and environments](preview-and-environments.md): guest preview, staging, and production responsibilities.
- [Cloudflare deployment](cloudflare-deployment.md): tested build publication and troubleshooting.
- [Provider access setup](access-setup.md): service roles and required configuration.
- [API operations](../server/OPERATIONS.md): migrations, private storage, maintenance, and release checks.
- [Implementation handoff](implementation-handoff.md): dated verification evidence and remaining launch work.

## Maintenance records

[Project notes](../PROJECT_NOTES.md) preserve decisions and dated development history. Later decisions supersede earlier entries; the application and current checks establish implementation behavior. [Agent guidance](../AGENTS.md) describes the workflow for coding assistants.

All tracked documentation is visible with the repository, including maintenance records. This directory is an organizational boundary, not a privacy boundary; private notes and credentials belong outside it.
