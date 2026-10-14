import { TodoistClient, ApiError, type SyncResponse } from "../api/client";
import {
  type State,
  type Fields,
  type Command,
  type Operation,
  type Task,
  fields,
  uuid,
  equal,
  fieldKeys,
} from "../types";
import {
  scan,
  prepare,
  patch,
  losesContext,
  type LinkedLine,
} from "../notes/markdown";
import { reconcile } from "./reconcile";
export interface NotePort {
  paths(): Promise<string[]>;
  read(path: string): Promise<string>;
  process(path: string, fn: (text: string) => string): Promise<void>;
  optIn(path: string): boolean;
}
export interface EnginePort {
  save(): Promise<void>;
  notes: NotePort;
  writer(): boolean;
  now(): number;
}
export class SyncEngine {
  status = "Disconnected";
  error = "";
  private running?: Promise<void>;
  private pendingForce = false;
  private stopped = false;
  private listeners = new Set<() => void>();
  private retryAt = 0;
  private failures = 0;
  constructor(
    public state: State,
    private api: TodoistClient,
    private port: EnginePort,
  ) {}
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(): void {
    for (const l of this.listeners) l();
  }
  stop(): void {
    this.stopped = true;
    this.listeners.clear();
  }
  private writable(): void {
    if (this.stopped || !this.port.writer())
      throw new Error("Enable writing on this device first");
  }
  async enqueue(
    command: Command,
    extra: Partial<Operation> = {},
  ): Promise<void> {
    this.writable();
    if (this.state.queue.some((o) => o.command.uuid === command.uuid)) return;
    this.state.queue.push({ command, attempts: 0, nextAt: 0, ...extra });
    await this.port.save();
    this.emit();
  }
  async create(
    args: Record<string, unknown>,
    source?: string,
    key = uuid(),
    sourceAnchor?: string,
  ): Promise<string> {
    await this.enqueue(
      { type: "item_add", uuid: key, temp_id: key, args },
      { source, sourceAnchor },
    );
    return key;
  }
  async edit(
    task: Task,
    desired: Fields,
    description?: string,
    noteBaseline?: Fields,
  ): Promise<void> {
    this.writable();
    if (this.state.queue.some((o) => o.target === task.id && !o.error))
      throw new Error("This task already has a pending operation");
    const commands = this.commands(task, desired, description);
    for (const command of commands)
      await this.enqueue(command, {
        target: task.id,
        base: fields(task),
        desired,
        noteBaseline,
        ...(description !== undefined
          ? { expectedDescription: task.description }
          : {}),
      });
  }
  private commands(
    task: Task,
    desired: Fields,
    description?: string,
  ): Command[] {
    const out: Command[] = [];
    const base = fields(task);
    const args: Record<string, unknown> = { id: task.id };
    for (const key of ["content", "priority", "labels", "due"] as const) {
      if (!equal(base[key], desired[key]))
        args[key] =
          key === "due" && desired.due?.date === ""
            ? { string: desired.due.string, timezone: desired.due.timezone }
            : desired[key];
    }
    if (description !== undefined && description !== task.description)
      args.description = description;
    if (Object.keys(args).length > 1)
      out.push({ type: "item_update", uuid: uuid(), args });
    if (desired.project_id !== task.project_id)
      out.push({
        type: "item_move",
        uuid: uuid(),
        args: { id: task.id, project_id: desired.project_id },
      });
    if (desired.parent_id !== task.parent_id) {
      if (desired.parent_id)
        out.push({
          type: "item_move",
          uuid: uuid(),
          args: { id: task.id, parent_id: desired.parent_id },
        });
      else
        out.push({
          type: "item_move",
          uuid: uuid(),
          args: { id: task.id, project_id: desired.project_id },
        });
    }
    if (desired.checked !== task.checked) {
      if (task.due?.is_recurring && task.checked)
        throw new Error("Recurring occurrence undo is available in Todoist");
      out.push({
        type: desired.checked ? "item_close" : "item_uncomplete",
        uuid: uuid(),
        args: { id: task.id },
      });
    }
    return out;
  }
  sync(force = false): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) {
      if (force) this.pendingForce = true;
      return this.running;
    }
    if (!force && this.retryAt > this.port.now()) return Promise.resolve();
    this.running = this.drain().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async drain(): Promise<void> {
    do {
      this.pendingForce = false;
      await this.run();
      if (this.stopped) break;
      if (this.pendingForce) continue;
      break;
    } while (true);
  }
  private apply(response: SyncResponse): void {
    if (response.full_sync) {
      const previous = this.state.tasks;
      const incomingIds = new Set(response.items.map((t) => t.id));
      this.state.tasks = {};
      for (const t of Object.values(previous))
        if (t.checked || t.is_deleted) this.state.tasks[t.id] = t;
      this.state.projects = {};
      this.state.sections = {};
      for (const task of response.items) {
        if (task.is_deleted) {
          const prior = previous[task.id];
          this.state.tasks[task.id] = prior
            ? { ...prior, is_deleted: true }
            : task;
        } else this.state.tasks[task.id] = task;
      }
      for (const id of Object.keys(previous)) {
        if (!this.state.tasks[id] && !incomingIds.has(id)) {
          const prev = previous[id]!;
          const hasLocal =
            !!this.state.links[id] ||
            !!this.state.bases[id] ||
            !!this.state.conflicts[id] ||
            this.state.queue.some((o) => o.target === id);
          if (hasLocal) {
            this.state.tasks[id] = { ...prev, is_deleted: true };
            for (const op of this.state.queue)
              if (op.target === id && !op.error)
                op.error =
                  "Remote task missing or deleted; retained for inspection";
            if (!this.state.conflicts[id] && this.state.bases[id]) {
              const base = this.state.bases[id]!;
              this.state.conflicts[id] = {
                id,
                local: base,
                remote: fields(prev),
                base,
                fields: [],
              };
            }
          } else {
            delete this.state.bases[id];
            delete this.state.links[id];
            delete this.state.conflicts[id];
          }
        }
      }
      for (const id of Object.keys(this.state.bases)) {
        if (
          !this.state.tasks[id] &&
          !this.state.queue.some((o) => o.target === id) &&
          !this.state.conflicts[id]
        )
          delete this.state.bases[id];
      }
    } else {
      for (const task of response.items) {
        if (task.is_deleted) {
          const prior = this.state.tasks[task.id];
          this.state.tasks[task.id] = prior
            ? { ...prior, is_deleted: true }
            : task;
        } else this.state.tasks[task.id] = task;
      }
    }
    for (const project of response.projects) {
      if (project.is_deleted) delete this.state.projects[project.id];
      else this.state.projects[project.id] = project;
    }
    for (const section of response.sections) {
      if (section.is_deleted) delete this.state.sections[section.id];
      else this.state.sections[section.id] = section;
    }
    this.state.token = response.sync_token;
  }
  private async run(): Promise<void> {
    this.status = "Syncing";
    this.emit();
    let duplicateWarning = "";
    try {
      const account = await this.api.account();
      if (this.state.accountId && account !== this.state.accountId)
        throw new Error(
          "Different Todoist account; restore the original token or back up and reset Flowstitch data",
        );
      this.state.accountId = account;
      const response = await this.api.sync(this.state.token);
      if (this.stopped) return;
      this.apply(response);
      await this.port.save();
      if (this.port.writer()) {
        duplicateWarning = await this.collect();
        if (this.stopped) return;
        this.checkQueue();
        const eligible = this.state.queue.filter(
          (o) =>
            o.nextAt <= this.port.now() &&
            !o.error &&
            !this.state.conflicts[o.target ?? ""],
        );
        const batch: Operation[] = [];
        let bytes = 0;
        for (const op of eligible) {
          const cost = JSON.stringify(op.command).length * 6;
          if (batch.length === 100 || bytes + cost > 800000) break;
          batch.push(op);
          bytes += cost;
        }
        if (batch.length) {
          for (const op of batch) {
            op.attempts++;
            op.nextAt = this.port.now() + 30000;
          }
          await this.port.save();
          const result = await this.api.sync(
            this.state.token,
            batch.map((o) => o.command),
          );
          if (this.stopped) return;
          this.apply(result);
          for (const op of batch) {
            const outcome = result.sync_status[op.command.uuid];
            if (outcome === "ok") {
              if (op.command.temp_id) {
                const id = result.temp_id_mapping[op.command.temp_id];
                if (!id) {
                  op.error =
                    "Create acknowledged without ID; manual inspection needed";
                  continue;
                }
                if (op.source)
                  this.state.links[id] = {
                    path: op.source,
                    anchor: op.sourceAnchor,
                  };
                const task = this.state.tasks[id];
                if (task) this.state.bases[id] = fields(task); // preserve UUID-to-ID mapping until Markdown is linked
                this.state.links["pending:" + op.command.temp_id] = {
                  path: id,
                };
              }
              if (op.target && op.base)
                this.state.bases[op.target] = op.noteBaseline ?? op.base;
              this.state.queue = this.state.queue.filter((o) => o !== op);
            } else if (outcome)
              op.error = `Todoist rejected command (${outcome.error_code})`;
            else op.nextAt = this.port.now() + 30000;
          }
          await this.port.save();
          for (const op of batch) {
            if (
              op.target &&
              result.sync_status[op.command.uuid] === "ok" &&
              !this.state.queue.some((o) => o.target === op.target)
            ) {
              const remote = this.state.tasks[op.target];
              const baseline = op.noteBaseline ?? op.base;
              if (remote && baseline) {
                try {
                  await this.acknowledge(op.target, baseline, fields(remote));
                } catch {
                  // One note race must not fail the whole run.
                }
              }
            }
          }
        }
        try {
          await this.pull();
        } catch {
          // Pull races defer to the next run; batch work above is retained.
        }
      }
      if (this.stopped) return;
      this.state.lastSync = this.port.now();
      this.failures = 0;
      this.retryAt = 0;
      this.status = this.port.writer() ? "Connected" : "Read-only";
      this.error = duplicateWarning;
      await this.port.save();
    } catch (error) {
      if (this.stopped) return;
      const apiError = error instanceof ApiError ? error : null;
      this.error =
        apiError?.message ??
        (error instanceof Error &&
        (error.message.startsWith("Different Todoist account") ||
          error.message.startsWith("Duplicate Markdown task identity"))
          ? error.message
          : "Sync deferred; a note or response changed unexpectedly");
      this.status =
        apiError?.status === 401 || apiError?.status === 403
          ? "Authentication required"
          : "Offline / retry pending";
      this.failures++;
      this.retryAt =
        this.port.now() +
        Math.max(
          apiError?.retryAfter ?? 0,
          Math.min(300000, 1000 * 2 ** Math.min(this.failures, 8)),
        );
      for (const op of this.state.queue)
        if (!op.error) op.nextAt = Math.max(op.nextAt, this.retryAt);
      await this.port.save();
    } finally {
      this.emit();
    }
  }
  private checkQueue(): void {
    for (const op of this.state.queue) {
      if (!op.target || !op.base || !op.desired) continue;
      const remote = this.state.tasks[op.target];
      if (!remote || remote.is_deleted) {
        op.error = "Remote task missing or deleted; retained for inspection";
        continue;
      }
      const result = reconcile(op.base, op.desired, fields(remote));
      if (result.conflicts.length)
        this.state.conflicts[op.target] = {
          id: op.target,
          local: op.desired,
          remote: fields(remote),
          base: op.base,
          fields: result.conflicts,
        };
      if (
        op.expectedDescription !== undefined &&
        remote.description !== op.expectedDescription &&
        remote.description !== op.command.args.description
      )
        op.error =
          "Description changed in Todoist; reopen the editor and compare before retry";
    }
  }
  private async collect(): Promise<string> {
    const counts = new Map<string, number>();
    for (const path of await this.port.notes.paths()) {
      let lines: LinkedLine[] = [];
      try {
        lines = scan(
          await this.port.notes.read(path),
          this.state.settings.marker,
          this.state.settings.defaultProject,
        );
      } catch {
        continue;
      }
      for (const line of lines) {
        if (line.key) counts.set(line.key, (counts.get(line.key) ?? 0) + 1);
      }
    }
    const duplicates = new Set(
      [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k),
    );
    for (const path of await this.port.notes.paths()) {
      if (this.stopped || !this.port.writer()) return "";
      let text: string;
      try {
        text = await this.port.notes.read(path);
      } catch {
        continue;
      }
      let prepared = text;
      try {
        prepared = prepare(
          text,
          this.state.settings.marker,
          this.state.settings.defaultProject,
          this.port.notes.optIn(path),
        );
        if (text !== prepared) {
          await this.port.notes.process(path, (t) =>
            t === text ? prepared : t,
          );
          try {
            text = await this.port.notes.read(path);
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
      let lines: LinkedLine[];
      try {
        lines = scan(
          text,
          this.state.settings.marker,
          this.state.settings.defaultProject,
          this.port.notes.optIn(path),
        );
      } catch {
        continue;
      }
      for (const line of lines) {
        if (!line.key || duplicates.has(line.key)) continue;
        try {
          await this.collectLine(path, line);
        } catch {
          continue;
        }
      }
    }
    await this.port.save();
    if (duplicates.size) {
      return "Duplicate Markdown task identity; remove the copied Flowstitch comment before syncing";
    }
    return "";
  }
  private async collectLine(path: string, line: LinkedLine): Promise<void> {
    const pendingId = this.state.links["pending:" + line.key]?.path;
    if (!line.id && pendingId) {
      const task = this.state.tasks[pendingId];
      if (task) {
        if (line.value.checked && !task.checked) {
          const merged = { ...fields(task), checked: true };
          await this.write(path, line, merged, pendingId);
          if (
            !this.state.queue.some((o) => o.target === pendingId && !o.error)
          ) {
            await this.enqueue(
              { type: "item_close", uuid: uuid(), args: { id: pendingId } },
              {
                target: pendingId,
                base: fields(task),
                desired: merged,
                noteBaseline: merged,
              },
            );
          }
        } else {
          await this.write(path, line, fields(task), pendingId);
        }
        return;
      }
    }
    if (!line.id) {
      if (!this.state.queue.some((o) => o.command.uuid === line.key))
        await this.create(
          {
            ...this.args(line.value),
            description: `[Open source note](${this.noteUri(path)})`,
            auto_reminder: false,
          },
          path,
          line.key,
        );
      return;
    }
    const remote = this.state.tasks[line.id];
    this.state.links[line.id] = { ...this.state.links[line.id], path };
    if (!remote || remote.is_deleted) return;
    const base = this.state.bases[line.id];
    if (!base) {
      if (!equal(line.value, fields(remote))) {
        this.state.conflicts[line.id] = {
          id: line.id,
          local: line.value,
          remote: fields(remote),
          base: fields(remote),
          fields: fieldKeys.filter(
            (k) => !equal(line.value[k], fields(remote)[k]),
          ),
        };
      } else this.state.bases[line.id] = fields(remote);
      return;
    }
    if (this.state.conflicts[line.id]) {
      this.state.conflicts[line.id]!.local = line.value;
      this.state.conflicts[line.id]!.remote = fields(remote);
      return;
    }
    const queued = this.state.queue.filter((o) => o.target === line.id);
    if (queued.length) {
      for (const op of queued) {
        if (op.base && op.desired) {
          const r = reconcile(op.base, op.desired, fields(remote));
          if (r.conflicts.length)
            this.state.conflicts[line.id] = {
              id: line.id,
              local: op.desired,
              remote: fields(remote),
              base: op.base,
              fields: r.conflicts,
            };
        }
      }
      return;
    }
    const result = reconcile(base, line.value, fields(remote));
    if (
      result.merged.content === remote.content &&
      line.value.content !== remote.content &&
      losesContext(line.value.content, remote.content) &&
      !result.conflicts.includes("content")
    )
      result.conflicts.push("content");
    if (result.conflicts.length) {
      this.state.conflicts[line.id] = {
        id: line.id,
        local: line.value,
        remote: fields(remote),
        base,
        fields: result.conflicts,
      };
      return;
    }
    if (!equal(result.merged, fields(remote)))
      await this.edit(remote, result.merged, undefined, line.value);
  }
  private args(value: Fields): Record<string, unknown> {
    return {
      content: value.content,
      ...(value.project_id ? { project_id: value.project_id } : {}),
      priority: value.priority,
      labels: value.labels,
      ...(value.due ? { due: value.due } : {}),
      ...(value.parent_id ? { parent_id: value.parent_id } : {}),
    };
  }
  // Set by the Obsidian adapter; no file-system paths transmitted.
  noteUri: (path: string) => string = (path) =>
    `obsidian://open?file=${encodeURIComponent(path).replace(/\(/g, "%28").replace(/\)/g, "%29")}`;
  private async write(
    path: string,
    line: LinkedLine,
    value: Fields,
    id: string,
  ): Promise<void> {
    if (this.stopped || !this.port.writer()) return;
    await this.port.notes.process(path, (text) =>
      patch(text, line, value, id, this.state.settings.marker),
    );
    this.state.bases[id] = value;
    this.state.links[id] = { ...this.state.links[id], path };
  }
  private async acknowledge(
    id: string,
    baseline: Fields,
    remote: Fields,
  ): Promise<void> {
    for (const path of await this.port.notes.paths()) {
      let text: string;
      try {
        text = await this.port.notes.read(path);
      } catch {
        continue;
      }
      let line;
      try {
        line = scan(
          text,
          this.state.settings.marker,
          this.state.settings.defaultProject,
        ).find((l) => l.id === id);
      } catch {
        continue;
      }
      if (line && equal(line.value, baseline)) {
        try {
          await this.write(path, line, remote, id);
        } catch {
          continue;
        }
      }
    }
  }
  private async pull(): Promise<void> {
    for (const path of await this.port.notes.paths()) {
      if (this.stopped || !this.port.writer()) return;
      let text: string;
      try {
        text = await this.port.notes.read(path);
      } catch {
        continue;
      }
      let lines: LinkedLine[];
      try {
        lines = scan(
          text,
          this.state.settings.marker,
          this.state.settings.defaultProject,
          this.port.notes.optIn(path),
        );
      } catch {
        continue;
      }
      for (const line of lines) {
        try {
          const id = line.id ?? this.state.links["pending:" + line.key]?.path;
          if (
            !id ||
            this.state.conflicts[id] ||
            this.state.queue.some((o) => o.target === id && !o.error)
          )
            continue;
          const remote = this.state.tasks[id];
          if (!remote || remote.is_deleted) continue;
          const base = this.state.bases[id];
          if (base && line.id) {
            const result = reconcile(base, line.value, fields(remote));
            if (
              result.conflicts.length ||
              !equal(result.merged, fields(remote))
            )
              continue;
          }
          if (!line.id || !equal(line.value, fields(remote)))
            await this.write(path, line, fields(remote), id);
          else this.state.bases[id] = fields(remote);
        } catch {
          continue;
        }
      }
    }
    await this.port.save();
  }
  async resolve(id: string, choice: "local" | "remote"): Promise<void> {
    this.writable();
    const conflict = this.state.conflicts[id];
    const remote = this.state.tasks[id];
    if (!conflict || !remote) return;
    this.state.queue = this.state.queue.filter((o) => o.target !== id);
    if (choice === "local")
      await this.edit(remote, conflict.local, undefined, conflict.local);
    else {
      for (const path of await this.port.notes.paths()) {
        const text = await this.port.notes.read(path);
        const line = scan(
          text,
          this.state.settings.marker,
          this.state.settings.defaultProject,
        ).find((t) => t.id === id);
        if (line) await this.write(path, line, fields(remote), id);
      }
    }
    delete this.state.conflicts[id];
    await this.port.save();
    this.emit();
  }
  async discardRejected(commandId: string): Promise<void> {
    this.writable();
    const operation = this.state.queue.find(
      (op) => op.command.uuid === commandId,
    );
    if (!operation?.error)
      throw new Error("Only explicitly rejected operations can be discarded");
    this.state.queue = this.state.queue.filter((op) => op !== operation);
    await this.port.save();
    this.emit();
  }
  async retry(): Promise<void> {
    this.writable();
    for (const op of this.state.queue) {
      op.nextAt = 0;
      delete op.error;
    }
    this.retryAt = 0;
    await this.port.save();
    await this.sync(true);
  }
}
