// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from "vitest";
import { Dashboard } from "../../src/ui/dashboard";
import { ConnectionModal, TaskModal } from "../../src/ui/modals";
import { initialState, type Task } from "../../src/types";
import type Flowstitch from "../../src/main";
import { Modal } from "../obsidian-stub";
import "../dom-setup";
const task: Task = {
  id: "one",
  content: "Review supplier prices",
  description: "Context",
  project_id: "work",
  section_id: null,
  parent_id: null,
  due: { date: "2000-01-01" },
  priority: 4,
  labels: ["supplier"],
  checked: false,
};
function plugin() {
  const state = initialState();
  state.projects = { work: { id: "work", name: "Work" } };
  state.settings.defaultProject = "work";
  state.tasks = { one: { ...task } };
  const listeners = new Set<() => void>();
  const engine = {
    status: "Offline / retry pending",
    error: "Network unavailable",
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    sync: vi.fn(async () => {}),
    edit: vi.fn(async () => {}),
    create: vi.fn(async () => "uuid"),
  };
  const fake = {
    state,
    engine,
    api: {
      filter: vi.fn(async () => [task]),
      completed: vi.fn(async () => [{ ...task, checked: true }]),
    },
    app: {
      secretStorage: { getSecret: () => "secret" },
      workspace: { openLinkText: vi.fn() },
      vault: {
        getFileByPath: () => ({}),
        getAbstractFileByPath: () => null,
        create: vi.fn(async () => ({})),
      },
    },
    canWrite: () => true,
    competing: [],
    diagnostics: vi.fn(),
    connect: vi.fn(),
    contextProject: () => "",
    noteUri: (p: string) => "obsidian://open?file=" + p,
    save: vi.fn(async () => {}),
    ensureFolder: vi.fn(async () => {}),
  };
  return { fake, plugin: fake as unknown as Flowstitch, listeners };
}
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
beforeEach(() => {
  Modal.opened = [];
});
it("renders cached tasks offline and sends completion through the engine", async () => {
  const h = plugin();
  const el = document.createElement("div");
  document.body.append(el);
  const ui = new Dashboard(h.plugin, el);
  expect(el.textContent).toContain("Review supplier prices");
  expect(el.textContent).toContain("Network unavailable");
  expect(el.querySelector("output.flowstitch-status")?.textContent).toContain(
    "Network unavailable",
  );
  expect(el.querySelectorAll("ul.flowstitch-task-list > li")).toHaveLength(1);
  expect(el.querySelector("ul > h3")).toBeNull();
  const check = el.querySelector<HTMLInputElement>("input[type=checkbox]")!;
  check.checked = true;
  check.dispatchEvent(new Event("change"));
  await settle();
  expect(h.fake.engine.edit).toHaveBeenCalledWith(
    h.fake.state.tasks.one,
    expect.objectContaining({ checked: true }),
  );
  ui.dispose();
  expect(h.listeners.size).toBe(0);
});
it("opens the Todoist token page without exposing the opener", async () => {
  const h = plugin();
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  try {
    const modal = new ConnectionModal(h.plugin);
    modal.open();
    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((b) => b.textContent === "Open Todoist token page")!
      .click();
    await settle();
    expect(open).toHaveBeenCalledWith(
      "https://app.todoist.com/app/settings/integrations/developer",
      "_blank",
      "noopener,noreferrer",
    );
  } finally {
    open.mockRestore();
  }
});
it("renders malicious Todoist content as inert text", () => {
  const h = plugin();
  h.fake.state.tasks.one!.content = '<img src=x onerror="alert(1)">';
  const el = document.createElement("div");
  new Dashboard(h.plugin, el);
  expect(el.querySelector("img")).toBeNull();
  expect(el.textContent).toContain("<img");
});
it("searches cached tasks, switches views, and filters projects", async () => {
  const h = plugin();
  const el = document.createElement("div");
  new Dashboard(h.plugin, el);
  const search = el.querySelector<HTMLInputElement>("input[type=search]")!;
  search.value = "missing";
  search.dispatchEvent(new Event("input"));
  expect(el.textContent).not.toContain("Review supplier prices");
  const projects = Array.from(el.querySelectorAll("button")).find(
    (b) => b.textContent === "Projects",
  )!;
  projects.click();
  await settle();
  expect(
    el.querySelector('select[aria-label="Filter section"]'),
  ).not.toBeNull();
});
it("completed view retrieves actual history and provides reopen action", async () => {
  const h = plugin();
  const el = document.createElement("div");
  new Dashboard(h.plugin, el);
  Array.from(el.querySelectorAll("button"))
    .find((b) => b.textContent === "Completed")!
    .click();
  await settle();
  expect(h.fake.api.completed).toHaveBeenCalled();
  expect(
    el.querySelector<HTMLInputElement>("input[type=checkbox]")?.checked,
  ).toBe(true);
});
it("capture queues a task with description, project and a source URI", async () => {
  const h = plugin();
  new TaskModal(h.plugin, undefined, "Captured task", "Note.md").open();
  const modal = Modal.opened[Modal.opened.length - 1]!;
  Array.from(modal.contentEl.querySelectorAll("button"))
    .find((b) => b.textContent === "Capture task")!
    .click();
  await settle();
  expect(h.fake.engine.create).toHaveBeenCalledWith(
    expect.objectContaining({
      content: "Captured task",
      project_id: "work",
      description: expect.stringContaining("obsidian://open?file=Note.md"),
    }),
    "Note.md",
    expect.any(String),
  );
});
it("Website News launches a copy with optional steps and never mutates a master", async () => {
  const h = plugin();
  h.fake.state.tasks.master = {
    ...task,
    id: "master",
    content: "Website news [MASTER TEMPLATE]",
  };
  const preset = h.fake.state.settings.presets[0]!;
  preset.masterId = "master";
  preset.subtasks = ["Prepare content", "Publish"];
  const before = structuredClone(h.fake.state.tasks.master);
  new TaskModal(h.plugin, undefined, "Article", undefined, preset).open();
  const modal = Modal.opened[Modal.opened.length - 1]!;
  const toggles = modal.contentEl.querySelectorAll<HTMLInputElement>(
    "input[type=checkbox]",
  );
  toggles[1]!.checked = true;
  toggles[1]!.dispatchEvent(new Event("change"));
  Array.from(modal.contentEl.querySelectorAll("button"))
    .find((b) => b.textContent === "Capture task")!
    .click();
  await settle();
  expect(h.fake.engine.create).toHaveBeenCalledTimes(3);
  expect(h.fake.engine.create).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ content: "Website news: Article" }),
    undefined,
    expect.any(String),
  );
  expect(h.fake.state.tasks.master).toEqual(before);
});
it("writes a labelled desktop/mobile visual harness from production dashboard markup", async () => {
  const h = plugin();
  h.fake.engine.status = "Cached preview";
  h.fake.engine.error = "";
  h.fake.state.tasks.one!.due = {
    date: new Date().toISOString().slice(0, 10) + "T13:30:00",
    string: "every weekday",
    is_recurring: true,
  };
  h.fake.state.tasks.second = {
    ...task,
    id: "second",
    content: "Prepare Website News article",
    due: { date: new Date().toISOString().slice(0, 10) + "T15:00:00" },
    priority: 2,
  };
  const el = document.createElement("div");
  new Dashboard(h.plugin, el);
  const { writeFile, mkdir, readFile } = await import("node:fs/promises");
  await mkdir("docs/screenshots", { recursive: true });
  const css = await readFile("styles.css", "utf8");
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flowstitch UI harness</title><style>:root{--text-normal:#25232b;--text-muted:#787380;--text-accent:#7660bd;--text-error:#b95252;--text-warning:#aa772d;--background-secondary:#f5f3f8;--background-modifier-border:#e5e0ea;--background-modifier-active-hover:#ede8f7;--interactive-accent:#7660bd;--font-ui-small:14px;--font-ui-smaller:12px;--font-ui-medium:16px;--font-ui-large:24px;--font-semibold:600;--radius-s:6px}body{font-family:system-ui;margin:0;background:#faf9fc;color:var(--text-normal)}button,input,select{font:inherit;border:1px solid var(--background-modifier-border);border-radius:6px;padding:6px 10px;background:#fff;color:inherit}button{cursor:pointer}@media(prefers-color-scheme:dark){:root{--text-normal:#e8e4ed;--text-muted:#a49dad;--text-accent:#b9a4ec;--background-secondary:#28252e;--background-modifier-border:#3a3542;--background-modifier-active-hover:#383043;--interactive-accent:#b9a4ec}body{background:#211e26}button,input,select{background:#28252e}}.mod-cta{background:#7660bd;color:white;border-color:transparent}.harness-label{font-size:12px;color:var(--text-muted);padding:12px 16px;background:var(--background-secondary)}${css}</style></head><body><p class="harness-label">UI harness • fixture data • actual Dashboard DOM • not an Obsidian or live Todoist test</p>${el.outerHTML}</body></html>`;
  await writeFile("docs/ui-preview.html", page);
  expect(page).toContain("actual Dashboard DOM");
});
it("capture stores an explicitly chosen heading link", async () => {
  const h = plugin();
  new TaskModal(h.plugin, undefined, "Task", "Note.md").open();
  const modal = Modal.opened[Modal.opened.length - 1]!;
  const setting = Array.from(
    modal.contentEl.querySelectorAll(".setting-item"),
  ).find((el) => el.textContent?.startsWith("Heading or block"))!;
  const input = setting.querySelector("input")!;
  input.value = "Prices";
  input.dispatchEvent(new Event("input"));
  Array.from(modal.contentEl.querySelectorAll("button"))
    .find((b) => b.textContent === "Capture task")!
    .click();
  await settle();
  expect(h.fake.engine.create).toHaveBeenCalledWith(
    expect.any(Object),
    "Note.md",
    expect.any(String),
    "Prices",
  );
});
it("retains a historical task identity for explicit reopen on a fresh installation", async () => {
  const h = plugin();
  delete h.fake.state.tasks.one;
  const el = document.createElement("div");
  new Dashboard(h.plugin, el);
  Array.from(el.querySelectorAll("button"))
    .find((b) => b.textContent === "Completed")!
    .click();
  await settle();
  expect(h.fake.state.tasks).toHaveProperty("one.checked", true);
  const check = el.querySelector<HTMLInputElement>("input[type=checkbox]")!;
  check.checked = false;
  check.dispatchEvent(new Event("change"));
  await settle();
  expect(h.fake.engine.edit).toHaveBeenCalledWith(
    expect.objectContaining({ id: "one", checked: true }),
    expect.objectContaining({ checked: false }),
  );
});
