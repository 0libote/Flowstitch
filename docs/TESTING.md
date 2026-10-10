# Actual test report

Local automated verification on 2026-10-10, Linux x64, Node 24.21.0, TypeScript 5.9.3, Vitest 5.0.3, esbuild 0.28.2, ESLint 10.12.0, jsdom 30.1.2. No Obsidian executable or dedicated Todoist test credentials were available. No tasks were created, completed or deleted in a real Todoist account. No actual Mac/iPhone/iPad/Android device testing is claimed.

## Results

- Strict type checking: passed.
- ESLint: passed, including type-aware unsafe argument, assignment and member access checks in production source.
- Unit and mocked integration/DOM/lifecycle tests: **55 passed, 0 failed**, seven files.
- Production build: passed, browser-target CommonJS bundle; only Obsidian is external.
- Dependency security audit: **0 vulnerabilities**. The initially selected Vitest 3 dependencies had advisories; replaced with Vitest 5 and compatible current esbuild. See dependency-audit.json.
- Automated guideline smoke checks: passed (manifest/version consistency, description, licence, no unsafe HTML/eval/logging/desktop imports/obsolete API URLs, required build assets). This is not an official community-plugin review.
- Desktop light (728 px) and phone dark (360 px) HTML previews: manually inspected for visual layout using production Dashboard DOM with fixture tasks and theme-variable harness. No console exceptions or horizontal page overflow. These are browser simulations, not Obsidian app screenshots.
- Machine-readable test results are in test-results.json. Each named assertion identifies its scope. Build/package files and checksums are in dist.

## Settings review follow-up

Searchable declarative definitions and the pre-1.13 settings fallback share the same controls. Added automated coverage for side-effect-free definition discovery, matching legacy rows, writer control refresh on both host paths, marker validation/index refresh, project selection, untrusted frontmatter values and filename bracket sanitisation. Guideline smoke checks now reject `document.createElement` in production source. No such calls were present in the source reviewed for this follow-up.

