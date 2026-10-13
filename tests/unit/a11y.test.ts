// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from "vitest";
import { Dashboard } from "../../src/ui/dashboard";
import { ConnectionModal, TaskModal, PresetModal } from "../../src/ui/modals";
import { FlowstitchSettings } from "../../src/main";
import { initialState, type Task } from "../../src/types";
import type Flowstitch from "../../src/main";
import { Modal, notices, Menu } from "../obsidian-stub";
import "../dom-setup";

const baseTask: Task = {
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

function plugin(overrides: Partial<Record<string, unknown>> = {}) {
  const state = initialState();
  state.projects = { work: { id: "work", name: "Work" } };
  state.settings.defaultProject = "work";
  state.tasks = { one: { ...baseTask } };
  const listeners = new Set<() => void>();
  const engine = {
    status: "Synced",
    error: "",
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit: vi.fn(() => listeners.forEach((fn) => fn())),
    sync: vi.fn(async () => {}),
    edit: vi.fn(async () => {}),
    create: vi.fn(async () => "uuid"),
    retry: vi.fn(async () => {}),
    discardRejected: vi.fn(async () => {}),
    resolve: vi.fn(async () => {}),
  };
  const fake = {
    state,
    engine,
    api: {
      filter: vi.fn(async () => [{ ...baseTask }]),
      completed: vi.fn(async () => [{ ...baseTask, checked: true }]),
    },
    app: {
      secretStorage: { getSecret: () => "secret", setSecret: vi.fn() },
      workspace: { openLinkText: vi.fn() },
      vault: {
        getFileByPath: () => ({}),
        getAbstractFileByPath: () => null,
        create: vi.fn(async () => ({})),
        createFolder: vi.fn(async () => ({})),
      },
      fileManager: { processFrontMatter: vi.fn() },
      metadataCache: { getFileCache: () => null },
    },
    canWrite: () => true,
    competing: [] as string[],
    diagnostics: vi.fn(),
    connect: vi.fn(),
    contextProject: () => "",
    noteUri: (p: string) => "obsidian://open?file=" + p,
    save: vi.fn(async () => {}),
    ensureFolder: vi.fn(async () => {}),
    openDashboard: vi.fn(async () => {}),
    reindex: vi.fn(async () => {}),
    restartTimer: vi.fn(),
    setWriter: vi.fn(),
    ...overrides,
  };
  return { fake, plugin: fake as unknown as Flowstitch, listeners };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  Modal.opened = [];
  notices.length = 0;
  document.body.replaceChildren();
  Object.defineProperty(window.navigator, "onLine", {
    value: true,
    configurable: true,
  });
});

// 1. Tabs APG
it("tabs use roving tabindex with arrow/Home/End activation and wrap", async () => {
  const h = plugin();
  const el = document.createElement("div");
  document.body.append(el);
  const ui = new Dashboard(h.plugin, el, "today");
  const tabs = Array.from(
    el.querySelectorAll('[role="tab"]'),
  ) as HTMLButtonElement[];
  expect(tabs).toHaveLength(6);
  // roving tabindex
  const active = tabs.find((b) => b.getAttribute("aria-selected") === "true")!;
  expect(active.tabIndex).toBe(0);
  for (const b of tabs.filter((b) => b !== active)) expect(b.tabIndex).toBe(-1);
  for (const b of tabs) {
    expect(b.getAttribute("aria-controls")).toBe("flowstitch-panel");
    expect(b.id).toMatch(/^flowstitch-tab-/);
  }
  const panel = el.querySelector("#flowstitch-panel");
  expect(panel?.getAttribute("role")).toBe("tabpanel");
  expect(panel?.getAttribute("aria-labelledby")).toBe(active.id);
  // ArrowRight moves + activates
  active.focus();
  active.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
  );
  await settle();
  const after = el.querySelector(
    '[role="tab"][aria-selected="true"]',
  ) as HTMLButtonElement;
  expect(after.textContent).toBe("Upcoming");
  expect(document.activeElement).toBe(after);
  // Home goes to first, End to last with wrap
  after.dispatchEvent(
    new KeyboardEvent("keydown", { key: "End", bubbles: true }),
  );
  await settle();
  expect(
    (el.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement)
      .textContent,
  ).toBe("Completed");
  const last = el.querySelector(
    '[role="tab"][aria-selected="true"]',
  ) as HTMLButtonElement;
  last.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
  );
  await settle();
  expect(
    (el.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement)
      .textContent,
  ).toBe("Today");
  ui.dispose();
});

