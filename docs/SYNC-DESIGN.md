# Sync protocol and field capability matrix

The only remote API base is https://api.todoist.com/api/v1. Authentication is a personal token retrieved at request time from SecretStorage. /user verifies the account before a sync token or outbox is used, preventing accidental writes into a different account. No reminders or delete commands are exposed.

| Field              | Note → Todoist                     | Todoist → note              | Boundary                                                                                                         |
| ------------------ | ---------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Task title         | Yes                                | Yes                         | One-line checkbox title; protected suffix metadata retained                                                      |
| Completion         | Yes, item_close / item_uncomplete  | Yes, explicit checked state | Recurring close advances occurrence and resets live checkbox; missing/deleted task is not completion             |
| Due date/time      | Yes, adjacent comment or dashboard | Yes, comment                | Natural language through due.string; floating stays floating; fixed time reschedules retain local hour           |
| Priority           | Yes                                | Yes                         | Comment/API values 1–4; UI P1 maps to API 4                                                                      |
| Project            | Yes, item_move                     | Yes                         | Comment stable project ID; no project creation                                                                   |
| Labels             | Yes                                | Yes                         | Comment names; vault hashtags remain title/context, not automatically remote labels                              |
| Parent/subtask     | Yes, item_move                     | Yes                         | Comment ID; note indentation is not automatically rewritten                                                      |
| Description        | Dashboard only                     | Dashboard cache only        | No upload or replacement of complete note content; stale description writes held                                 |
| Section            | Browse/display                     | Dashboard cache             | Section selection filter; editing/moving by section not implemented                                              |
| Recurrence rule    | Todoist-authoritative              | Preserved in due comment    | No separate local recurrence engine; recurrence can be requested on new capture through Todoist natural language |
| Reminders          | Never modified                     | Remain managed by Todoist   | New plugin captures disable automatic reminder creation; existing reminder resources untouched                   |
| Completion history | Not inferred                       | Explicit history API        | Separate historical records; account/API access limits surfaced                                                  |

## Identity and metadata

Example normal Markdown, after the first successful sync:

```markdown
- [ ] Request prices #todoist
<!-- flowstitch:{"key":"d55118aa-feb7-4d92-bc01-f9da0e7e9036","id":"REMOTE_ID","due":null,"priority":1,"project_id":"PROJECT_ID","labels":[],"parent_id":null} -->
```

The local UUID is written before network creation. It is also the item_add UUID and temporary ID, so retries share a server idempotency key. temp_id_mapping is retained locally until the note can be linked, including restart after an acknowledgement. Remote IDs are authoritative and independent of line number, heading or filename. ID-free ordinary tasks are never recreated due to note renames. Metadata is adjacent rather than a title suffix because Tasks suffix parsing and reported integration comment issues make inline IDs risky. Preserve the UUID comment with its checkbox when moving a task.

## Cycle

1. Fetch initial full sync with \* or incremental delta using persisted sync_token.
2. Save cache/token. Inspect indexed candidate notes; prepare opt-in identities with guarded edits.
3. Compare each linked task with its last field snapshot and current remote values. Different-field changes merge. Conflicting edits to the same field remain unchanged until resolution. A remote title replacement that would remove local wikilinks, Markdown links, tags or inline code also requires explicit comparison, even if it is the only edit. Unknown baselines fail closed into a conflict.
4. Save queued commands before submission. Send at most 100 commands and below the request payload cap. Retry UUIDs and command arguments remain stable.
5. Check each individual sync_status; retain missing acknowledgements and rejected commands. Save new IDs and cache before note patching.
6. Patch acknowledged notes only if their field snapshot still matches the value captured before submission. Apply remote-only changes using raw-line/comment guards. Update snapshots only after successful patching.

A delayed response cannot replace a newly edited line. Vault.process serialises a background-file transform within the app; active notes use a minimal Editor replacement. Fenced examples, frontmatter and foreign Todoist markers are excluded. Unchanged notes are not written. Remote deletions/missing tasks preserve local text and block queued mutations for inspection. No remote deletion follows removal of a local checkbox or note.

Indexed paths are discovered once after layout ready; subsequent create/modify/editor events update candidates. Each sync reads candidate notes, not every vault note, and writes only changed task lines/comments. This beta retains cache/baseline/history-ID state without aggressive pruning to protect task identity; very large long-lived caches need further profiling.

## Offline, retries, conflicts and devices

Captured tasks and dashboard edits are durably queued before requests. Offline Markdown edits persist in their normal notes and are detected after remote connectivity returns. A remote-first read precedes submission, including operations without a linked note. 429 Retry-After and exponential backoff up to five minutes are honoured; manual Sync now forces a request. Authentication failures preserve pending data and show the credential state. Server rejection does not discard task text.

Conflicts support comparison, keep local, keep remote, and defer. Description conflicts are held as rejected operations and require manual comparison/re-entry; they are not included in the seven-field note merge. There is no distributed lock or atomic compare-and-swap across two Obsidian instances. One writer device is the supported beta model. Shared existing UUIDs protect retries; simultaneous independent offline initial opt-in on two devices can produce two different UUIDs. Device-local writer activation is never enabled automatically by synchronising plugin preferences.

## Recurrence and time

Use item_close, never recurrence emulation by copying tasks or merely replacing a due date. After acceptance, Todoist's returned recurring due rule/date is pulled back and the linked live checkbox is reset. Occurrence history comes from the completed endpoint; a recurring master's active ID is not treated as a completed archive task. Occurrence undo is intentionally delegated to Todoist.

Date-only and floating values retain their representation. Fixed-time rescheduling converts the prior instant to the task timezone's wall clock and resolves the new date using IANA timezone rules. Nonexistent/ambiguous explicit wall times at DST transitions are rejected for user choice. Natural-language capture uses Todoist's parser and account/date interpretation; it is not locally guessed. Tests cover London spring/autumn transitions, fixed and floating values.
