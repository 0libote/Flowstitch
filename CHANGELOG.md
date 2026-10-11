# Changelog

## 0.1.2 — connection and dashboard UX

- Guided Todoist connection: single Connect Todoist setting opens a step-by-step token wizard with setup steps, token-page link and clearer validation errors. The separate token secret row is removed; tokens stay in Secret Storage on each device.
- Dashboard semantics: status renders as `output`, task groups as `ul`/`li`, Todoist links open with `noopener/noreferrer`, plus tighter settings typing and harness markup/tests.

Draft GitHub release. Not submitted to the community plugin registry. Live account and real Obsidian desktop/mobile acceptance checks remain release gates.

## 0.1.1 — settings hardening beta

- Searchable settings on Obsidian 1.13+, shared controls for older hosts, and stricter type-aware lint checks at API/frontmatter boundaries.
- Explicit API version guard for settings refresh, void render callbacks, sanitised save-failure notices and native span helpers.

Draft GitHub release. Not submitted to the community plugin registry. Live account and real Obsidian desktop/mobile acceptance checks remain release gates.

## 0.1.0 — local beta

- Native Todoist dashboard, capture, editing and task/note links.
- Unified v1 incremental sync with durable command UUIDs, offline cache/outbox and field conflicts.
- Opt-in Markdown task linking with guarded note edits and recurring-occurrence completion.
- Workflow presets including Website News, optional note creation and steps.
- Daily live views, completion snapshot preview and end-of-day selection.
- Device-local writing activation, SecretStorage, diagnostics and compatibility boundaries.
- Automated tests, production package and source-grounded research.

First GitHub release. Not submitted to the community plugin registry. Live account and real Obsidian desktop/mobile acceptance checks remain release gates.
