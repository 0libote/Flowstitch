import { describe, it, expect } from "vitest";
import { TodoistClient, ApiError, parseTask } from "../../src/api/client";
import { SyncEngine } from "../../src/sync/engine";
import { initialState, equal, type Task, type Command } from "../../src/types";
import { scan } from "../../src/notes/markdown";
import { rescheduleDue } from "../../src/notes/dates";

function harness(note = "- [ ] Request prices #todoist\n") {
  const state = initialState();
  state.settings.defaultProject = "work";
  const now = { value: 100000 };
  const notes: Record<string, string> = { "Note.md": note };
  const tasks: Record<string, Task> = {};
  const seen = new Set<string>();
  const commands: Command[] = [];
  let lastToken = "*";
  const mapping: Record<string, string> = {};
  const transport = async (req: {
    url: string;
    body?: string;
  }): Promise<{
    status: number;
    headers: Record<string, string>;
    json: unknown;
  }> => {
    if (req.url.endsWith("/user"))
      return { status: 200, headers: {}, json: { id: "user" } };
    const body = new URLSearchParams(req.body);
    lastToken = body.get("sync_token")!;
    const batch = JSON.parse(body.get("commands")!) as Command[];
    const status: Record<string, string> = {};
    for (const cmd of batch) {
      status[cmd.uuid] = "ok";
      if (seen.has(cmd.uuid)) continue;
      seen.add(cmd.uuid);
      commands.push(cmd);
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
      } else {
        const id = String(cmd.args.id);
        if (tasks[id]) Object.assign(tasks[id]!, cmd.args);
      }
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
    save: async () => {},
    notes: {
      paths: async () => Object.keys(notes),
      read: async (p: string) => {
        if (!(p in notes)) throw new Error("Linked note missing");
        return notes[p]!;
      },
      process: async (p: string, fn: (s: string) => string) => {
        notes[p] = fn(notes[p]!);
      },
      optIn: () => false,
    },
    writer: () => true,
    now: () => now.value,
  };
  const engine = new SyncEngine(state, api, port);
  return { state, engine, tasks, notes, commands, port, now };
}

