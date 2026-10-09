import { describe, it, expect } from "vitest";
import { TodoistClient, ApiError, type Transport } from "../../src/api/client";
import { SyncEngine } from "../../src/sync/engine";
import { initialState, type Task, type Command } from "../../src/types";
import { scan } from "../../src/notes/markdown";
function harness(note = "- [ ] Request prices #todoist\n") {
  const state = initialState();
  state.settings.defaultProject = "work";
  let now = 100000;
  let offline = false;
  let saves = 0;
  let writes = 0;
  const notes: Record<string, string> = { "Note.md": note };
  const tasks: Record<string, Task> = {};
  const seen = new Set<string>();
  const commands: Command[] = [];
  let lastToken = "*";
  const mapping: Record<string, string> = {};
  const transport: Transport = async (req) => {
    if (req.url.endsWith("/user"))
      return { status: 200, headers: {}, json: { id: "user" } };
    if (offline) throw new Error("offline");
    const body = new URLSearchParams(req.body);
    lastToken = body.get("sync_token")!;
    const batch = JSON.parse(body.get("commands")!) as Command[];
    const status: Record<string, string> = {};
    for (const cmd of batch) {
      status[cmd.uuid] = "ok";
      if (seen.has(cmd.uuid)) continue;
      seen.add(cmd.uuid);
      commands.push(cmd);
      const id = String(cmd.args.id);
      if (cmd.type === "item_add") {
        const created = "task" + Object.keys(tasks).length;
        mapping[cmd.temp_id!] = created;
        tasks[created] = {
          id: created,
          content: String(cmd.args.content),
          description: String(cmd.args.description ?? ""),
          project_id: String(cmd.args.project_id ?? "inbox"),
          priority: Number(cmd.args.priority ?? 1),
          labels: [],
          parent_id: null,
          section_id: null,
          due: (cmd.args.due as Task["due"]) ?? null,
          checked: false,
        };
      } else if (cmd.type === "item_close") {
        const t = tasks[id]!;
        if (t.due?.is_recurring)
          t.due = { ...t.due, date: "2026-10-10T13:30:00" };
        else t.checked = true;
      } else if (cmd.type === "item_uncomplete") tasks[id]!.checked = false;
      else Object.assign(tasks[id]!, cmd.args);
    }
    return {
      status: 200,
      headers: {},
      json: {
        sync_token: "next",
        full_sync: lastToken === "*",
        items: Object.values(tasks),
        projects: [{ id: "work", name: "Work" }],
        sections: [],
        sync_status: status,
        temp_id_mapping: mapping,
      },
    };
  };
  const api = new TodoistClient(transport, () => "secret");
  const port = {
    save: async () => {
      saves++;
    },
    notes: {
      paths: async () => Object.keys(notes),
      read: async (p: string) => notes[p]!,
      process: async (p: string, fn: (s: string) => string) => {
        const next = fn(notes[p]!);
        if (next !== notes[p]) writes++;
        notes[p] = next;
      },
      optIn: () => false,
    },
    writer: () => true,
    now: () => now,
  };
  const engine = new SyncEngine(state, api, port);
  return {
    state,
    engine,
    tasks,
    notes,
    commands,
    port,
    offline: (v: boolean) => {
      offline = v;
    },
    advance: () => {
      now += 600000;
    },
    saves: () => saves,
    writes: () => writes,
    token: () => lastToken,
  };
}
describe("durable incremental two-way engine", () => {
  it("creates an opted-in checkbox once through repeated syncs and reload", async () => {
    const h = harness();
    await h.engine.sync();
    expect(h.commands.filter((c) => c.type === "item_add")).toHaveLength(1);
    expect(scan(h.notes["Note.md"]!, "#todoist", "work")[0]?.id).toBe("task0");
    await h.engine.sync();
    const reloaded = new SyncEngine(
      h.state,
      new TodoistClient(
        async () => {
          throw new ApiError(0);
        },
        () => "secret",
      ),
      h.port,
    );
    await reloaded.sync();
    expect(h.commands.filter((c) => c.type === "item_add")).toHaveLength(1);
    expect(h.token()).toBe("next");
  });
  it("pulls title changes without touching surrounding text", async () => {
    const h = harness(
      "# Meeting\n\n- [ ] Request prices #todoist\n\nPrivate notes",
    );
    await h.engine.sync();
    h.tasks.task0!.content = "Updated prices";
    await h.engine.sync();
    expect(h.notes["Note.md"]).toContain("Updated prices");
    expect(h.notes["Note.md"]).toContain("Private notes");
  });
  it("completes locally and pulls remote completion then reopens", async () => {
    const h = harness();
    await h.engine.sync();
    h.notes["Note.md"] = h.notes["Note.md"]!.replace("[ ]", "[x]");
    await h.engine.sync();
    expect(h.tasks.task0!.checked).toBe(true);
    h.notes["Note.md"] = h.notes["Note.md"]!.replace("[x]", "[ ]");
    await h.engine.sync();
    expect(h.tasks.task0!.checked).toBe(false);
    h.tasks.task0!.checked = true;
    await h.engine.sync();
    expect(h.notes["Note.md"]).toContain("[x]");
  });
  it("closes recurring occurrence once and resets the live checkbox without losing the rule", async () => {
    const h = harness();
    await h.engine.sync();
    h.tasks.task0!.due = {
      date: "2026-10-09T13:30:00",
      string: "every weekday at 13:30",
      is_recurring: true,
      timezone: "Europe/London",
    };
    await h.engine.sync();
    h.notes["Note.md"] = h.notes["Note.md"]!.replace("[ ]", "[x]");
    await h.engine.sync();
    expect(h.tasks.task0!.checked).toBe(false);
    expect(h.tasks.task0!.due?.string).toBe("every weekday at 13:30");
    expect(h.notes["Note.md"]).toContain("[ ]");
    await h.engine.sync();
    expect(h.commands.filter((c) => c.type === "item_close")).toHaveLength(1);
    expect(h.commands.some((c) => c.type.includes("reminder"))).toBe(false);
  });
  it("retains offline capture and recovers with the same UUID", async () => {
    const h = harness("");
    h.offline(true);
    const key = await h.engine.create({ content: "Offline" });
    await h.engine.sync();
    expect(h.state.queue[0]?.command.uuid).toBe(key);
    h.offline(false);
    h.advance();
    await h.engine.sync();
    expect(h.state.queue).toHaveLength(0);
    expect(Object.values(h.tasks)).toHaveLength(1);
  });
  it("holds concurrent same-field edits for explicit resolution", async () => {
    const h = harness();
    await h.engine.sync();
    h.notes["Note.md"] = h.notes["Note.md"]!.replace(
      "Request prices",
      "Local edit",
    );
    h.tasks.task0!.content = "Other device";
    await h.engine.sync();
    expect(h.state.conflicts.task0?.fields).toContain("content");
    expect(h.tasks.task0!.content).toBe("Other device");
    expect(h.notes["Note.md"]).toContain("Local edit");
    await h.engine.resolve("task0", "local");
    await h.engine.sync();
    expect(h.tasks.task0!.content).toBe("Local edit");
  });
  it("merges non-conflicting fields", async () => {
    const h = harness();
    await h.engine.sync();
    h.notes["Note.md"] = h.notes["Note.md"]!.replace(
      "Request prices",
      "Local edit",
    );
    h.tasks.task0!.priority = 4;
    await h.engine.sync();
    expect(h.tasks.task0!.content).toBe("Local edit");
    expect(h.tasks.task0!.priority).toBe(4);
    expect(h.state.conflicts).toEqual({});
  });
  it("rename keeps remote task identity", async () => {
    const h = harness();
    await h.engine.sync();
    h.notes["Moved.md"] = h.notes["Note.md"]!;
    delete h.notes["Note.md"];
    await h.engine.sync();
    expect(h.state.links.task0?.path).toBe("Moved.md");
    expect(h.commands.filter((c) => c.type === "item_add")).toHaveLength(1);
  });
  it("leaves unopted tasks and unchanged notes alone", async () => {
    const h = harness("- [ ] Untouched\n");
    await h.engine.sync();
    expect(h.commands).toHaveLength(0);
    expect(h.writes()).toBe(0);
    const another = harness();
    await another.engine.sync();
    const writes = another.writes();
    await another.engine.sync();
    expect(another.writes()).toBe(writes);
  });
  it("stops further operations after unload", async () => {
    const h = harness();
    h.engine.stop();
    await h.engine.sync();
    expect(h.commands).toHaveLength(0);
    await expect(h.engine.create({ content: "No" })).rejects.toThrow();
  });
  it("never infers completion from remote deletion", async () => {
    const h = harness();
    await h.engine.sync();
    h.tasks.task0!.is_deleted = true;
    await h.engine.sync();
    expect(h.notes["Note.md"]).toContain("[ ]");
  });
});
it("dashboard edits update an already linked note after acknowledgement", async () => {
  const h = harness();
  await h.engine.sync();
  const task = h.tasks.task0!;
  await h.engine.edit(task, {
    ...fieldsFor(task),
    content: "Dashboard edit",
    priority: 4,
  });
  await h.engine.sync();
  expect(h.notes["Note.md"]).toContain("Dashboard edit");
  expect(h.state.conflicts).toEqual({});
  await h.engine.sync();
  expect(h.state.conflicts).toEqual({});
});
it("offline dashboard changes conflict with newer remote edits even without linked notes", async () => {
  const h = harness();
  await h.engine.sync();
  const task = h.tasks.task0!;
  await h.engine.edit(task, { ...fieldsFor(task), content: "Offline edit" });
  delete h.notes["Note.md"];
  h.tasks.task0!.content = "Remote edit";
  await h.engine.sync();
  expect(h.state.conflicts.task0?.fields).toContain("content");
  expect(h.tasks.task0!.content).toBe("Remote edit");
});
it("rejects duplicated creation markers across notes before sending", async () => {
  const h = harness();
  await h.engine.sync();
  h.notes["Copy.md"] = h.notes["Note.md"]!;
  await h.engine.sync();
  expect(h.engine.error).toContain("Duplicate");
  expect(h.commands.filter((c) => c.type === "item_add")).toHaveLength(1);
});
it("read-only engine fetches cache while refusing capture and vault mutations", async () => {
  const h = harness();
  h.port.writer = () => false;
  await h.engine.sync();
  expect(h.engine.status).toBe("Read-only");
  expect(h.writes()).toBe(0);
  await expect(h.engine.create({ content: "No" })).rejects.toThrow();
});
it("rejects switching Todoist accounts before syncing any existing queue", async () => {
  const h = harness();
  h.state.accountId = "another-user";
  await h.engine.create({ content: "Pending" });
  await h.engine.sync();
  expect(h.engine.error).toContain("Different Todoist account");
  expect(h.commands).toHaveLength(0);
  expect(h.state.queue).toHaveLength(1);
});
it("lost acknowledgement retries the same command after server commit", async () => {
  const h = harness("");
  let commit = true;
  const accepted = new Set<string>();
  let creations = 0;
  const api = new TodoistClient(
    async (r) => {
      if (r.url.endsWith("/user"))
        return { status: 200, headers: {}, json: { id: "user" } };
      const cmds = JSON.parse(
        new URLSearchParams(r.body).get("commands")!,
      ) as Command[];
      if (cmds.length) {
        const c = cmds[0]!;
        if (!accepted.has(c.uuid)) {
          accepted.add(c.uuid);
          creations++;
        }
        if (commit) {
          commit = false;
          throw new Error("Response lost after acceptance");
        }
        expect(c.uuid).toBe(h.state.queue[0]?.command.uuid);
        return {
          status: 200,
          headers: {},
          json: {
            sync_token: "new",
            items: [],
            sync_status: { [c.uuid]: "ok" },
            temp_id_mapping: { [c.temp_id!]: "existing" },
          },
        };
      }
      return {
        status: 200,
        headers: {},
        json: {
          sync_token: "new",
          items: [],
          sync_status: {},
          temp_id_mapping: {},
        },
      };
    },
    () => "secret",
  );
  const engine = new SyncEngine(h.state, api, h.port);
  const key = await engine.create({ content: "Accepted" });
  await engine.sync();
  expect(h.state.queue[0]?.command.uuid).toBe(key);
  h.advance();
  await engine.sync();
  expect(h.state.queue).toHaveLength(0);
  expect(h.state.links["pending:" + key]?.path).toBe("existing");
  expect(creations).toBe(1);
});
it("does not rewrite a large set of ordinary notes", async () => {
  const h = harness("");
  for (let i = 0; i < 1000; i++)
    h.notes[`ordinary-${i}.md`] = "# Notes\n- [ ] Keep local\n";
  await h.engine.sync();
  expect(h.writes()).toBe(0);
  expect(h.commands).toHaveLength(0);
});
function fieldsFor(task: Task) {
  return {
    content: task.content,
    checked: task.checked,
    due: task.due,
    priority: task.priority,
    project_id: task.project_id,
    labels: task.labels,
    parent_id: task.parent_id,
  };
}
it("explicitly discards only rejected operations without deleting task or note content", async () => {
  const h = harness();
  await h.engine.sync();
  const before = h.notes["Note.md"];
  const key = await h.engine.create({ content: "Pending" });
  await expect(h.engine.discardRejected(key)).rejects.toThrow();
  h.state.queue[0]!.error = "Server rejected";
  await h.engine.discardRejected(key);
  expect(h.state.queue).toHaveLength(0);
  expect(h.notes["Note.md"]).toBe(before);
  expect(h.tasks.task0).toBeDefined();
});
it("defers remote title replacements that would remove local context links or tags", async () => {
  const h = harness("- [ ] Review [[Supplier]] #work #todoist\n");
  await h.engine.sync();
  h.tasks.task0!.content = "New plain title";
  await h.engine.sync();
  expect(h.state.conflicts.task0?.fields).toContain("content");
  expect(h.notes["Note.md"]).toContain("[[Supplier]] #work");
  await h.engine.resolve("task0", "remote");
  expect(h.notes["Note.md"]).toContain("New plain title");
});