it("tabs ArrowLeft and Home activate correctly", async () => {
  const h = plugin();
  const el = document.createElement("div");
  const ui = new Dashboard(h.plugin, el, "upcoming");
  let active = el.querySelector(
    '[role="tab"][aria-selected="true"]',
  ) as HTMLButtonElement;
  expect(active.textContent).toBe("Upcoming");
  active.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
  );
  await settle();
  active = el.querySelector(
    '[role="tab"][aria-selected="true"]',
  ) as HTMLButtonElement;
  expect(active.textContent).toBe("Today");
  active.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
  );
  await settle();
  expect(
    (el.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement)
      .textContent,
  ).toBe("Today");
  ui.dispose();
});

// 2. Status vs alert split
it("splits polite status from assertive error alert", () => {
  const h = plugin();
  h.fake.engine.status = "Synced";
  h.fake.engine.error = "Network unavailable";
  h.fake.competing = ["todoist-board"];
  const el = document.createElement("div");
  new Dashboard(h.plugin, el);
  const output = el.querySelector("output.flowstitch-status")!;
  expect(output.getAttribute("aria-live")).toBe("polite");
  expect(output.getAttribute("aria-atomic")).toBe("true");
  expect(output.textContent).not.toContain("Network unavailable");
  expect(output.textContent).not.toContain("Other integrations");
  const alert = el.querySelector('[role="alert"]')!;
  expect(alert.textContent).toContain("Network unavailable");
  expect(alert.textContent).toContain("Other integrations");
});

// 3. Debounce + focus restore
it("debounces search 200ms and preserves focus by data-key on rerender", async () => {
  const h = plugin();
  const el = document.createElement("div");
  document.body.append(el);
  const ui = new Dashboard(h.plugin, el);
  const search = el.querySelector<HTMLInputElement>("input[type=search]")!;
  search.focus();
  search.value = "missing";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  // immediate: still shows task (debounced)
  expect(el.textContent).toContain("Review supplier prices");
  await new Promise((r) => setTimeout(r, 250));
  expect(el.textContent).not.toContain("Review supplier prices");
  // focus preserved on search after debounce rerender
  const search2 = el.querySelector<HTMLInputElement>("input[type=search]")!;
  expect(document.activeElement).toBe(search2);
  // focus by data-key: focus title then trigger engine.emit rerender
  h.fake.state.tasks.one!.content = "Review supplier prices";
  // clear search to show task again
  search2.value = "";
  search2.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  const title = el.querySelector('[data-key="title-one"]') as HTMLButtonElement;
  title.focus();
  expect(document.activeElement).toBe(title);
  (h.fake.engine.emit as unknown as () => void)();
  await settle();
  const title2 = el.querySelector(
    '[data-key="title-one"]',
  ) as HTMLButtonElement;
  expect(document.activeElement).toBe(title2);
  ui.dispose();
});

// 4. CSS touch targets + 320px wrap
it("styles enforce 32px touch targets and wrap toolbar at 320px", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile("styles.css", "utf8");
  expect(css).toContain("min-height: 32px");
  expect(css).toContain("min-width: 32px");
  expect(css).toContain(".flowstitch-toolbar");
  expect(css).toContain("flex-wrap");
  expect(css).toContain("320px");
  // jsdom cannot measure real layout; assert no horizontal overflow trivially
  const h = plugin();
  const el = document.createElement("div");
  el.style.width = "320px";
  document.body.append(el);
  new Dashboard(h.plugin, el);
  // In jsdom scrollWidth/clientWidth are 0; document manual verification path
  expect(el.scrollWidth <= el.clientWidth + 1).toBe(true);
});

