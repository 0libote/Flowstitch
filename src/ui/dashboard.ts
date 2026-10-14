import {
  ItemView,
  MarkdownRenderChild,
  Menu,
  type WorkspaceLeaf,
} from "obsidian";
import type Flowstitch from "../main";
import { type Task, fields, uuid } from "../types";
import { TaskModal, PresetModal, TextModal } from "./modals";
import {
  button,
  dateKey,
  taskDate,
  formatDue,
  tomorrow,
  truncateDisplay,
  truncateUi,
  isValidAnchor,
} from "./helpers";
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
  private searchTimer = 0;
  private historyError = "";
  private filterError = "";
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
    window.clearTimeout(this.searchTimer);
    this.unsubscribe();
  }
  private async activateTab(tab: DashboardTab, focus = true): Promise<void> {
    this.tab = tab;
    this.filtered = null;
    this.historyError = "";
    this.filterError = "";
    if (tab === "completed") {
      try {
        await this.loadHistory();
      } catch (error) {
        this.historyError =
          error instanceof Error ? error.message : "Load failed";
      }
    }
    this.render();
    if (focus) {
      const btn = this.el.querySelector(
        `#flowstitch-tab-${tab}`,
      ) as HTMLButtonElement | null;
      btn?.focus();
    }
  }
  render(): void {
    if (this.disposed) return;
    const focus = this.el.ownerDocument.activeElement as HTMLElement | null;
    const searchFocused =
      focus instanceof HTMLInputElement &&
      focus.classList.contains("flowstitch-search");
    const position = searchFocused ? focus.selectionStart : null;
    const focusKey = focus?.dataset?.key ?? null;
    const focusId = focus?.id ?? null;
    const offlineEarly = typeof navigator !== "undefined" && !navigator.onLine;
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
    const captureBtn = button(
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
    );
    captureBtn.disabled = !this.plugin.canWrite();
    captureBtn.dataset.key = "capture";
    const refreshBtn = button(actions, "Refresh", async () => {
      if (this.tab === "completed") {
        try {
          await this.loadHistory();
          this.historyError = "";
        } catch (error) {
          this.historyError =
            error instanceof Error ? error.message : "Load failed";
        }
        this.render();
      } else await this.plugin.engine.sync(true);
    });
    refreshBtn.dataset.key = "refresh";
    if (this.tab === "completed" && offlineEarly) {
      refreshBtn.disabled = true;
      refreshBtn.title = "Unavailable offline";
    }
    const diagBtn = button(actions, "Diagnostics", () => this.diagnostics());
    diagBtn.dataset.key = "diagnostics";
    const status = this.el.createEl("output", {
      cls: "flowstitch-status",
      attr: { "aria-live": "polite", "aria-atomic": "true" },
    });
    status.createSpan({ text: this.plugin.engine.status });
    status.createSpan({
      text: `${this.plugin.state.queue.length} pending · ${Object.keys(this.plugin.state.conflicts).length} conflicts`,
    });
    if (this.plugin.engine.error || this.plugin.competing.length) {
      const alert = this.el.createDiv({
        cls: "flowstitch-alert",
        attr: { role: "alert" },
      });
      if (this.plugin.engine.error)
        alert.createSpan({ text: this.plugin.engine.error });
      if (this.plugin.competing.length)
        alert.createSpan({
          text: `Other integrations detected: ${this.plugin.competing.join(", ")}. Use read-only or explicitly scoped mode.`,
        });
    }
    const offline = offlineEarly;
    const nav = this.el.createDiv({
      cls: "flowstitch-tabs",
      attr: { role: "tablist", "aria-label": "Task views" },
    });
    const tabOrder = [
      "today",
      "upcoming",
      "projects",
      "inbox",
      "templates",
      "completed",
    ] as const;
    for (const tab of tabOrder) {
      const isActive = this.tab === tab;
      const b = button(
        nav,
        tab[0]!.toUpperCase() + tab.slice(1),
        () => this.activateTab(tab, false),
        isActive ? "is-active" : "",
      );
      b.setAttribute("role", "tab");
      b.setAttribute("id", `flowstitch-tab-${tab}`);
      b.setAttribute("aria-selected", String(isActive));
      b.setAttribute("aria-controls", "flowstitch-panel");
      b.tabIndex = isActive ? 0 : -1;
      if (tab === "completed" && offline) {
        b.disabled = true;
        b.setAttribute("aria-disabled", "true");
        b.title = "Unavailable offline";
      }
      b.addEventListener("keydown", (e) => {
        if (
          e.key === "ArrowRight" ||
          e.key === "ArrowLeft" ||
          e.key === "Home" ||
          e.key === "End"
        ) {
          e.preventDefault();
          const order = Array.from(tabOrder);
          const at = order.indexOf(tab as (typeof tabOrder)[number]);
          let next: number;
          if (e.key === "Home") next = 0;
          else if (e.key === "End") next = order.length - 1;
          else
            next =
              (at + (e.key === "ArrowRight" ? 1 : -1) + order.length) %
              order.length;
          const nextTab = order[next]!;
          if (
            nextTab === "completed" &&
            typeof navigator !== "undefined" &&
            !navigator.onLine
          ) {
            return;
          }
          void this.activateTab(nextTab as DashboardTab, true);
        }
      });
    }
    if (
      !this.plugin.app.secretStorage.getSecret(
        this.plugin.state.settings.secretName,
      )
    ) {
      const empty = this.el.createDiv({
        cls: "flowstitch-empty",
        attr: { role: "status" },
      });
      empty.createEl("h3", { text: "Bring your day into focus" });
      empty.createEl("p", {
        text: "Connect Todoist to see your existing projects and tasks here.",
      });
      button(empty, "Connect Todoist", () => this.plugin.connect(), "mod-cta");
      this.restoreFocus(focusKey, focusId, false, null);
      return;
    }
    if (this.tab === "templates") {
      this.renderTemplates();
      this.restoreFocus(focusKey, focusId, false, null);
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
    (search as HTMLInputElement).dataset.key = "search";
    search.addEventListener("input", () => {
      const value = (search as HTMLInputElement).value;
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        this.search = value;
        this.render();
      }, 200);
    });
    if (searchFocused) {
      search.focus();
      if (position !== null)
        (search as HTMLInputElement).setSelectionRange(position, position);
    }
    const project = tools.createEl("select", {
      attr: { "aria-label": "Filter project" },
    });
    project.createEl("option", { text: "All projects", attr: { value: "" } });
    for (const p of Object.values(this.plugin.state.projects))
      project.createEl("option", {
        text: truncateDisplay(p.name, 70),
        attr: { value: p.id },
      });
    (project as HTMLSelectElement).value = this.project;
    project.addEventListener("change", () => {
      this.project = (project as HTMLSelectElement).value;
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
        section.createEl("option", {
          text: truncateDisplay(s.name, 70),
          attr: { value: s.id },
        });
      (section as HTMLSelectElement).value = this.section;
      section.addEventListener("change", () => {
        this.section = (section as HTMLSelectElement).value;
        this.render();
      });
    }
    const filterBtn = button(tools, "Apply Todoist filter", async () => {
      try {
        this.filterError = "";
        this.filtered = new Set(
          (await this.plugin.api.filter(this.plugin.state.settings.filter)).map(
            (t) => t.id,
          ),
        );
      } catch (error) {
        this.filterError =
          error instanceof Error ? error.message : "Load failed";
      }
      this.render();
    });
    filterBtn.dataset.key = "apply-filter";
    if (offline) {
      filterBtn.disabled = true;
      filterBtn.title = "Unavailable offline";
    }
    if (this.filtered)
      button(tools, "Clear filter", () => {
        this.filtered = null;
        this.filterError = "";
        this.render();
      });
    if (this.historyError || this.filterError) {
      const loadAlert = this.el.createDiv({
        cls: "flowstitch-alert",
        attr: { role: "alert" },
      });
      loadAlert.createSpan({
        text: `Load failed·${this.historyError || this.filterError}·Retry`,
      });
      button(loadAlert, "Retry", async () => {
        try {
          if (this.tab === "completed") {
            await this.loadHistory();
            this.historyError = "";
          } else {
            this.filtered = new Set(
              (
                await this.plugin.api.filter(this.plugin.state.settings.filter)
              ).map((t) => t.id),
            );
            this.filterError = "";
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Load failed";
          if (this.tab === "completed") this.historyError = message;
          else this.filterError = message;
        }
        this.render();
      });
    }
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
      attr: {
        id: "flowstitch-panel",
        role: "tabpanel",
        "aria-labelledby": `flowstitch-tab-${this.tab}`,
        tabindex: "0",
      },
    });
    if (!tasks.length) {
      const empty = list.createDiv({
        cls: "flowstitch-empty",
        attr: { role: "status" },
      });
      if (offline) {
        empty.createEl("p", {
          text: "You’re offline. No cached tasks match this view. Reconnect to load history.",
        });
      } else if (this.search) {
        empty.createEl("p", {
          text: `No tasks match “${this.search}”. Try a different search or clear it.`,
        });
        button(empty, "Clear search", () => {
          this.search = "";
          this.render();
        });
        button(
          empty,
          "Capture task",
          () =>
            new TaskModal(
              this.plugin,
              undefined,
              "",
              this.source || undefined,
            ).open(),
          "mod-cta",
        );
      } else if (this.filtered) {
        empty.createEl("p", {
          text: "No tasks match the current Todoist filter. Clear the filter or capture a task.",
        });
        button(empty, "Clear filter", () => {
          this.filtered = null;
          this.render();
        });
        button(
          empty,
          "Capture task",
          () =>
            new TaskModal(
              this.plugin,
              undefined,
              "",
              this.source || undefined,
            ).open(),
          "mod-cta",
        );
      } else if (this.tab === "completed") {
        empty.createEl("p", {
          text: "No completed tasks loaded. Refresh history when connected.",
        });
      } else {
        empty.createEl("p", {
          text: "Nothing here yet. Change the project or filter, or capture a task.",
        });
        button(
          empty,
          "Capture task",
          () =>
            new TaskModal(
              this.plugin,
              undefined,
              "",
              this.source || undefined,
            ).open(),
          "mod-cta",
        );
      }
      this.restoreFocus(focusKey, focusId, searchFocused, position);
      return;
    }
    let group = "";
    let groupList: HTMLElement | undefined;
    let groupIndex = 0;
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
      if (!groupList || heading !== group) {
        group = heading;
        groupIndex += 1;
        const headingId = `flowstitch-group-${groupIndex}`;
        list.createEl("h3", {
          text: heading,
          cls: "flowstitch-group",
          attr: { id: headingId },
        });
        groupList = list.createEl("ul", {
          cls: "flowstitch-task-list",
          attr: { "aria-labelledby": headingId },
        });
      }
      this.row(groupList, task);
    }
    this.restoreFocus(focusKey, focusId, searchFocused, position);
  }
  private restoreFocus(
    focusKey: string | null,
    focusId: string | null,
    searchFocused: boolean,
    position: number | null,
  ): void {
    if (focusKey) {
      const next = this.el.querySelector(
        `[data-key="${focusKey}"]`,
      ) as HTMLElement | null;
      if (next) {
        next.focus();
        if (
          searchFocused &&
          next instanceof HTMLInputElement &&
          position !== null
        ) {
          try {
            next.setSelectionRange(position, position);
          } catch {
            /* jsdom may not support selection */
          }
        }
        return;
      }
    }
    if (focusId?.startsWith("flowstitch-tab-")) {
      const tabBtn = this.el.querySelector(`#${focusId}`) as HTMLElement | null;
      tabBtn?.focus();
      return;
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
    const row = parent.createEl("li", {
      cls: `flowstitch-row priority-${task.priority}`,
    });
    row.dataset.key = `row-${task.id}`;
    const check = row.createEl("input", {
      attr: {
        type: "checkbox",
        "aria-label": truncateUi(
          `${task.checked ? "Reopen" : "Complete"} ${task.content}`,
          80,
        ),
      },
    }) as HTMLInputElement;
    check.checked = task.checked;
    (check as HTMLInputElement).dataset.key = `check-${task.id}`;
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
    title.dataset.key = `title-${task.id}`;
    title.setAttribute("aria-haspopup", "dialog");
    const meta = body.createDiv({ cls: "flowstitch-task-meta" });
    if (task.due)
      meta.createSpan({
        text:
          formatDue(task.due.date, this.plugin.state.settings.timezone) +
          (task.due.is_recurring ? " ↻" : ""),
      });
    meta.createSpan({
      text: truncateDisplay(
        this.plugin.state.projects[task.project_id]?.name ?? "Project",
        70,
      ),
    });
    if (task.parent_id) {
      const parentTitle =
        this.plugin.state.tasks[task.parent_id]?.content ?? "Subtask";
      const parentBtn = button(
        meta,
        `↳ ${truncateDisplay(parentTitle, 70)}`,
        () => {
          const parentTask = this.plugin.state.tasks[task.parent_id!];
          if (parentTask) new TaskModal(this.plugin, parentTask).open();
        },
        "flowstitch-parent-link",
      );
      parentBtn.dataset.key = `parent-${task.id}`;
      parentBtn.setAttribute("aria-label", `Open parent task ${parentTitle}`);
    }
    if (task.labels.length)
      meta.createSpan({ text: task.labels.map((l) => "#" + l).join(" ") });
    const links = row.createDiv({ cls: "flowstitch-row-actions" });
    const note = this.plugin.state.links[task.id];
    if (note) {
      const anchor =
        note.anchor && isValidAnchor(note.anchor) ? `#${note.anchor}` : "";
      const noteBtn = button(links, "Note", () =>
        this.plugin.app.workspace.openLinkText(note.path + anchor, this.source),
      );
      noteBtn.dataset.key = `note-${task.id}`;
    }
    const openBtn = button(links, "↗", () => {
      window.open(
        `https://app.todoist.com/app/task/${encodeURIComponent(task.id)}`,
        "_blank",
        "noopener,noreferrer",
      );
    });
    openBtn.setAttribute("aria-label", "Open in Todoist");
    openBtn.dataset.key = `open-${task.id}`;
    const moreBtn = button(links, "⋯", () => this.menu(task, row));
    moreBtn.setAttribute("aria-label", "Task actions");
    moreBtn.setAttribute("aria-haspopup", "menu");
    moreBtn.dataset.key = `more-${task.id}`;
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.menu(task, row, e);
    });
    row.addEventListener("keydown", (e) => {
      if (
        e.key === "ContextMenu" ||
        (e.shiftKey && e.key === "F10") ||
        (e.key === "Enter" && (e.target as HTMLElement) === row)
      ) {
        e.preventDefault();
        this.menu(task, row);
      }
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
    const list = this.el.createDiv({
      cls: "flowstitch-presets",
      attr: {
        id: "flowstitch-panel",
        role: "tabpanel",
        "aria-labelledby": "flowstitch-tab-templates",
        tabindex: "0",
      },
    });
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