The legacy `display()` override is retained for the supported Obsidian 1.11.4–1.12 versions; controls no longer call it. On 1.13 and later, Obsidian uses `getSettingDefinitions()` and controls refresh through `update()`. This follows the official [declarative settings migration guide](https://docs.obsidian.md/plugins/guides/migrate-declarative-settings). Actual settings-search behaviour still needs verification in the Obsidian application.

## Acceptance coverage

| #   | Required behaviour               | Automated evidence                                                                                                                                       | Still required manually                                                           |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Checkbox creates exactly once    | UUID identity persisted, repeated incremental cycles/reload, duplicate-marker rejection                                                                  | Live Todoist idempotency/temp-ID acknowledgement                                  |
| 2   | Remote edits update Markdown     | Remote title pull, surrounding text retained; potentially lost wikilinks/tags cause a comparison conflict; dashboard acknowledgement updates linked note | Source/Reading/Live Preview in host                                               |
| 3   | Local completion                 | Engine mocked item_close and uncomplete state assertions                                                                                                 | Live nonrecurring task                                                            |
| 4   | Remote completion                | Explicit checked-state pull                                                                                                                              | Actual archive/sync delta shape                                                   |
| 5   | Recurrence rule retained         | due.string/timezone preserved through close/reschedule                                                                                                   | Live recurring rule and account timezone                                          |
| 6   | Occurrence does not close master | Mock advances occurrence, resets checkbox, only one close                                                                                                | Live recurring completion/history                                                 |
| 7   | Offline recovery                 | Durable capture outbox and reconnect with stable UUID; offline note remains Markdown                                                                     | Mobile suspension/restart and actual outage                                       |
| 8   | Two-device conflict              | Concurrent same-field/different-field remote-first merge; queued dashboard conflict without notes                                                        | Two real vault copies/Obsidian Sync races                                         |
| 9   | Rename keeps identity            | Moved path retains same task ID and does not create                                                                                                      | Real rename event remote URI repair, folder rename, anchors                       |
| 10  | Website News copy                | Actual capture modal queues root and optional subtasks; master object unchanged                                                                          | Live temp-ID parent references and matching note                                  |
| 11  | Daily Notes non-destructive      | Idempotent insertion preserves user content; no task clones                                                                                              | Native Daily Notes URI, templates and app opening                                 |
| 12  | Opt-in only                      | Ordinary/foreign/fenced/frontmatter tasks unchanged                                                                                                      | Other integrations with disjoint scopes                                           |
| 13  | Dashboard offline                | Production Dashboard renders cache in jsdom; complete control uses engine                                                                                | Theme/Obsidian host offline states                                                |
| 14  | Valid dates and DST              | Date validation; London spring gap/fall fold rejection; floating and fixed-hour rescheduling                                                             | Todoist NL interpretation and unusual timezones                                   |
| 15  | Reminders preserved              | Engine sends no reminder commands; creation opts out of auto-reminders                                                                                   | Compare actual reminder IDs before/after live edits                               |
| 16  | Unload/reload safe               | Registration/disposal simulation; engine stops writes; queue UUID remains stable                                                                         | Real host update and in-flight request completion                                 |
| 17  | Large-vault performance          | 1000 ordinary notes produce zero writes; unchanged linked note produces no repeat rewrite                                                                | Time/memory profile on representative vault/device                                |
| 18  | Tasks/Dataview boundary          | CRLF, indentation, wikilinks/tags/comments/emoji and inline-field suffix fixtures                                                                        | Actual plugin editor round-trip/index refresh                                     |
| 19  | Desktop/mobile                   | Browser-target bundle has no Node imports; 728/360 px render checks                                                                                      | Actual desktop/macOS, iPhone/iPad, Android                                        |
| 20  | Commands/settings/controls       | Fourteen commands have callable entrypoints; dashboard search/project/history/completion, capture/presets and lifecycle tested                           | Every real-host setting/context menu/clipboard/hotkey, keyboard and screen reader |

## Manual release gates

Use a dedicated empty Todoist test project and disposable backup vault. Never point destructive experiments at existing user routines or business data. Keep the plugin read-only until the connection and fixture tasks are verified.

1. Connect via SecretStorage on desktop and iOS/Android; inspect data.json and sanitised report to confirm no credential leakage. Switch tokens to the same account and test invalid/different account refusal.
2. Create one opted-in task, inspect its marker and Todoist ID, repeat Sync now/reload, then edit both directions. Inspect raw note bytes and unrelated paragraphs.
3. Complete/reopen an ordinary task. Complete recurring tasks near DST and verify the same active master, unchanged recurrence/reminder IDs, next date and correct completed occurrence record. Use Todoist to undo an occurrence.
4. Interrupt requests after server acceptance, restart, restore connectivity and confirm exactly one created task/occurrence. Inspect rejected-command recovery and explicit discard preview.
5. Edit on two desktop instances, enable only one writer, reconcile conflict compare/local/remote/defer. Repeat with Obsidian Sync updating Markdown/plugin preferences. Deliberately copy a linked marker and verify blocking.
6. Rename/move notes and folders with and without pending tasks, open note/heading/block links from both apps. Verify the documented disabled-plugin rename limitation.
7. Launch Website News with note and steps twice; master remains unchanged. Check note destination collisions and offline captures.
8. Test Daily Notes, Templater and QuickAdd with the fenced live block. Confirm unrelated Daily Note text survives. Preview/append completed snapshot and verify timezone/day boundaries.
9. Exercise all view tabs, project/section/search/filter controls, completion/editing/date/priority/labels/parent/move, sidebar/full tab/embeds, context menus, diagnostics/retry/rejected review/export, presets/archive and end-of-day/holiday suggestions.
10. Check light/dark themes, 360 px phone layout, external keyboard/tab navigation, screen reader names, Live Preview/Reading/Source mode and large-vault profiles. Record actual device/Obsidian/Todoist versions and measured timing.

## Visual harness

[Desktop light preview](screenshots/desktop-light.png) and [phone dark preview](screenshots/mobile-dark.png) are explicitly labelled fixture renders. The regenerable ui-preview.html contains actual native Dashboard markup from a test; it is a static visual artifact, not a second implementation or an interactive production demo.