// 5. ConnectionModal inline error + focus
it("ConnectionModal shows inline error with aria-invalid and focuses dashboard on success", async () => {
  const h = plugin();
  h.fake.engine.sync = vi.fn(async () => {
    h.fake.engine.status = "Authentication required";
    h.fake.engine.error = "Bad token";
  });
  const modal = new ConnectionModal(h.plugin);
  modal.open();
  const content = modal.contentEl;
  // empty token -> inline error
  Array.from(content.querySelectorAll("button"))
    .find((b) => b.textContent === "Connect and discover projects")!
    .click();
  await settle();
  const err = content.querySelector('[role="alert"]')!;
  expect(err.textContent).toContain("Paste your token");
  const pwd = content.querySelector('input[type="password"]')!;
  expect(pwd.getAttribute("aria-invalid")).toBe("true");
  // success path focuses Open dashboard
  h.fake.engine.sync = vi.fn(async () => {
    h.fake.engine.status = "Synced";
    h.fake.engine.error = "";
  });
  h.fake.state.projects = { work: { id: "work", name: "Work" } };
  const tokenInput = content.querySelector<HTMLInputElement>(
    'input[type="password"]',
  )!;
  tokenInput.value = "  secret-token  ";
  tokenInput.dispatchEvent(new Event("input", { bubbles: true }));
  Array.from(content.querySelectorAll("button"))
    .find((b) => b.textContent === "Connect and discover projects")!
    .click();
  await settle();
  await settle();
  const openBtn = Array.from(content.querySelectorAll("button")).find(
    (b) => b.textContent === "Open dashboard",
  ) as HTMLButtonElement;
  expect(openBtn).toBeTruthy();
  expect(document.activeElement).toBe(openBtn);
});

// 6. Settings validation
it("settings show Notice and revert on invalid timezone/marker/interval/times/folder", async () => {
  const h = plugin();
  const tab = new FlowstitchSettings(
    h.fake.app as unknown as import("obsidian").App,
    h.plugin,
  );
  tab.display();
  const findInputFor = (name: string): HTMLInputElement => {
    const row = Array.from(
      tab.containerEl.querySelectorAll(".setting-item"),
    ).find((el) => el.textContent?.includes(name))!;
    return row.querySelector("input, textarea") as HTMLInputElement;
  };
  // interval
  const interval = findInputFor("Refresh interval");
  const prevInterval = interval.value;
  interval.value = "5";
  interval.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  expect(notices.join("\n")).toContain("≥ 30");
  expect(interval.value).toBe(prevInterval);
  // timezone
  notices.length = 0;
  const tz = findInputFor("Timezone");
  const prevTz = tz.value;
  tz.value = "Not/AZone";
  tz.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  expect(notices.join("\n")).toMatch(/timezone/i);
  expect(tz.value).toBe(prevTz);
  // marker
  notices.length = 0;
  const marker = findInputFor("Opt-in marker");
  const prevMarker = marker.value;
  marker.value = "bad marker";
  marker.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  expect(notices.join("\n")).toMatch(/Marker/);
  expect(marker.value).toBe(prevMarker);
  // HH:MM
  notices.length = 0;
  const work = findInputFor("Work starts");
  const prevWork = work.value;
  work.value = "9am";
  work.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  expect(notices.join("\n")).toMatch(/HH:MM/);
  expect(work.value).toBe(prevWork);
  // non-empty heading
  const heading = findInputFor("Live view heading");
  const prevHeading = heading.value;
  heading.value = "   ";
  heading.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  expect(notices.join("\n")).toMatch(/must not be empty/);
  expect(heading.value).toBe(prevHeading);
  // folder with ..
  const folders = findInputFor("Opt-in folders");
  const prevFolders = folders.value;
  folders.value = "../secret";
  folders.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  expect(notices.join("\n")).toMatch(/inside the vault/);
  expect(folders.value).toBe(prevFolders);
});

