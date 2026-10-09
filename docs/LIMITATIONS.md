# Limitations and compatibility

This is a functioning buildable 0.1.0 beta, not yet a verified community release. A real Todoist account and Obsidian desktop/iOS/Android testing are outstanding. The DOM harness is a simulation of native APIs; it cannot prove all real host behaviour.

## Supported scope

Working implementation: typed v1 incremental sync, persistent outbox/cache, opt-in checkbox title/state and metadata properties, field conflicts, recurring close, native dashboard, capture/linking, presets and optional subtasks/notes, live Markdown embeds, non-destructive Daily Note insertion, history preview/snapshot, settings and diagnostics. Production code makes direct Todoist requests through Obsidian requestUrl and contains no fake API data.

Known restrictions:

- One writer device per vault is the supported beta safety model; no distributed exactly-once guarantee across independent offline vault copies. Do not synchronise divergent device-local outboxes blindly. Plugin data is normally managed by Obsidian and may be overwritten by vault-sync settings; treat it as recovery state, not a shared distributed database.
- Todoist OAuth is researched, not implemented. Personal tokens use SecretStorage; there is no plaintext credential fallback for older Obsidian.
- Native Daily Notes preference discovery is not a documented public API in the inspected typings. Use a block in your existing template or match Flowstitch folder/format preferences. Flowstitch does not invoke Templater or QuickAdd internals.
- Projects/sections are browsed, not created/deleted/renamed. Section mutation, reminder editing, deadlines, duration, assignment and comments are not part of this release.
- Automatic new block-ID insertion is not implemented: link to an existing heading or ^block-id in capture. Project-note association uses an explicitly chosen flowstitch-project frontmatter property; contextual defaults can be disabled. Source-note URIs and related views work. Existing note links are tracked locally and repaired on observed rename events; renames while this plugin is disabled are not automatically detectable.
- Markdown due/priority/project/labels/parent use documented adjacent JSON metadata. Tasks emojis/Dataview inline fields remain unchanged and are not a second source for those properties. Nested indentation is preserved but does not imply automatic remote parent creation. Titles with line breaks are refused rather than splitting notes.
- No migration assistant for foreign integrations is included. Read-only and manually scoped coexistence are available. Existing foreign IDs are excluded; migrate by explicitly linking/capturing after backing up and removing overlapping ownership, never by copying machine IDs blindly.
- Completed view loads the last seven days on demand and requires network/API access. It is not persisted as an offline history database. Snapshots fetch today's history and append after a preview; repeated snapshots can contain duplicates. Account-plan restrictions are surfaced as errors.
- Presets export as JSON, but there is no import wizard or external executable template support. Master descriptions copy when selected into the preset; future master edits do not automatically overwrite your preset.
- Work/lunch hours are configurable display preferences. Monday–Friday is the holiday assistant's working-week rule. Optional England/Wales government lookup is on demand, suggestions only; no calendar subscription or automatic first-working-day automation is installed.
- Retry ordering is FIFO; command rejections are retained and need intervention. Stale description writes are held, not silently merged. requestUrl has no documented cancellation signal: in-flight requests can finish after unload, but subsequent local mutations/listeners are stopped.
- Full conflict resolution, mobile keyboard/layout behaviour, Obsidian Sync interactions and platform URI handling require the real-host manual matrix. External tools can change note content or plugin data independently. No integration can promise to eliminate those races using Vault.process alone.

## Plugin coexistence

| Plugin                | Supported boundary                                                                                 | Testing status                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Tasks                 | Checkboxes and preserved emoji suffixes; no shared local recurrence authority                      | Parser fixtures only; real editing round-trip outstanding              |
| Dataview              | Ordinary checkboxes/inline-field suffixes preserved                                                | Fixtures only; real index refresh outstanding                          |
| QuickAdd              | Can insert opt-in tasks and invoke Flowstitch commands                                             | No internal API dependency; real app outstanding                       |
| Templater             | Can insert the live block into a Daily Note template                                               | No template execution/copying from AGPL code; real app outstanding     |
| Daily Notes           | Existing-note block insertion and template interoperability                                        | Non-destructive fixtures; native app outstanding                       |
| Obsidian Sync         | Stable Markdown UUIDs; device-local writer activation                                              | Concurrent-field engine simulation only; real multi-device outstanding |
| Other Todoist plugins | Detect enabled known IDs, default read-only, explicit scoped coexistence, foreign marker exclusion | Marker fixtures/registry implementation; real app outstanding          |

Credentials, note text and remote descriptions are not logged. Task text is rendered through textContent/native createEl APIs; HTML cannot run in dashboard titles. Matching-note templates are user-configured literal Markdown and are never evaluated as code. Todoist is the only default network service; GOV.UK is contacted only by the enabled, manually invoked holiday assistant.
