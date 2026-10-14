# Everyday setup

Use a backup of your vault for first testing. Install the three built plugin files: main.js, manifest.json and styles.css. Do not copy node_modules into your vault. Enable Flowstitch in Obsidian Community plugins. Minimum supported app version is 1.11.4 because authentication uses public SecretStorage APIs.

Run **Connect Todoist** and paste a personal token from Todoist → Settings → Integrations → Developer. The wizard verifies the account and discovers projects/tasks. Existing routines and Website news [MASTER TEMPLATE] remain unchanged. Credentials are device-local; connecting another device is a separate step. Switching to a different Todoist account is blocked when existing sync data belongs to the first account. Use **Disconnect Todoist** (settings or command palette) to clear the token from Secret Storage on that device and reset the local sync token.

The dashboard initially works read-only. Enable **Writing on this device** in Flowstitch settings to create/edit/complete remote tasks and synchronise opted-in note tasks. Pick one writer for the same vault. Settings and cache can be synchronised with vault tools, but writer activation uses Obsidian's device-local, vault-specific storage.

## Dashboard

Today includes due today and overdue tasks. Upcoming groups the next seven dates. Projects supports project and section filters. Inbox means unscheduled active tasks across projects. Search is local and works offline. Apply Todoist filter uses the official online filter endpoint and the configured query. Completed loads the last seven days from Todoist when selected; Refresh reloads it. History may be account-plan limited; failures produce a notice. Cached active tasks remain visible during outages.

Task rows offer completion, editing, linked note and Todoist links. A row menu offers tomorrow, date removal (nonrecurring only), and attaching the active note. Edit supports title, description, due string, time, priority, project, labels and parent. Reopening ordinary completed tasks uses official uncomplete. Recurring occurrence undo stays in Todoist, because ordinary reopen is not equivalent to undoing a recurring occurrence.

Set an Obsidian hotkey for Quick capture under Settings → Hotkeys; Flowstitch deliberately imposes no default hotkey. Ctrl/Cmd+Enter from the title field captures. Normal input/tab/enter controls and arrow keys in the tab bar are supported.

## Tasks in notes

Write a standalone marker on a checkbox:

```markdown
- [ ] Request updated supplier prices #todoist
```

Or use **Sync current checkbox** with the cursor on that line. Do not use this inside fenced examples. The engine adds an adjacent hidden metadata comment before sending creation, then saves the remote ID into it. Keep that comment with the task when moving it. Copying a linked task/comment to another place is detected as duplicate identity and blocks writing until you remove the copied comment. Do not remove the original key to retry a failed task; use diagnostics.

The title and checkbox sync directly. Due, priority, project, labels and parent are stored in the adjacent JSON comment and can be edited through the dashboard or explicitly in Source mode. Third-party emoji/Dataview suffix metadata is preserved, not interpreted as a second scheduling authority. Do not put Tasks recurrence on Todoist-managed tasks. Markdown list indentation remains local; moving a parent remotely updates metadata without reorganising your note.

Folder scopes are optional and powerful: each checkbox in selected folders becomes explicitly eligible. Leave them blank for individual-marker control. Foreign Todoist ID formats are excluded. With another Todoist integration installed, writing is blocked until you explicitly choose scoped coexistence. Its folder/task scopes must be disjoint; Flowstitch never changes the other plugin.

Use the Heading or block capture field for an existing heading name or ^block-id; Flowstitch does not change the note to invent a block. **Link current note to Todoist project** explicitly writes only the flowstitch-project frontmatter property. Capture uses that project as a default, and a related block shows its tasks. Disable Contextual project defaults to keep capture defaults fixed.

Attaching a note sends an `obsidian://open?vault=...&file=...` link to Todoist, which includes your vault name. The capture dialog previews the exact link before create/edit so you can remove the note link if you do not want the vault name stored remotely.

## Daily Notes and planning

Add a Flowstitch code block to the template used by native Daily Notes, Templater or QuickAdd. This is the safest automatic morning integration: those tools open/create the note, and Flowstitch renders the live view. No internal APIs of those plugins are used.

**Insert live daily view in current note** adds a block below the configured heading without replacing existing text. **Open native Daily Note** uses the documented obsidian://daily URI and your core Daily Notes configuration. **Open daily planning note** is an independent convenience command using Flowstitch's configured folder and filename format; configure it to match Daily Notes. It cannot discover undocumented core-plugin preferences automatically. Existing notes are opened, never replaced.

**Append completed-work snapshot** fetches today's completion history in your timezone, previews the exact addition, and appends plain bullets only after you choose Append. It is not a synchronised checkbox list. Repeated snapshots can overlap; append once per day or remove duplicates manually.

**End-of-day review** lets you select tasks and a target date. Unselected tasks keep their dates. Work and lunch times are display preferences; no hidden scheduler moves your routines. The disabled-by-default holiday assistant requests GOV.UK England/Wales dates only when clicked and suggests a date for explicit selection. It does not modify external Todoist scheduling automations.

## Website News and presets

In Templates, edit Website News: choose default project/priority, description, optional workflow steps, note folder and a plain Markdown template. Tokens are {{title}}, {{notes}}, {{date}}. Template content is literal text; JavaScript and Templater expressions are never executed. You may select your existing [MASTER TEMPLATE] task as a reference to copy its description into the preset. Confirm the copied description before saving. The source task is never modified.

Launch, choose the article title and optional date/time, then optionally enable matching-note creation and steps. Steps become subtasks using Todoist temporary-ID references. Duplicate presets to create variants; archive via Edit. Export settings/presets as JSON from the visible export screen (select and copy its text). Automated importing or executing external template files is not included.

## Troubleshooting

Open Sync diagnostics for connection state, last sync, queue counts, retries and conflicts. Compare displays task field values locally; View sanitised report shows version, status, counts and the last error in a modal for manual copy and excludes titles, descriptions, tokens and paths. Keep Obsidian/Keep Todoist require explicit selection. Closing the dialog defers conflicts. Rejected operations are retained; retry after correcting the issue. A description changed remotely is held for inspection, because replacing it could lose information. Review the unsanitised local operation (local-only, never share externally), copy any text to keep, then explicitly discard that rejected queue entry before editing again. Remote tasks and notes are not deleted.

Network failures retain the queue and cache; automatic retries back off. Sync now forces a request. If token authentication fails, restore/update the selected secret and Sync now. Do not delete data.json while operations are pending. To switch accounts, export preferences, back up data.json and notes, inspect pending operations in the original account, then reset local plugin data deliberately. There is no automatic destructive account-switch action.

Disabling Flowstitch leaves normal readable Markdown tasks and comments. Remote tasks remain in Todoist. Tokens are managed in Obsidian Secret Storage and should be removed there if no longer needed. Plugin data contains cache/snapshots of opted-in content and remote tasks; protect it along with your vault.

## Privacy and local data

`data.json` lives inside your vault plugin folder, so vault sync tools (Obsidian Sync, iCloud, Git) may roam it to other devices. It contains the Todoist `sync_token`, cached tasks/projects, pending operations and note-link mappings — treat it as sensitive alongside your notes. The `sync_token` grants incremental sync access when combined with your API token; do not paste `data.json` contents into issues or shared notes. Use View sanitised report for support. Review screens labelled unsanitised local-only show raw local content and must not be shared.