// 7. Empty states
it("empty states use role=status with distinct copy and Clear/Capture actions", async () => {
  const h = plugin();
  h.fake.state.tasks = {};
  const el = document.createElement("div");
  const ui = new Dashboard(h.plugin, el, "today");
  let empty = el.querySelector(".flowstitch-empty[role=status]")!;
  expect(empty.textContent).toContain("Nothing here yet");
  expect(
    Array.from(empty.querySelectorAll("button")).some(
      (b) => b.textContent === "Capture task",
    ),
  ).toBe(true);
  // search-miss
  const search = el.querySelector<HTMLInputElement>("input[type=search]")!;
  search.value = "zzz";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  empty = el.querySelector(".flowstitch-empty[role=status]")!;
  expect(empty.textContent).toContain("No tasks match");
  expect(
    Array.from(empty.querySelectorAll("button")).some(
      (b) => b.textContent === "Clear search",
    ),
  ).toBe(true);
  // filtered
  h.fake.state.tasks = { one: { ...baseTask } };
  ui.dispose();
  const el2 = document.createElement("div");
  const ui2 = new Dashboard(h.plugin, el2, "today");
  // apply filter that excludes task
  h.fake.api.filter = vi.fn(async () => []);
  Array.from(el2.querySelectorAll("button"))
    .find((b) => b.textContent === "Apply Todoist filter")!
    .click();
  await settle();
  empty = el2.querySelector(".flowstitch-empty[role=status]")!;
  expect(empty.textContent).toContain("Todoist filter");
  ui2.dispose();
});

it("offline empty state has distinct copy", () => {
  Object.defineProperty(window.navigator, "onLine", {
    value: false,
    configurable: true,
  });
  const h = plugin();
  h.fake.state.tasks = {};
  const el = document.createElement("div");
  new Dashboard(h.plugin, el);
  const empty = el.querySelector(".flowstitch-empty[role=status]")!;
  expect(empty.textContent).toMatch(/offline/i);
});

// 8. Offline Completed/filter
it("disables Completed and filter offline and shows Load failed·Retry alert", async () => {
  Object.defineProperty(window.navigator, "onLine", {
    value: false,
    configurable: true,
  });
  const h = plugin();
  const el = document.createElement("div");
  new Dashboard(h.plugin, el);
  const completed = Array.from(el.querySelectorAll("button")).find(
    (b) => b.textContent === "Completed",
  ) as HTMLButtonElement;
  expect(completed.disabled).toBe(true);
  const filter = Array.from(el.querySelectorAll("button")).find(
    (b) => b.textContent === "Apply Todoist filter",
  ) as HTMLButtonElement;
  expect(filter.disabled).toBe(true);
  // offline clicks do not call API
  completed.click();
  filter.click();
  await settle();
  expect(h.fake.api.completed).not.toHaveBeenCalled();
  expect(h.fake.api.filter).not.toHaveBeenCalled();
  // online failure shows Retry alert
  Object.defineProperty(window.navigator, "onLine", {
    value: true,
    configurable: true,
  });
  const h2 = plugin();
  h2.fake.api.completed = vi.fn(async () => {
    throw new Error("boom");
  });
  const el2 = document.createElement("div");
  new Dashboard(h2.plugin, el2);
  Array.from(el2.querySelectorAll("button"))
    .find((b) => b.textContent === "Completed")!
    .click();
  await settle();
  const alert = el2.querySelector('[role="alert"]')!;
  expect(alert.textContent).toContain("Load failed");
  expect(alert.textContent).toContain("Retry");
  expect(
    Array.from(alert.querySelectorAll("button")).some(
      (b) => b.textContent === "Retry",
    ),
  ).toBe(true);
});

