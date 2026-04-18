# Dashboard

> **Stub.** The dashboard is an HTTP client of the daemon. It has no special API, no privileged endpoints, no unique state. Everything it does, any other client can do.

The v1 MVP delivers **file contracts + SSE + REST** (see `api.md`). The in-repo React/Vite dashboard is slated for rehabilitation as a consumer of the v1 API — tracked via GitHub issues, not spec'd here.

## Consumers of the API

The daemon serves, without preference:

- `aloop` CLI
- In-repo dashboard (React/Vite, to be rehabilitated)
- Any future integration (curl, scripts, IDE extensions, chat bots)

Third-party integrations (chat bots, webhooks, IDE plugins) are not part of v1. The API is designed so they can be added later without daemon changes.

If the dashboard needs something the CLI cannot do, it is a missing API — fix the API, not the dashboard.

## What's in scope for `next` wave 1

- No UI work.
- The API must expose every data shape the dashboard will eventually need: session list/detail, per-session event stream, global event bus, provider health, quota, overrides, scheduler permits, metrics, agent chunk streams.
- Rehab plan for the React code: first cut only needs `/v1/sessions` + `/v1/events` subscriptions. Everything else lands incrementally.

## What was here before

The pre-rebuild `SPEC.md` §Dashboard (~340 lines) and the Dashboard sections of `SPEC-ADDENDUM.md` described UI component taxonomy, responsive breakpoints, Storybook setup, and implementation details of the existing React app. Those concerns have moved to GitHub issues under the `dashboard` label. This file is intentionally thin because the dashboard's contract with the system is the API — nothing more.

See: `api.md`, `daemon.md`, GitHub label `dashboard`.
