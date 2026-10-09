import {
  ItemView,
  MarkdownRenderChild,
  Menu,
  type WorkspaceLeaf,
} from "obsidian";
import type Flowstitch from "../main";
import { type Task, fields, uuid } from "../types";
import { TaskModal, PresetModal, TextModal } from "./modals";
import { button, dateKey, taskDate, formatDue, tomorrow } from "./helpers";
export type DashboardTab =
  | "today"
  | "upcoming"
  | "projects"
  | "inbox"
  | "templates"
  | "completed"
  | "related";
export const VIEW = "flowstitch-dashboard";
export class Dashboard {
  private tab: DashboardTab;
  private search = "";
  private project = "";
  private section = "";
  private filtered: Set<string> | null = null;
  private history: Task[] = [];
  private showArchived = false;
  private unsubscribe: () => void;
  private disposed = false;
  constructor(
    private plugin: Flowstitch,
    private el: HTMLElement,
    tab: DashboardTab = "today",
    private source = "",
  ) {
    this.tab = tab;
    this.unsubscribe = plugin.engine.subscribe(() => this.render());
    this.render();
  }
  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
  }
  render(): void {
    if (this.disposed) return;
    const focus = this.el.ownerDocument.activeElement;
    const searchFocused =
      focus instanceof HTMLInputElement &&
      focus.classList.contains("flowstitch-search");
    const position = searchFocused ? focus.selectionStart : null;
    this.el.empty();
    this.el.addClass("flowstitch");
    const header = this.el.createDiv({ cls: "flowstitch-header" });
    const brand = header.createDiv();
    brand.createEl("h2", { text: "Flowstitch" });
    brand.createEl("p", {
      text: "Your notes and tasks, seamlessly connected.",
      cls: "flowstitch-muted",
    });
    const actions = header.createDiv({ cls: "flowstitch-actions" });
    button(
      actions,
      "+ Capture",
      () =>
        new TaskModal(
          this.plugin,
          undefined,
          "",
          this.source || undefined,
        ).open(),
      "mod-cta",
    ).disabled = !this.plugin.canWrite();
    button(actions, "Refresh", async () => {
      if (this.tab === "completed") {
        await this.loadHistory();
        this.render();
      } else await this.plugin.engine.sync(true);
    });
    button(actions, "Diagnostics", () => this.diagnostics());
    const status = this.el.createDiv({
      cls: "flowstitch-status",
      attr: { role: "status", "aria-live": "polite" },
    });
    status.createSpan({ text: this.plugin.engine.status });
    status.createSpan({
      text: `${this.plugin.state.queue.length} pending · ${Object.keys(this.plugin.state.conflicts).length} conflicts`,
    });
    if (this.plugin.engine.error)
      status.createSpan({ text: this.plugin.engine.error });
    if (this.plugin.competing.length)
      status.createSpan({
        text: `Other integrations detected: ${this.plugin.competing.join(", ")}. Use read-only or explicitly scoped mode.`,
      });
    const nav = this.el.createDiv({
      cls: "flowstitch-tabs",
      attr: { role: "tablist", "aria-label": "Task views" },
    });
    for (const tab of [
      "today",
      "upcoming",
      "projects",
      "inbox",
      "templates",
      "completed",
    ] as const) {
      const b = button(
        nav,
        tab[0]!.toUpperCase() + tab.slice(1),
        async () => {
          this.tab = tab;
          this.filtered = null;
          if (tab === "completed") await this.loadHistory();
          this.render();
        },
        this.tab === tab ? "is-active" : "",
      );
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(this.tab === tab));
      b.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const buttons = Array.from(nav.querySelectorAll("button"));
          const at = buttons.indexOf(b);
          buttons[
            (at + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) %
              buttons.length
          ]?.focus();
        }
      });
    }
    if (
      !this.plugin.app.secretStorage.getSecret(
        this.plugin.state.settings.secretName,
      )
    ) {
      const empty = this.el.createDiv({ cls: "flowstitch-empty" });
      empty.createEl("h3", { text: "Bring your day into focus" });
      empty.createEl("p", {
        text: "Connect Todoist to see your existing projects and tasks here.",
      });
      button(empty, "Connect Todoist", () => this.plugin.connect(), "mod-cta");
      return;
    }
    if (this.tab === "templates") {
      this.renderTemplates();
      return;
    }
    const tools = this.el.createDiv({ cls: "flowstitch-toolbar" });
    const search = tools.createEl("input", {
      cls: "flowstitch-search",
      attr: {
        type: "search",
        placeholder: "Search cached tasks…",
        "aria-label": "Search tasks",
      },
    });
    search.value = this.search;
    search.addEventListener("input", () => {
      this.search = search.value;
      this.render();
    });
    if (searchFocused) {
      search.focus();
      if (position !== null) search.setSelectionRange(position, position);
    }
    const project = tools.createEl("select", {
      attr: { "aria-label": "Filter project" },
    });
    project.createEl("option", { text: "All projects", attr: { value: "" } });
    for (const p of Object.values(this.plugin.state.projects))
      project.createEl("option", { text: p.name, attr: { value: p.id } });
    project.value = this.project;
    project.addEventListener("change", () => {
      this.project = project.value;
      this.section = "";
      this.render();
    });
    if (this.tab === "projects") {
      const section = tools.createEl("select", {
        attr: { "aria-label": "Filter section" },
      });
      section.createEl("option", { text: "All sections", attr: { value: "" } });
      for (const s of Object.values(this.plugin.state.sections).filter(
        (s) => !this.project || s.project_id === this.project,
      ))
        section.createEl("option", { text: s.name, attr: { value: s.id } });
      section.value = this.section;
      section.addEventListener("change", () => {
        this.section = section.value;
        this.render();
      });
    }
    button(tools, "Apply Todoist filter", async () => {
      this.filtered = new Set(
        (await this.plugin.api.filter(this.plugin.state.settings.filter)).map(
          (t) => t.id,
        ),
      );
      this.render();
    });
    if (this.filtered)
      button(tools, "Clear filter", () => {
        this.filtered = null;
        this.render();
      });
    const tasks = this.selectTasks();
    const summary = this.el.createDiv({ cls: "flowstitch-summary" });
    summary.createSpan({
      text: `${tasks.length} task${tasks.length === 1 ? "" : "s"}`,
    });
    if (this.tab === "today")
      summary.createSpan({
        text: `Work ${this.plugin.state.settings.workStart}–${this.plugin.state.settings.workEnd} · Lunch ${this.plugin.state.settings.lunchStart}–${this.plugin.state.settings.lunchEnd}`,
      });
    const list = this.el.createDiv({
      cls: "flowstitch-list",
      attr: { role: "list" },
    });
    if (!tasks.length) {
      list.createDiv({
        cls: "flowstitch-empty",
        text:
          this.tab === "completed"
            ? "No completed tasks loaded. Refresh history when connected."
            : "Nothing here yet. Change the project or filter, or capture a task.",
      });
      return;
    }
    let group = "";
    for (const task of tasks) {
      const heading =
        this.tab === "upcoming"
          ? taskDate(task.due?.date ?? "", this.plugin.state.settings.timezone)
          : this.tab === "projects"
            ? (this.plugin.state.projects[task.project_id]?.name ?? "Project") +
              (task.section_id
                ? " / " +
                  (this.plugin.state.sections[task.section_id]?.name ??
                    "Section")
                : "")
            : task.due &&
                taskDate(task.due.date, this.plugin.state.settings.timezone) <
                  dateKey(new Date(), this.plugin.state.settings.timezone)
              ? "Overdue"
              : "Tasks";
      if (heading !== group) {
        group = heading;
        list.createEl("h3", { text: heading, cls: "flowstitch-group" });
      }
      this.row(list, task);
    }
  }
  private selectTasks(): Task[] {
    const zone = this.plugin.state.settings.timezone;
    const today = dateKey(new Date(), zone);
    const end = dateKey(new Date(Date.now() + 7 * 86400000), zone);
    return (
      this.tab === "completed"
        ? this.history
        : Object.values(this.plugin.state.tasks)
    )
      .filter(
        (t) =>
          !t.is_deleted &&
          (this.tab === "completed" || !t.checked) &&
          (!this.project || t.project_id === this.project) &&
          (!this.section || t.section_id === this.section) &&
          (!this.filtered || this.filtered.has(t.id)) &&
          t.content.toLowerCase().includes(this.search.toLowerCase()),
      )
      .filter((t) => {
        const date = t.due ? taskDate(t.due.date, zone) : null;
        switch (this.tab) {
          case "today":
            return !!date && date <= today;
          case "upcoming":
            return !!date && date > today && date <= end;
          case "inbox":
            return !date;
          case "related":
            return (
              this.plugin.state.links[t.id]?.path === this.source ||
              (!!this.plugin.contextProject(this.source) &&
                t.project_id === this.plugin.contextProject(this.source))
            );
          default:
            return true;
        }
      })
      .sort(
        (a, b) =>
          (a.due?.date ?? "z").localeCompare(b.due?.date ?? "z") ||
          b.priority - a.priority ||
          a.content.localeCompare(b.content),
      );
  }
  private row(parent: HTMLElement, task: Task): void {
    const row = parent.createDiv({
      cls: `flowstitch-row priority-${task.priority}`,
      attr: { role: "listitem" },
    });
    const check = row.createEl("input", {
      attr: {
        type: "checkbox",
        "aria-label": `${task.checked ? "Reopen" : "Complete"} ${task.content}`,
      },
    });
    check.checked = task.checked;
    check.disabled =
      !this.plugin.canWrite() ||
      this.plugin.state.queue.some((o) => o.target === task.id) ||
      (this.tab === "completed" && !!task.due?.is_recurring);
    check.addEventListener("change", () => {
      check.disabled = true;
      void this.plugin.engine
        .edit(task, { ...fields(task), checked: check.checked })
        .then(() => this.plugin.engine.sync(true))
        .catch(() => {
          check.checked = task.checked;
          check.disabled = false;
        });
    });
    const body = row.createDiv({ cls: "flowstitch-task-body" });
    const title = button(
      body,
      task.content,
      () => new TaskModal(this.plugin, task).open(),
      "flowstitch-task-title",
    );
    title.disabled = !this.plugin.canWrite();
    const meta = body.createDiv({ cls: "flowstitch-task-meta" });
    if (task.due)
      meta.createSpan({
        text:
          formatDue(task.due.date, this.plugin.state.settings.timezone) +
          (task.due.is_recurring ? " ↻" : ""),
      });
    meta.createSpan({
      text: this.plugin.state.projects[task.project_id]?.name ?? "Project",
    });
    if (task.parent_id)
      meta.createSpan({
        text:
          "↳ " +
          (this.plugin.state.tasks[task.parent_id]?.content ?? "Subtask"),
      });
    if (task.labels.length)
      meta.createSpan({ text: task.labels.map((l) => "#" + l).join(" ") });
    const links = row.createDiv({ cls: "flowstitch-row-actions" });
    const note = this.plugin.state.links[task.id];
    if (note)
      button(links, "Note", () =>
        this.plugin.app.workspace.openLinkText(
          note.path + (note.anchor ? "#" + note.anchor : ""),
          this.source,
        ),
      );
    button(links, "↗", () => {
      window.open(
        `https://app.todoist.com/app/task/${encodeURIComponent(task.id)}`,
      );
    }).setAttribute("aria-label", "Open in Todoist");
    button(links, "⋯", () => this.menu(task, row)).setAttribute(
      "aria-label",
      "Task actions",
    );
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.menu(task, row, e);
    });
  }
  private menu(task: Task, row: HTMLElement, event?: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((i) =>
      i
        .setTitle("Edit task")
        .setIcon("pencil")
        .setDisabled(!this.plugin.canWrite())
        .onClick(() => new TaskModal(this.plugin, task).open()),
    );
    menu.addItem((i) =>
      i
        .setTitle("Reschedule to tomorrow")
        .setIcon("calendar")
        .setDisabled(!this.plugin.canWrite())
        .onClick(() => {
          void this.plugin.reschedule(
            task,
            tomorrow(this.plugin.state.settings.timezone),
          );
        }),
    );
    menu.addItem((i) =>
      i
        .setTitle("Remove due date")
        .setIcon("calendar-x")
        .setDisabled(!this.plugin.canWrite() || !!task.due?.is_recurring)
        .onClick(() => {
          void this.plugin.engine
            .edit(task, { ...fields(task), due: null })
            .then(() => this.plugin.engine.sync(true));
        }),
    );
    menu.addItem((i) =>
      i
        .setTitle("Attach current note")
        .setIcon("link")
        .setDisabled(!this.plugin.canWrite())
        .onClick(() => {
          void this.plugin.attach(task);
        }),
    );
    if (event) menu.showAtMouseEvent(event);
    else {
      const rect = row.getBoundingClientRect();
      menu.showAtPosition({ x: rect.right, y: rect.bottom });
    }
  }
  private renderTemplates(): void {
    const list = this.el.createDiv({ cls: "flowstitch-presets" });
    button(list, "New preset", () => new PresetModal(this.plugin).open());
    button(list, this.showArchived ? "Hide archived" : "Show archived", () => {
      this.showArchived = !this.showArchived;
      this.render();
    });
    for (const preset of this.plugin.state.settings.presets.filter(
      (p) => this.showArchived || !p.archived,
    )) {
      const row = list.createDiv({ cls: "flowstitch-preset" });
      row.createEl("h3", {
        text: preset.name + (preset.archived ? " · archived" : ""),
      });
      row.createEl("p", {
        text:
          preset.description.replace(/\{\{\w+\}\}/g, "").trim() ||
          "Reusable task preset · master stays unchanged",
        cls: "flowstitch-muted",
      });
      const actions = row.createDiv({ cls: "flowstitch-actions" });
      button(
        actions,
        "Launch",
        () =>
          new TaskModal(this.plugin, undefined, "", undefined, preset).open(),
        "mod-cta",
      ).disabled = !this.plugin.canWrite();
      button(actions, "Edit", () =>
        new PresetModal(this.plugin, preset).open(),
      );
      button(actions, "Duplicate", async () => {
        this.plugin.state.settings.presets.push({
          ...structuredClone(preset),
          id: uuid(),
          name: preset.name + " copy",
        });
        await this.plugin.save();
        this.render();
      });
    }
    button(list, "Export presets", () =>
      new TextModal(
        this.plugin.app,
        "Portable presets",
        JSON.stringify(this.plugin.state.settings.presets, null, 2),
      ).open(),
    );
  }
  private async loadHistory(): Promise<void> {
    const until = new Date();
    const since = new Date(until.getTime() - 7 * 86400000);
    this.history = await this.plugin.api.completed(
      since.toISOString(),
      until.toISOString(),
    );
    // Keep ordinary archived identities so an explicit reopen can be queued even
    // when this installation never saw the task while it was active.
    for (const task of this.history)
      if (!task.due?.is_recurring && !this.plugin.state.tasks[task.id])
        this.plugin.state.tasks[task.id] = task;
    await this.plugin.save();
  }
  private diagnostics(): void {
    this.plugin.diagnostics();
  }
}
export class DashboardView extends ItemView {
  private dashboard?: Dashboard;
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: Flowstitch,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return VIEW;
  }
  getDisplayText(): string {
    return "Flowstitch";
  }
  getIcon(): string {
    return "flowstitch";
  }
  async onOpen(): Promise<void> {
    this.dashboard = new Dashboard(this.plugin, this.contentEl);
  }
  async onClose(): Promise<void> {
    this.dashboard?.dispose();
  }
}
export class DashboardBlock extends MarkdownRenderChild {
  private dashboard?: Dashboard;
  constructor(
    el: HTMLElement,
    private plugin: Flowstitch,
    private tab: DashboardTab,
    private source: string,
  ) {
    super(el);
  }
  onload(): void {
    this.dashboard = new Dashboard(
      this.plugin,
      this.containerEl,
      this.tab,
      this.source,
    );
  }
  onunload(): void {
    this.dashboard?.dispose();
  }
}