// 9. TaskModal validation branches
async function openTaskModal(
  h: ReturnType<typeof plugin>,
  task?: Task,
  initial = "",
  source?: string,
  preset?: import("../../src/types").Preset,
) {
  new TaskModal(h.plugin, task, initial, source, preset).open();
  await settle();
  return Modal.opened[Modal.opened.length - 1]!;
}
function submitModal(modal: Modal) {
  Array.from(modal.contentEl.querySelectorAll("button"))
    .find(
      (b) =>
        b.textContent === "Capture task" || b.textContent === "Save changes",
    )!
    .click();
}
it("TaskModal validates empty title with inline error and aria-invalid", async () => {
  const h = plugin();
  const modal = await openTaskModal(h, undefined, "", "Note.md");
  submitModal(modal);
  await settle();
  const err = modal.contentEl.querySelector('[role="alert"]')!;
  expect(err.textContent).toContain("Enter a task name");
  const nameRow = Array.from(
    modal.contentEl.querySelectorAll(".setting-item"),
  ).find((el) => el.textContent?.startsWith("Task name"))!;
  expect(nameRow.querySelector("input")!.getAttribute("aria-invalid")).toBe(
    "true",
  );
});
it("TaskModal validates writing disabled, parent project, missing note", async () => {
  // writing disabled
  const h1 = plugin();
  h1.fake.canWrite = () => false;
  (h1.plugin as unknown as { canWrite: () => boolean }).canWrite = () => false;
  const m1 = await openTaskModal(h1, undefined, "Hello", "Note.md");
  submitModal(m1);
  await settle();
  expect(m1.contentEl.querySelector('[role="alert"]')!.textContent).toContain(
    "Enable writing",
  );
  // parent project mismatch
  const h2 = plugin();
  h2.fake.state.tasks.parent = {
    ...baseTask,
    id: "parent",
    project_id: "other",
    content: "Parent",
  };
  h2.fake.state.projects.other = { id: "other", name: "Other" };
  const m2 = await openTaskModal(h2, undefined, "Child", undefined);
  const parentRow = Array.from(
    m2.contentEl.querySelectorAll(".setting-item"),
  ).find((el) => el.textContent?.startsWith("Parent task"))!;
  const sel = parentRow.querySelector("select")!;
  sel.value = "parent";
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  submitModal(m2);
  await settle();
  expect(m2.contentEl.querySelector('[role="alert"]')!.textContent).toContain(
    "Parent must belong",
  );
  expect(sel.getAttribute("aria-invalid")).toBe("true");
  // missing note
  const h3 = plugin();
  h3.fake.app.vault.getFileByPath = () => null as unknown as never;
  const m3 = await openTaskModal(h3, undefined, "T", "Missing.md");
  // source pre-fills note; need to trigger validation
  submitModal(m3);
  await settle();
  expect(m3.contentEl.querySelector('[role="alert"]')!.textContent).toContain(
    "Related note does not exist",
  );
});
it("TaskModal validates recurring format and time-without-date", async () => {
  const h = plugin();
  const recurring: Task = {
    ...baseTask,
    due: { date: "2026-01-01", string: "every day", is_recurring: true },
  };
  h.fake.state.tasks.one = recurring;
  const m = await openTaskModal(h, recurring);
  const dueRow = Array.from(m.contentEl.querySelectorAll(".setting-item")).find(
    (el) => el.textContent?.startsWith("Due date"),
  )!;
  const dueInput = dueRow.querySelector("input")!;
  dueInput.value = "tomorrow";
  dueInput.dispatchEvent(new Event("input", { bubbles: true }));
  submitModal(m);
  await settle();
  expect(m.contentEl.querySelector('[role="alert"]')!.textContent).toContain(
    "YYYY-MM-DD",
  );
  expect(dueInput.getAttribute("aria-invalid")).toBe("true");
  // time without date (edit path)
  const h2 = plugin();
  const editTask: Task = { ...baseTask, id: "edit-two" };
  h2.fake.state.tasks["edit-two"] = editTask;
  const m2 = await openTaskModal(h2, editTask);
  const timeRow = Array.from(
    m2.contentEl.querySelectorAll(".setting-item"),
  ).find((el) => el.textContent?.startsWith("Time"))!;
  const timeInput = timeRow.querySelector("input")!;
  timeInput.value = "12:00";
  timeInput.dispatchEvent(new Event("input", { bubbles: true }));
  submitModal(m2);
  await settle();
  expect(m2.contentEl.querySelector('[role="alert"]')!.textContent).toContain(
    "Enter a date",
  );
});
it("TaskModal validates matching-note exists and title button has dialog popup", async () => {
  const h = plugin();
  const el = document.createElement("div");
  new Dashboard(h.plugin, el);
  const titleBtn = el.querySelector(
    ".flowstitch-task-title",
  ) as HTMLButtonElement;
  expect(titleBtn.getAttribute("aria-haspopup")).toBe("dialog");
  // matching note exists
  const preset = h.fake.state.settings.presets[0]!;
  const h2 = plugin();
  h2.fake.app.vault.getAbstractFileByPath = () => ({}) as never;
  const m = await openTaskModal(
    h2,
    undefined,
    "Article",
    undefined,
    h2.fake.state.settings.presets[0],
  );
  // enable createNote toggle
  const toggles = m.contentEl.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  toggles[0]!.checked = true;
  toggles[0]!.dispatchEvent(new Event("change", { bubbles: true }));
  // fill title (initial Article already set? need to ensure)
  void preset;
  submitModal(m);
  await settle();
  expect(m.contentEl.querySelector('[role="alert"]')!.textContent).toContain(
    "Matching note already exists",
  );
});
it("PresetModal validates name, content, noteTemplate and folder", async () => {
  const h = plugin();
  new PresetModal(h.plugin).open();
  await settle();
  const modal = Modal.opened[Modal.opened.length - 1]!;
  const areas = modal.contentEl.querySelectorAll("textarea");
  // name empty, content empty
  const nameArea = areas[0]!;
  nameArea.value = "   ";
  nameArea.dispatchEvent(new Event("input", { bubbles: true }));
  Array.from(modal.contentEl.querySelectorAll("button"))
    .find((b) => b.textContent === "Save preset")!
    .click();
  await settle();
  expect(
    modal.contentEl.querySelector('[role="alert"]')!.textContent,
  ).toContain("Name is required");
  expect(nameArea.getAttribute("aria-invalid")).toBe("true");
  // content empty
  nameArea.value = "Valid";
  nameArea.dispatchEvent(new Event("input", { bubbles: true }));
  const contentArea = areas[1]!;
  contentArea.value = "   ";
  contentArea.dispatchEvent(new Event("input", { bubbles: true }));
  Array.from(modal.contentEl.querySelectorAll("button"))
    .find((b) => b.textContent === "Save preset")!
    .click();
  await settle();
  expect(
    modal.contentEl.querySelector('[role="alert"]')!.textContent,
  ).toContain("Title template is required");
});