describe("sync reliability", () => {
  it("equal ignores key order", () => {
    expect(equal({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(equal({ n: { x: 1, y: [1, 2] } }, { n: { y: [1, 2], x: 1 } })).toBe(
      true,
    );
    expect(equal({ a: 1 }, { a: 2 })).toBe(false);
    expect(equal([1, 2], [2, 1])).toBe(false);
  });

  it("Retry-After NaN coerces to 0 and stays finite", async () => {
    for (const header of ["not-a-date", "NaN", ""]) {
      const headers: Record<string, string> = header
        ? { "Retry-After": header }
        : {};
      const api = new TodoistClient(
        async () => ({
          status: 429,
          headers,
          json: {},
        }),
        () => "token",
      );
      try {
        await api.sync("*");
        throw new Error("expected failure");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const after = (e as ApiError).retryAfter;
        expect(Number.isFinite(after)).toBe(true);
        expect(after).toBe(0);
      }
    }
  });

  it("pagination caps pages and items with PaginationLimit", async () => {
    let calls = 0;
    const api = new TodoistClient(
      async () => {
        calls++;
        return {
          status: 200,
          headers: {},
          json: { results: [{ id: "x" }], next_cursor: `c${calls}` },
        };
      },
      () => "token",
    );
    await expect(api.filter("today")).rejects.toThrow("PaginationLimit");
  });

  it("parseTask drops invalid due dates", () => {
    const base = { id: "a", content: "T", project_id: "p" };
    expect(parseTask({ ...base, due: { date: "not-a-date" } }).due).toBeNull();
    expect(parseTask({ ...base, due: { date: "" } }).due).toBeNull();
    expect(
      parseTask({ ...base, due: { date: "2026-10-13" } }).due,
    ).toMatchObject({ date: "2026-10-13" });
    expect(
      parseTask({ ...base, due: { date: "2026-10-13T13:30:00" } }).due,
    ).toBeTruthy();
  });

  it("duplicate identities quarantine without aborting other notes", async () => {
    const h = harness();
    await h.engine.sync();
    expect(h.commands.filter((c) => c.type === "item_add")).toHaveLength(1);
    const linked = h.notes["Note.md"]!;
    h.notes["Copy.md"] = linked;
    h.notes["Other.md"] = "- [ ] Fresh task #todoist\n";
    await h.engine.sync();
    expect(h.engine.error).toContain("Duplicate");
    expect(h.engine.status).toBe("Connected");
    const added = h.commands.filter((c) => c.type === "item_add");
    expect(added.map((c) => c.args.content)).toContain("Fresh task");
    expect(added).toHaveLength(2);
  });

  it("one note race defers that line without failing the run", async () => {
    const h = harness("- [ ] Good #todoist\n");
    h.notes["Bad.md"] = "- [ ] Bad #todoist\n";
    const realProcess = h.port.notes.process;
    h.port.notes.process = async (p, fn) => {
      if (p === "Bad.md") throw new Error("Note changed during sync");
      return realProcess(p, fn);
    };
    await h.engine.sync();
    expect(h.engine.status).toBe("Connected");
    expect(h.engine.error).toBe("");
    expect(
      h.commands
        .filter((c) => c.type === "item_add")
        .map((c) => c.args.content),
    ).toContain("Good");
  });

  it("sync(true) during a run triggers a follow-up run", async () => {
    const h = harness("");
    let syncs = 0;
    const slow = new TodoistClient(
      async (req) => {
        if (req.url.endsWith("/user"))
          return { status: 200, headers: {}, json: { id: "user" } };
        syncs++;
        await new Promise((r) => setTimeout(r, 30));
        return {
          status: 200,
          headers: {},
          json: {
            sync_token: "next",
            items: [],
            projects: [],
            sections: [],
            sync_status: {},
            temp_id_mapping: {},
          },
        };
      },
      () => "secret",
    );
    const engine = new SyncEngine(h.state, slow, h.port);
    const first = engine.sync();
    await new Promise((r) => setTimeout(r, 5));
    const second = engine.sync(true);
    await Promise.all([first, second]);
    // Initial fetch + follow-up fetch = at least 2 sync payload calls.
    expect(syncs).toBeGreaterThanOrEqual(2);
  });

  it("checked-before-first-sync still creates instead of dropping", async () => {
    const h = harness("- [x] Done early #todoist\n");
    await h.engine.sync();
    expect(h.commands.filter((c) => c.type === "item_add")).toHaveLength(1);
    expect(h.state.queue.some((o) => o.command.type === "item_add")).toBe(
      false,
    );
  });

  it("rejected ops do not block new edits on the same task", async () => {
    const h = harness();
    await h.engine.sync();
    const task = h.tasks.task0!;
    const base = {
      content: task.content,
      checked: task.checked,
      due: task.due,
      priority: task.priority,
      project_id: task.project_id,
      labels: task.labels,
      parent_id: task.parent_id,
    };
    await h.engine.edit(task, { ...base, content: "v2" });
    h.state.queue[0]!.error = "Todoist rejected command (1)";
    await h.engine.edit(task, { ...base, content: "v3" });
    expect(h.state.queue).toHaveLength(2);
  });

  it("marker matches inside parentheses and commas", () => {
    expect(scan("- [ ] Task (#todoist)", "#todoist", "")).toHaveLength(1);
    expect(scan("- [ ] Task (#todoist,)", "#todoist", "")).toHaveLength(1);
    expect(scan("- [ ] Task #todoist", "#todoist", "")[0]?.value.content).toBe(
      "Task",
    );
  });

  it("rescheduleDue drops stale string unless recurring", () => {
    const plain = rescheduleDue(
      { date: "2026-10-10", string: "tomorrow", timezone: "Europe/London" },
      "2026-10-13",
      "Europe/London",
    );
    expect(plain.date).toBe("2026-10-13");
    expect("string" in plain).toBe(false);
    const recurring = rescheduleDue(
      {
        date: "2026-10-10T13:30:00",
        string: "every day",
        is_recurring: true,
        timezone: null,
      },
      "2026-10-13",
      "Europe/London",
    );
    expect(recurring.string).toBe("every day");
  });

  it("full_sync quarantines wiped ids and prunes stale bases", async () => {
    const h = harness();
    await h.engine.sync();
    expect(h.state.bases.task0).toBeDefined();
    h.state.links.task0 = { path: "Note.md" };
    const wiped = new TodoistClient(
      async (req: { url: string; body?: string }) => {
        if (req.url.endsWith("/user"))
          return { status: 200, headers: {}, json: { id: "user" } };
        return {
          status: 200,
          headers: {},
          json: {
            sync_token: "wiped",
            full_sync: true,
            items: [],
            projects: [],
            sections: [],
            sync_status: {},
            temp_id_mapping: {},
          },
        };
      },
      () => "secret",
    );
    const engine = new SyncEngine(h.state, wiped, h.port);
    await engine.sync(true);
    expect(h.state.tasks.task0?.is_deleted).toBe(true);
  });

  it("subtask flow resolves parent temp_id to a real id", async () => {
    const h = harness("");
    const parentKey = await h.engine.create({ content: "Parent" });
    await h.engine.sync();
    const realParent = h.state.links["pending:" + parentKey]?.path;
    expect(realParent).toBe("task0");
    await h.engine.create({ content: "Child", parent_id: realParent });
    await h.engine.sync();
    expect(h.commands[h.commands.length - 1]?.args.parent_id).toBe("task0");
  });
});
