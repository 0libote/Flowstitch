# Flowstitch research and feasibility review

Reviewed 2026-10-09. Research completed before feature implementation. Sources were fetched from live official sites and shallow repository clones, not inferred from old tutorials. Repository push time is not evidence of meaningful maintenance: commit subjects/dates below refer to inspected HEADs. No existing integration was run in Obsidian during research.

## Naming

The checked `obsidianmd/obsidian-releases/community-plugins.json` contains no Flowstitch ID/name. This establishes current directory availability only, not a reservation or trademark clearance. A genuine software-name collision exists with the academic [FLOWSTITCH security tool](https://huhong789.github.io/papers/hu:flowstitch.pdf). Keep Flowstitch as a local working name; review before public release. Close alternatives: Noteweave, Taskthread, Flowweave (availability not checked).

## Comparison matrix

All eight inspected manifests declare mobile support. That declaration does not prove actual device compatibility. Source inspection covered API transport, parser, engine, store, lifecycle and tests where present.

| Project                                                                            | Last inspected commit                                                                               | Licence  | Capabilities and architecture                                                                                                        | Limitations and risks                                                                                                               |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| [todoist-board](https://github.com/propranolol11/todoist-board)                    | 38dc29b 2026-09-19 Release 2.3.0                                                                    | MIT      | Dashboard/card UI; date handling and hierarchy modules; filtered REST fetch plus metadata sync; activity polling; cache repositories | No general Markdown reconciliation; inspect polling.ts and token-storage.ts; plaintext fallback is unsuitable here                  |
| [obsidian-sync-todoist](https://github.com/o1xhack/obsidian-sync-todoist)          | 86186e2 2026-06-11 Update 1.1.1 release build                                                       | MIT      | Markdown bidirectional engine; Daily Note backfill; completed queries; many focused parser/date tests; requestUrl v1 pagination      | Whole-task hashes and winner policies; significant daily-note mutation surface; no durable UUID outbox observed in inspected engine |
| [obsidian-todoist-plugin](https://github.com/jamiebrynes7/obsidian-todoist-plugin) | 269463b 2026-03-15 plugin: normalize unicode whitespace in filter strings                           | MIT      | Verified Jamie Brynes official repo; typed schemas; reactive repository; code-block queries; tests; v1 metadata incremental sync     | Task queries use paginated REST separately; React UI; completed/activity issues; not a reusable standalone Markdown engine          |
| [syncist](https://github.com/bastiaanschonhage/syncist)                            | 83b0ebf 2026-09-30 Bump to v2.3.0: shorthand priorities and dates                                   | MIT      | Small native TypeScript parser/engine; v1 requestUrl; nested tasks, import and queries                                               | Whole-task hash conflict policy; inline comment reported to break Tasks editing; no test suite in checked source tree               |
| [obsidian-tasks](https://github.com/obsidian-tasks-group/obsidian-tasks)           | cc2afa8 2026-10-09 contrib: Add callouts highlighting the change in test framework                  | MIT      | Mature task serializers, recurrence, statuses, query system and extensive tests                                                      | Local recurrence is a separate authority; emoji parser consumes suffix metadata from end, so trailing IDs interfere                 |
| [obsidian-dataview](https://github.com/blacksmithgu/obsidian-dataview)             | 5ad0994 2025-04-08 Updated beta-release script with pre-release tags                                | MIT      | Indexed Markdown/import worker, documented query/API surfaces, extensive tests                                                       | Task editing is not a remote sync protocol; inline fields have parsing edge cases                                                   |
| [quickadd](https://github.com/chhoumann/quickadd)                                  | e772433 2026-10-09 test(e2e): fix native e2e failures on macOS instances and two spec leaks (#2217) | MIT      | Documented capture API; command choices; guarded vault writes and substantial tests including native e2e                             | No remote sync; user scripts and template execution add scope unnecessary for this plugin                                           |
| [Templater](https://github.com/SilentVoid13/Templater)                             | c51cf11 2026-10-01 chore: Enable linting in test/ directory, fix linting issues in test/ directory  | AGPL-3.0 | Template engine and creation hooks; e2e tests; mobile manifest                                                                       | AGPL-3.0; hooks inspect undocumented core-plugin internals; file creation/Sync race issues; do not copy or execute templates        |

## Issue review

Open and recently closed issues were fetched using GitHub's issues endpoint sorted by update time (12 per repo, includes PRs). This is a sample, not a complete issue audit.

### todoist-board

- [21: Feature Request: Support recurring dates](https://github.com/propranolol11/todoist-board/issues/21) — closed.
- [20: Set up Cloud Agent dev environment (fix npm test on older Node)](https://github.com/propranolol11/todoist-board/pull/20) — closed.
- [22: Bug: Icon colour doesn't stick](https://github.com/propranolol11/todoist-board/issues/22) — closed.
- [19: Setting to turn off the badges](https://github.com/propranolol11/todoist-board/issues/19) — closed.
- [18: Feature request: Use filtered project as default when adding tasks](https://github.com/propranolol11/todoist-board/issues/18) — closed.
- [17: [codex] Update release workflow actions](https://github.com/propranolol11/todoist-board/pull/17) — closed.

### obsidian-sync-todoist

- [1: [codex] Add past Daily Note backfill](https://github.com/o1xhack/obsidian-sync-todoist/pull/1) — closed.

### obsidian-todoist-plugin

- [233: Include completed tasks ](https://github.com/jamiebrynes7/obsidian-todoist-plugin/issues/233) — open.
- [495: Feature request: include recurring task completions (Activity endpoint)](https://github.com/jamiebrynes7/obsidian-todoist-plugin/issues/495) — closed.
- [494: Added pt-BR translation](https://github.com/jamiebrynes7/obsidian-todoist-plugin/pull/494) — open.
- [492: Query option to limit number of rendered tasks](https://github.com/jamiebrynes7/obsidian-todoist-plugin/issues/492) — open.
- [493: Add task with current page in task content - reopen](https://github.com/jamiebrynes7/obsidian-todoist-plugin/issues/493) — open.
- [490: plugin: fix Todoist API sync endpoint and query URL encoding](https://github.com/jamiebrynes7/obsidian-todoist-plugin/pull/490) — closed.

### syncist

- [6: Adding task to specific Sections in Todoist](https://github.com/bastiaanschonhage/syncist/issues/6) — open.
- [5: feat: support Dataview inline metadata syntax and clean bracket fields from task titles](https://github.com/bastiaanschonhage/syncist/pull/5) — open.
- [4: feat: add task ID format setting (HTML comment vs Obsidian block ID) and test suite](https://github.com/bastiaanschonhage/syncist/pull/4) — open.
- [3: Inline <!-- todoist-id:... --> comment breaks Obsidian Tasks plugin parsing/editing](https://github.com/bastiaanschonhage/syncist/issues/3) — open.
- [2: [feature] Include completed tasks in query blocks](https://github.com/bastiaanschonhage/syncist/pull/2) — closed.
- [1: Currently the plugin is not available in Obsidian community plugins](https://github.com/bastiaanschonhage/syncist/issues/1) — open.

### obsidian-tasks

- [4073: Task queries "Copy results" button overlaps with "Edit this block"](https://github.com/obsidian-tasks-group/obsidian-tasks/issues/4073) — open.
- [4074: fix: prevent query toolbar overlapping Obsidian edit control](https://github.com/obsidian-tasks-group/obsidian-tasks/pull/4074) — open.
- [4072: Ability to hide the before-id part in the global query](https://github.com/obsidian-tasks-group/obsidian-tasks/issues/4072) — closed.
- [3879: "Change status to X" commands should work on multiple selected tasks](https://github.com/obsidian-tasks-group/obsidian-tasks/issues/3879) — open.
- [4049: cursor positioning issues below task queries containing "hide toolbar" and/or "hide task count"](https://github.com/obsidian-tasks-group/obsidian-tasks/issues/4049) — closed.
- [4071: docs: Update settings screenshots (and refine wording)](https://github.com/obsidian-tasks-group/obsidian-tasks/pull/4071) — closed.

### obsidian-dataview

- [2672: Links/hashtags within a block/parenthesis inline field swallow preceding text and are not rendered in Live Preview](https://github.com/blacksmithgu/obsidian-dataview/issues/2672) — open.
- [2679: Refresh views when the date rolls over](https://github.com/blacksmithgu/obsidian-dataview/pull/2679) — open.
- [2209: `obsidian-dataview` npm package types don't pull into Typescript project](https://github.com/blacksmithgu/obsidian-dataview/issues/2209) — open.
- [2678: Issue using WHERE](https://github.com/blacksmithgu/obsidian-dataview/issues/2678) — open.
- [2677: Bug report](https://github.com/blacksmithgu/obsidian-dataview/issues/2677) — open.
- [2676: Preserve scroll position when Dataview re-renders](https://github.com/blacksmithgu/obsidian-dataview/pull/2676) — open.

### quickadd

- [2214: release(version): Release 2.32.1](https://github.com/chhoumann/quickadd/pull/2214) — open.
- [2217: test(e2e): fix native e2e failures on macOS instances and two spec leaks](https://github.com/chhoumann/quickadd/pull/2217) — closed.
- [2218: e2e: choice-builder-pages-phone fails since #2215 (row never holds still after reload)](https://github.com/chhoumann/quickadd/issues/2218) — open.
- [2208: [BUG] User Scripts are Running & Throwing Error](https://github.com/chhoumann/quickadd/issues/2208) — closed.
- [2209: fix(macro): let a user script that exports nothing finish its macro](https://github.com/chhoumann/quickadd/pull/2209) — closed.
- [2207: e2e: settings-UI specs fail in a full run under load](https://github.com/chhoumann/quickadd/issues/2207) — closed.

### Templater

- [1784: feat: Add setting to only trigger for files matching a template rule](https://github.com/SilentVoid13/Templater/pull/1784) — open.
- [1785: Obsidian Sync and Templater make file conflicts](https://github.com/SilentVoid13/Templater/issues/1785) — open.
- [1371: Expand metadata in space - Geolocation coords support request](https://github.com/SilentVoid13/Templater/issues/1371) — open.
- [1783: Option to limit "Trigger Templater on new file creation" to trusted templates](https://github.com/SilentVoid13/Templater/issues/1783) — open.
- [953: [feat] "Better" warning messages?](https://github.com/SilentVoid13/Templater/issues/953) — open.
- [1775: Detect templates by #template tag](https://github.com/SilentVoid13/Templater/issues/1775) — open.

## Official sources and confirmed API facts

- [Obsidian docs](https://docs.obsidian.md/), [API source](https://github.com/obsidianmd/obsidian-api), [sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin). Current inspected API package is 1.14.4. SecretStorage and SecretComponent setters are public since 1.11.4; use that minimum and retain only the secret name in plugin configuration.
- [Secret storage](https://docs.obsidian.md/plugins/guides/secret-storage). Local, vault-specific storage; not claimed to be a plugin isolation boundary or guaranteed hardware encryption. Any device needs its own secret setup.
- [Mobile development](https://docs.obsidian.md/Plugins/Getting%20started/Mobile%20development): no shared Node/Electron APIs. requestUrl, Web Crypto, vault/editor and native DOM only at runtime.
- [Guidelines source](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Releasing/Plugin%20guidelines.md): public web route failed/returned not found; source repository was successfully cloned and read. Editor updates for active notes; Vault.process for background mutations; registered disposal; theme variables; no innerHTML.
- [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), [policies](https://docs.obsidian.md/community-directory/developer-policies): manifest, licence, minAppVersion, short description, original-licence compliance.
- [Todoist unified API v1](https://developer.todoist.com/api/v1/). Browser fetch exceeded content-size limit; full HTML was downloaded with Python and parsed locally. POST /sync accepts form data; sync_token=\* initially then incremental token; legacy resource name `items` remains in sync. Commands use persistent UUIDs for server idempotency and temp_id_mapping for new task identity. Maximum 100 commands/request, 1 MiB POST body; 1000 partial/100 full syncs per 15 minutes documented. Respect 429 and Retry-After rather than relying only on a quota estimate.
- item_update cannot move/complete a task. item_move accepts exactly one destination; item_close completes normal tasks and advances recurring tasks; item_uncomplete reopens ordinary tasks. Do not fake recurring completion using due updates. Recurrence due object must be retained when changing a recurring date. Reminders have independent commands; Flowstitch must not send those commands.
- Completed history endpoint `/tasks/completed/by_completion_date` is cursor-paginated and requires since/until. History/feature access can depend on account plan; surface errors rather than silently substituting active tasks.
- Date objects distinguish date-only, floating date-time and fixed timezones. Do not convert a floating date into UTC. Use Todoist natural-language parsing through due.string; explicit local date-time uses configured Europe/London timezone.
- [SDK source](https://github.com/Doist/todoist-sdk-typescript) (old todoist-api-typescript URL redirects): current 15.3.1 requires Node >=24 and has undici/KMP dependencies. A small requestUrl transport is more appropriate for Obsidian mobile; API protocol is directly verified, not copied from obsolete v2/v9 examples.
- OAuth docs now include public-client PKCE and client metadata support. No bundled client secret is acceptable. Personal token via SecretStorage is implemented initially; OAuth requires registered redirects and a separately validated desktop/mobile return path.
- [Government bank holiday API](https://www.api.gov.uk/gds/bank-holidays/) supplies England/Wales, Scotland, Northern Ireland. Native Todoist weekday recurrence does not establish holiday exclusion. Optional assistant must use government dates and never run unapproved automatic rescheduling.

## Capability and licence map

Adopt ideas: native rows/cache/date normalization from Board; opt-in IDs and guarded Markdown edits from Sync Todoist/Syncist; typed transport and incremental metadata pattern from Jamie Brynes; suffix metadata preservation informed by Tasks; command and fenced-block interoperability with QuickAdd/Templater/Dataview. No third-party community-plugin source is incorporated. Their MIT licences permit reuse with notices if future code is copied. Templater is AGPL and will not be copied into the MIT plugin. Official API typings are MIT development dependencies; build tooling is not bundled. Attribution and pinned research revisions are retained here. No undocumented plugin internals are required.

## Architecture decision (A/B/C)

A: A fork would inherit UI stacks, parser assumptions, token fallbacks and whole-task conflict semantics that need substantial changes. Sync Todoist is closest functionally but would not eliminate the difficult reliability work.

B: Combining selected engines/components would multiply incompatible task models and lifecycle assumptions. Licence-compatible ideas are useful; cross-codebase engine composition is rejected.

C (chosen): One native plugin with a thin typed official-v1 client, incremental cache, durable UUID outbox, field snapshots, conservative conflicts and minimal DOM UI. Reuse established protocol/patterns, official typings and build tooling; do not reinvent Todoist recurrence/reminders, Markdown rendering or vault concurrency. This has the smallest security/dependency surface and no required community plugins.

## Verified limitations, assumptions and safety scope

Confirmed: no distributed compare-and-swap on vault files across devices; Vault.process atomicity is per running app; offline initial creation on two independent unsynced devices cannot guarantee exactly once. Use one explicitly enabled writer device by default, other devices dashboard-only; stable prewritten creation UUIDs deduplicate retries and already-shared markers. Cross-device edits are reconciled using remote-first snapshots but network races cannot be eliminated without a coordinating service. Never promise such a service implicitly.

Confirmed: removing a remote task and completing one are distinct; do not infer completion from absence in an active REST listing. Sync tombstones/status must be used. Missing/deleted remote tasks must preserve local text. A live Daily Note block is a view, never a second checkbox set. Remote text is rendered as text, not executable HTML.

Assumptions requiring manual verification: Web Crypto and SecretStorage on supported iOS/Android builds; actual theme/screen-reader/editor interaction; API account-specific history access; Todoist command responses on a dedicated live account. No credentials or Obsidian GUI have been supplied. Production integration uses actual Todoist network responses only; mocks belong exclusively to tests.

Compatibility strategy: foreign Todoist markers are excluded. Detect installed conflicting plugins via the public community-plugin registry file in Vault.configDir; default to read-only on detection until scoped mode is selected. Do not disable other plugins. Tasks/Dataview remain Markdown consumers; local recurrence ownership must never overlap with Todoist. Flowstitch metadata lives on a separate comment line so it does not occupy Tasks' suffix. No claim of full Tasks editor round-trip until manually tested.

Follow-up verification: [Official Obsidian URI documentation](https://obsidian.md/help/uri) explicitly supports encoded heading/block suffixes in file parameters and obsidian://daily to open the native Daily Note. Use these public URI routes rather than reading core-plugin internals.