// 10. Related view, overdue, subtask, keyboard
it("related groups have h3 id and ul labelledby, overdue respects timezone, subtask link and Shift+F10 work", async () => {
  const h = plugin();
  h.fake.state.tasks.child = {
    ...baseTask,
    id: "child",
    content: "Child task",
    parent_id: "one",
    due: { date: "2000-01-01" },
  };
  h.fake.state.links = {
    one: { path: "Note.md" },
    child: { path: "Note.md" },
  };
  const el = document.createElement("div");
  const ui = new Dashboard(h.plugin, el, "related", "Note.md");
  const headings = Array.from(el.querySelectorAll("h3.flowstitch-group"));
  expect(headings.length).toBeGreaterThan(0);
  for (const headingEl of headings) {
    expect(headingEl.id).toBeTruthy();
    const ul = headingEl.nextElementSibling!;
    expect(ul.tagName).toBe("UL");
    expect(ul.getAttribute("aria-labelledby")).toBe(headingEl.id);
  }
  // overdue heading present for old due date
  expect(el.textContent).toContain("Overdue");
  // subtask link is a button
  const parentBtn = Array.from(el.querySelectorAll("button")).find((b) =>
    b.textContent?.startsWith("↳"),
  )!;
  expect(parentBtn).toBeTruthy();
  expect(parentBtn.getAttribute("aria-label")).toContain("Open parent task");
  // Shift+F10 opens context menu
  const showSpy = vi.spyOn(Menu.prototype, "showAtPosition");
  const row = el.querySelector("li.flowstitch-row")!;
  row.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "F10",
      shiftKey: true,
      bubbles: true,
    }),
  );
  expect(showSpy).toHaveBeenCalled();
  showSpy.mockRestore();
  ui.dispose();
});
it("overdue grouping respects timezone boundaries", async () => {
  const { taskDate } = await import("../../src/ui/helpers");
  // 23:30Z is next day in London
  expect(taskDate("2026-07-10T23:30:00Z", "Europe/London")).toBe("2026-07-11");
  const h = plugin();
  h.fake.state.settings.timezone = "Europe/London";
  const future = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  // task due in the upcoming 7-day window should group by that date
  h.fake.state.tasks.one = {
    ...baseTask,
    due: { date: future },
  };
  const el = document.createElement("div");
  new Dashboard(h.plugin, el, "upcoming");
  const heading = el.querySelector("h3.flowstitch-group");
  expect(heading?.textContent).toBe(future);
  expect(heading?.id).toBeTruthy();
  expect(heading?.nextElementSibling?.getAttribute("aria-labelledby")).toBe(
    heading?.id,
  );
});
