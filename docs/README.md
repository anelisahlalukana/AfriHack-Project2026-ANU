# Documentation

The project overview and quick start are in the [root README](../README.md). This folder holds the
detail.

## Start here

| Document | What it covers |
| --- | --- |
| [setup.md](setup.md) | Preparing the database: migrations and their order, staff roles, Supabase settings, and the checks to run against a real project. Also the compliance and reminders set-up |
| [architecture.md](architecture.md) | How the client, API and Supabase fit together; who can sign in and see what; the main flows; background work; storage |
| [api.md](api.md) | Every API route, its access rule and its purpose |
| [coding-standards.md](coding-standards.md) | The patterns to follow when changing code. Read before contributing |

## Features

| Document | What it covers |
| --- | --- |
| [pwa.md](pwa.md) | The installable app: manifest, service worker and caching, updates, and push notifications end to end, with testing and troubleshooting |
| [dashboard-and-client-pulse.md](dashboard-and-client-pulse.md) | The adviser dashboard and its charts, the Client Pulse scoring and check-in, and the client home |
| [claims_flow.md](claims_flow.md) | The claims and requests engine, the stage lists and the insurer portal |
| [reports.md](reports.md) | AI-assisted reports: templates, scope, the model and its fallbacks |

## Operations

| Document | What it covers |
| --- | --- |
| [ci-cd.md](ci-cd.md) | The CI checks, how the client and server deploy, secrets, branch protection and rollbacks |
| [demo-data.md](demo-data.md) | Seeding fictional data for demos, and how it removes itself |

## Reference

| Document | What it covers |
| --- | --- |
| [schema.md](schema.md) | The database schema (for context; not a runnable script) |
| [system_requirments.md](system_requirments.md) | The requirements gathered from the brief and Royal Square's answers (the filename keeps its original spelling so existing links work) |
| [style_reference/](style_reference/) | Mood-board images for the visual direction. Treat them as inspiration, not literal markup |

## Working notes

These record how the compliance module was reviewed and built. They are history, not a guide. Where
they disagree with the code or with [setup.md](setup.md), the code and setup.md win. In particular,
[compliance-handoff.md](compliance-handoff.md) records that the mock screening action was removed.

| Document | What it is |
| --- | --- |
| [compliance-project-review.md](compliance-project-review.md) | The pre-implementation review |
| [compliance-implementation-prompt.md](compliance-implementation-prompt.md) | The reviewed build prompt for that stage |
| [compliance-handoff.md](compliance-handoff.md) | The handoff, including a correction made against live data |

## Keeping the docs true

If a change alters behaviour, a route, a setting, a script or a threshold, update the matching
document in the same pull request. The places most likely to drift:

- environment variables: the tables in the [root README](../README.md);
- routes: [api.md](api.md);
- the service worker, its `VERSION` and the push flow: [pwa.md](pwa.md);
- scoring weights and thresholds: [dashboard-and-client-pulse.md](dashboard-and-client-pulse.md).
