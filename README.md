# Flowstitch

Your notes and tasks, seamlessly connected.

A native Obsidian desktop/mobile plugin that connects directly to Todoist's unified API v1. Version 0.1.0 is a local beta build: automated tests pass; live Todoist and real Obsidian desktop/mobile acceptance checks are still required before community publication. No other community plugin is required.

## Install

1. Build with Node 24 or later: `npm ci && npm run check && npm run package`.
2. Copy `dist/flowstitch/` into `<your vault>/<configuration folder>/plugins/flowstitch/`. The usual configuration folder is `.obsidian`; customised folders are supported.
3. Restart Obsidian 1.11.4 or later and enable **Flowstitch** in Community plugins.
4. Run **Flowstitch: Connect Todoist**. Paste your personal API token into the connection wizard. It is stored only in Obsidian Secret Storage on that device.
5. Open the dashboard. In Flowstitch settings, explicitly enable writing on one device when ready to manage tasks and sync Markdown. Keep your other devices read-only initially.

Installation does not create your Work project, routines or master template. The wizard discovers existing projects and uses Work as the default if found. Every preference can be changed.

## Use it

- Open a full tab or sidebar from the command palette or ribbon.
- View Today, Upcoming, Projects/sections, unscheduled Inbox, Templates and the last seven days of Completed history.
- Capture, edit, complete/reopen, reschedule, move, label and parent tasks using native controls. Context menus include tomorrow, remove date and attach current note.
- Apply the configured Todoist filter (`#Work & (today | overdue)` initially) when connected; project selection and text search work on the offline cache.
- Run **Sync current checkbox** on a note task, or write `- [ ] Request prices #todoist`. Ordinary checkboxes stay local. Optional folder scopes explicitly opt in their checkboxes.
- Use **Create linked Todoist task from selection**, or the editor/file context menu, to capture task text and attach a note or existing heading/block URI. Link a project note to use its project as a capture default.
- Launch **Website News** in Templates. Enter the article title, date/time and project; optionally create a matching note and include configured steps. A selected master task is read only, never consumed or completed.
- Insert a live daily view into an existing Daily Note with **Insert live daily view in current note**. No generated checkbox copies are inserted.

Embed a live view in any note:

````markdown
```flowstitch
view: today
```
````

Available views: `today`, `upcoming`, `projects`, `inbox`, `templates`, `completed`, `related`. The related view uses locally tracked source-note links.

## Trust and boundaries

Flowstitch uses durable UUIDs, an incremental cache, remote-first three-way reconciliation and guarded Markdown updates. Conflicts are deferred until you compare and choose in Sync diagnostics. Recurring completion advances the Todoist occurrence and resets the live linked checkbox. Historical completion records are separate plain lists.

Multi-device initial creation while devices have independent offline vault copies cannot be guaranteed exactly once. A single explicitly enabled writer is the supported safety model for this beta. Do not enable overlapping sync scopes in another Todoist integration. No OAuth service, analytics, external AI or full-vault uploads are included.

[Setup and commands](docs/SETUP.md) · [Sync and field matrix](docs/SYNC-DESIGN.md) · [Actual test report](docs/TESTING.md) · [Limitations](docs/LIMITATIONS.md) · [Research](docs/RESEARCH.md) · [Architecture](docs/ARCHITECTURE.md) · [Release instructions](docs/RELEASE.md).

## Development

`npm ci`, `npm run check`, `npm run format:check`, `npm audit`, `npm run package`. Runtime code has no Node/Electron dependencies. Test fixtures and DOM simulations never substitute for production API responses. Source modules expose an injected API transport and note/storage ports for meaningful integration tests.

MIT licensed. No source from third-party community plugins is bundled. The official Obsidian API typings and the protocol patterns in reviewed integrations informed the implementation; see RESEARCH.md for revisions and licensing. Obsidian and Todoist are trademarks of their respective owners; Flowstitch is an independent integration.

Flowstitch remains a working name. Its plugin ID was absent from the checked registry, but an unrelated academic security tool already uses FLOWSTITCH; resolve naming before public release.
