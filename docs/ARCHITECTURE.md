# Architecture

Decision: independent native Obsidian plugin against official unified API v1, informed by the source review in RESEARCH.md. No runtime dependencies or community-plugin requirements.

`api/client.ts` owns authenticated requestUrl-compatible transport, response validation, incremental sync, and paginated history/filter reads. `sync/engine.ts` owns cache, snapshots, outbox, retry/conflict policy and subscriptions; a storage/notes port makes it independently testable. `notes/markdown.ts` owns conservative opt-in parsing and guarded minimal patches. `main.ts` supplies supported Obsidian lifecycle, vault/editor, settings, command, URI and storage adapters. `ui/` supplies native components, dashboard and modals.

Schema 1 stores configuration, cached tasks/projects/sections, field snapshots, conflicts and queued commands. Tokens live solely in SecretStorage. Unknown schema versions fail closed. Back up plugin data before a future migration. Current schema has no prior released version to migrate.

One writer device is selected explicitly using vault-scoped local storage. Read-only devices show cached/live views without remote mutations or Markdown writes. Notes retain readable checkboxes plus documented adjacent comments. No file deletion or whole-note rendering from remote data.

Storage writes are serialized. Outbox is saved before sending; acknowledgements and cache are saved before patching Markdown. Server UUID idempotency makes retries safe after ambiguous transport failure. Remote sync precedes local reconciliation. Conflict comparison records values privately in plugin data, not console logs. Lifecycle stop checks prevent further mutations when unloaded, though requestUrl has no documented cancellation signal.
