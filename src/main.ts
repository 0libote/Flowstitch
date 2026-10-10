import {
  Plugin,
  PluginSettingTab,
  Setting,
  SecretComponent,
  Notice,
  MarkdownView,
  TFile,
  Modal,
  addIcon,
  requestUrl,
  normalizePath,
  moment,
  type Editor,
  type App,
  type SettingDefinitionGroup,
  type SettingDefinitionRender,
} from "obsidian";
import { TodoistClient } from "./api/client";
import { SyncEngine } from "./sync/engine";
import { initialState, type State, type Task, fields } from "./types";
import {
  DashboardView,
  DashboardBlock,
  VIEW,
  type DashboardTab,
} from "./ui/dashboard";
import { ConnectionModal, TaskModal, TextModal } from "./ui/modals";
import { button, dateKey } from "./ui/helpers";
import { rescheduleDue, zonedDateTime } from "./notes/dates";
import { insertDaily, uri } from "./notes/markdown";
export default class Flowstitch extends Plugin {
  state: State = initialState();
  api!: TodoistClient;
  engine!: SyncEngine;
  competing: string[] = [];
  private saving: Promise<void> = Promise.resolve();
  private index = new Set<string>();
  private timer = 0;
  private debounce = 0;
  private alive = true;
  private writerKey = "";
  async onload(): Promise<void> {
    const saved: unknown = await this.loadData();
    if (saved) {
      if ((saved as State).schema !== 1) {
        new Notice(
          "Flowstitch data version is unsupported. Restore a compatible backup.",
        );
        return;
      }
      this.state = saved as State;
      this.state.settings = {
        ...initialState().settings,
        ...this.state.settings,
      };
    }
    this.writerKey = "flowstitch-writer";
    this.api = new TodoistClient(
      async (req) => {
        const response = await requestUrl(req);
        return {
          status: response.status,
          headers: response.headers,
          json: response.json,
        };
      },
      () => this.app.secretStorage.getSecret(this.state.settings.secretName),
    );
    this.engine = new SyncEngine(this.state, this.api, {
      save: () => this.save(),
      writer: () => this.canWrite(),
      now: () => Date.now(),
      notes: {
        paths: async () => Array.from(this.index),
        read: (path) => this.readNote(path),
        process: (path, fn) => this.processNote(path, fn),
        optIn: (path) => this.folderOptIn(path),
      },
    });
    this.engine.noteUri = (path) => this.noteUri(path);
    addIcon(
      "flowstitch",
      '<path d="M3 7h5l5 7 8-11M3 13h4l6 8 8-12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    );
    this.registerView(VIEW, (leaf) => new DashboardView(leaf, this));
    this.addRibbonIcon("flowstitch", "Open Flowstitch", () => {
      void this.openDashboard(true);
    });
    this.addSettingTab(new FlowstitchSettings(this.app, this));
    this.addCommand({
      id: "open-dashboard",
      name: "Open dashboard",
      callback: () => this.openDashboard(false),
    });
    this.addCommand({
      id: "open-sidebar",
      name: "Open sidebar",
      callback: () => this.openDashboard(true),
    });
    this.addCommand({
      id: "quick-capture",
      name: "Quick capture",
      callback: () => new TaskModal(this).open(),
    });
    this.addCommand({
      id: "connect",
      name: "Connect Todoist",
      callback: () => this.connect(),
    });
    this.addCommand({
      id: "sync-now",
      name: "Sync now",
      callback: () => this.engine.sync(true),
    });
    this.addCommand({
      id: "diagnostics",
      name: "Sync diagnostics",
      callback: () => this.diagnostics(),
    });
    this.addCommand({
      id: "link-current-line",
      name: "Sync current checkbox",
      editorCallback: (editor, view) => {
        if (!view.file) return;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        if (!/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(line)) {
          new Notice("Place the cursor on a Markdown checkbox");
          return;
        }
        if (!this.canWrite()) {
          new Notice("Enable writing on this device in settings");
          return;
        }
        if (!line.split(/\s+/).includes(this.state.settings.marker))
          editor.replaceRange(" " + this.state.settings.marker, {
            line: cursor.line,
            ch: line.length,
          });
        this.index.add(view.file.path);
        this.scheduleSync();
      },
    });
    this.addCommand({
      id: "capture-selection",
      name: "Create linked Todoist task from selection",
      editorCallback: (editor, view) => {
        if (!view.file) return;
        new TaskModal(
          this,
          undefined,
          editor.getSelection() || editor.getLine(editor.getCursor().line),
          view.file.path,
        ).open();
      },
    });
    this.addCommand({
      id: "insert-daily-view",
      name: "Insert live daily view in current note",
      editorCallback: (editor) => this.dailyView(editor),
    });
    this.addCommand({
      id: "open-native-daily-note",
      name: "Open native Daily Note",
      callback: () => {
        window.open(
          `obsidian://daily?${`vault=${encodeURIComponent(this.app.vault.getName())}`}`,
        );
      },
    });
    this.addCommand({
      id: "open-daily-note",
      name: "Open daily planning note",
      callback: () => this.openDaily(),
    });
    this.addCommand({
      id: "link-project-note",
      name: "Link current note to Todoist project",
      callback: () => this.linkProject(),
    });
    this.addCommand({
      id: "end-of-day",
      name: "End-of-day review",
      callback: () => this.endOfDay(),
    });
    this.addCommand({
      id: "snapshot-completed",
      name: "Append completed-work snapshot to current note",
      callback: () => this.snapshot(),
    });
    this.registerMarkdownCodeBlockProcessor("flowstitch", (source, el, ctx) => {
      const match = source.match(
        /^view:\s*(today|upcoming|projects|inbox|templates|completed|related)\s*$/m,
      );
      ctx.addChild(
        new DashboardBlock(
          el,
          this,
          (match?.[1] ?? "today") as DashboardTab,
          ctx.sourcePath,
        ),
      );
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        if (!view.file) return;
        menu.addItem((i) =>
          i
            .setTitle("Create linked Todoist task")
            .setIcon("flowstitch")
            .onClick(() =>
              new TaskModal(
                this,
                undefined,
                editor.getSelection() ||
                  editor.getLine(editor.getCursor().line),
                view.file!.path,
              ).open(),
            ),
        );
      }),
    );
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "md")
          menu.addItem((i) =>
            i
              .setTitle("Create linked Todoist task")
              .setIcon("flowstitch")
              .onClick(() =>
                new TaskModal(this, undefined, "", file.path).open(),
              ),
          );
      }),
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          void this.indexFile(file).then(() => this.scheduleSync());
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "md")
          void this.indexFile(file).then(() => this.scheduleSync());
      }),
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", (_editor, view) => {
        if (view.file) {
          this.index.add(view.file.path);
          this.scheduleSync();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        const affected = Object.entries(this.state.links).filter(
          ([id, l]) =>
            !id.startsWith("pending:") &&
            (l.path === oldPath || l.path.startsWith(oldPath + "/")),
        );
        for (const [id, link] of affected) {
          const path = file.path + link.path.slice(oldPath.length);
          link.path = path;
          const task = this.state.tasks[id];
          if (task && this.canWrite()) {
            const old = this.noteUri(
              oldPath + link.path.slice(file.path.length),
              link.anchor,
            );
            const next = this.noteUri(path, link.anchor);
            if (task.description.includes(old))
              void this.engine
                .edit(
                  task,
                  fields(task),
                  task.description.split(old).join(next),
                )
                .catch(
                  () =>
                    new Notice(
                      "Note renamed; remote link update deferred. Attach the note again after pending operations finish.",
                    ),
                );
          }
        }
        this.index.delete(oldPath);
        if (file instanceof TFile) void this.indexFile(file);
        void this.save();
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.index.delete(file.path);
      }),
    );
    this.registerDomEvent(window, "online", () => {
      void this.engine.sync(true);
    });
    this.register(() => {
      this.alive = false;
      window.clearInterval(this.timer);
      window.clearTimeout(this.debounce);
      this.engine.stop();
    });
    this.app.workspace.onLayoutReady(() => {
      void this.initialize();
    });
  }
  private async initialize(): Promise<void> {
    if (!this.alive) return;
    await this.detectCompeting();
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!this.alive) return;
      await this.indexFile(file);
    }
    this.restartTimer();
    if (this.app.secretStorage.getSecret(this.state.settings.secretName))
      await this.engine.sync();
    else new Notice("Flowstitch is ready. Use Connect Todoist to get started.");
  }
  canWrite(): boolean {
    return (
      this.alive &&
      this.app.loadLocalStorage(this.writerKey) === true &&
      (!this.competing.length || this.state.settings.scopedSync)
    );
  }
  setWriter(value: boolean): void {
    this.app.saveLocalStorage(this.writerKey, value);
    this.engine.emit();
  }
  save(): Promise<void> {
    this.saving = this.saving
      .catch(() => {})
      .then(() => this.saveData(structuredClone(this.state)));
    return this.saving;
  }
  folderOptIn(path: string): boolean {
    return this.state.settings.folders.some((folder) =>
      path.startsWith(normalizePath(folder) + "/"),
    );
  }
  async reindex(): Promise<void> {
    for (const file of this.app.vault.getMarkdownFiles())
      await this.indexFile(file);
  }
  private async indexFile(file: TFile): Promise<void> {
    const text = await this.readNote(file.path);
    if (
      text.includes("<!-- flowstitch:") ||
      text.includes(this.state.settings.marker) ||
      this.folderOptIn(file.path)
    )
      this.index.add(file.path);
    else this.index.delete(file.path);
  }
  private async readNote(path: string): Promise<string> {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active?.file?.path === path) return active.editor.getValue();
    const file = this.app.vault.getFileByPath(path);
    if (!file) throw new Error("Linked note missing");
    return this.app.vault.cachedRead(file);
  }
  private async processNote(
    path: string,
    fn: (text: string) => string,
  ): Promise<void> {
    if (!this.canWrite()) throw new Error("Writing is disabled");
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active?.file?.path === path) {
      const before = active.editor.getValue();
      const after = fn(before);
      if (before !== after) this.replaceMinimal(active.editor, before, after);
      return;
    }
    const file = this.app.vault.getFileByPath(path);
    if (!file) throw new Error("Linked note missing");
    await this.app.vault.process(file, fn);
  }
  private replaceMinimal(editor: Editor, before: string, after: string): void {
    let start = 0;
    while (
      start < before.length &&
      start < after.length &&
      before[start] === after[start]
    )
      start++;
    let end = before.length,
      otherEnd = after.length;
    while (
      end > start &&
      otherEnd > start &&
      before[end - 1] === after[otherEnd - 1]
    ) {
      end--;
      otherEnd--;
    }
    editor.replaceRange(
      after.slice(start, otherEnd),
      editor.offsetToPos(start),
      editor.offsetToPos(end),
    );
  }
  private scheduleSync(): void {
    window.clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => {
      if (this.alive) void this.engine.sync();
    }, 1500);
  }
  restartTimer(): void {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(
      () => {
        if (this.alive) void this.engine.sync();
      },
      Math.max(30, this.state.settings.interval) * 1000,
    );
  }
  private async detectCompeting(): Promise<void> {
    const path = normalizePath(
      this.app.vault.configDir + "/community-plugins.json",
    );
    try {
      const data: unknown = JSON.parse(await this.app.vault.adapter.read(path));
      if (Array.isArray(data))
        this.competing = data.filter(
          (id): id is string =>
            typeof id === "string" &&
            [
              "todoist-board",
              "sync-todoist",
              "todoist-sync-plugin",
              "syncist-todoist-sync",
            ].includes(id),
        );
    } catch {
      this.competing = [];
    }
  }
  connect(): void {
    new ConnectionModal(this).open();
  }
  async openDashboard(sidebar: boolean): Promise<void> {
    const leaf = sidebar
      ? this.app.workspace.getRightLeaf(false)
      : this.app.workspace.getLeaf("tab");
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
  contextProject(path: string): string {
    if (!this.state.settings.smartDefaults || !path) return "";
    const file = this.app.vault.getFileByPath(path);
    const configured: unknown = file
      ? this.app.metadataCache?.getFileCache(file)?.frontmatter?.[
          "flowstitch-project"
        ]
      : undefined;
    if (typeof configured === "string" && this.state.projects[configured])
      return configured;
    const projects = new Set(
      Object.entries(this.state.links)
        .filter(([, link]) => link.path === path)
        .map(([id]) => this.state.tasks[id]?.project_id)
        .filter((id): id is string => !!id),
    );
    return projects.size === 1 ? [...projects][0]! : "";
  }
  linkProject(): void {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("Open a project note first");
      return;
    }
    const modal = new Modal(this.app);
    modal.setTitle("Link note to Todoist project");
    let project = "";
    new Setting(modal.contentEl).setName("Todoist project").addDropdown((d) => {
      d.addOption("", "Choose a project");
      for (const p of Object.values(this.state.projects))
        d.addOption(p.id, p.name);
      d.onChange((value) => {
        project = value;
      });
    });
    modal.contentEl.createEl("p", {
      text: "Adds only the flowstitch-project property. Capture uses it as a default; a related live view can show this project.",
    });
    button(modal.contentEl, "Link current note", async () => {
      if (!project) throw new Error("Choose a project");
      await this.app.fileManager.processFrontMatter(
        file,
        (data: Record<string, unknown>) => {
          data["flowstitch-project"] = project;
        },
      );
      modal.close();
    });
    modal.open();
  }
  noteUri(path: string, anchor = ""): string {
    return uri(this.app.vault.getName(), path, anchor);
  }
  async attach(task: Task): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) throw new Error("Open a note first");
    const link = `[Open in Obsidian](${this.noteUri(file.path)})`;
    await this.engine.edit(
      task,
      fields(task),
      task.description.includes(link)
        ? task.description
        : task.description + (task.description ? "\n\n" : "") + link,
    );
    this.state.links[task.id] = { path: file.path };
    await this.save();
    await this.engine.sync(true);
  }
  async reschedule(task: Task, date: string): Promise<void> {
    const due = rescheduleDue(task.due, date, this.state.settings.timezone);
    await this.engine.edit(task, { ...fields(task), due });
    await this.engine.sync(true);
  }
  private dailyView(editor: Editor): void {
    const before = editor.getValue();
    const after = insertDaily(before, this.state.settings.dailyHeading);
    this.replaceMinimal(editor, before, after);
  }
  async openDaily(): Promise<void> {
    const settings = this.state.settings;
    const date = (
      moment as unknown as (value: string) => { format(format: string): string }
    )(dateKey(new Date(), settings.timezone)).format(settings.dailyFormat);
    const path = normalizePath(
      (settings.dailyFolder ? settings.dailyFolder + "/" : "") + date + ".md",
    );
    let file = this.app.vault.getFileByPath(path);
    if (!file) {
      await this.ensureFolder(settings.dailyFolder);
      file = await this.app.vault.create(
        path,
        insertDaily(
          "# Daily Note\n\n## Top Priorities\n\n## Meetings\n\n## Notes and Activity\n\n## Follow-ups\n\n## End-of-Day Review\n",
          settings.dailyHeading,
        ),
      );
    }
    await this.app.workspace.getLeaf(false).openFile(file);
  }
  async ensureFolder(folder: string): Promise<void> {
    const normalized = normalizePath(folder);
    if (!normalized) return;
    let current = "";
    for (const part of normalized.split("/")) {
      if (part === "..") throw new Error("Folder must remain inside the vault");
      current += (current ? "/" : "") + part;
      if (!this.app.vault.getAbstractFileByPath(current))
        await this.app.vault.createFolder(current);
    }
  }
  diagnostics(): void {
    const modal = new Modal(this.app);
    modal.setTitle("Sync diagnostics");
    const render = (): void => {
      modal.contentEl.empty();
      new Setting(modal.contentEl)
        .setName("Connection")
        .setDesc(
          this.engine.status + " · " + (this.engine.error || "No recent error"),
        );
      new Setting(modal.contentEl)
        .setName("Last successful sync")
        .setDesc(
          this.state.lastSync
            ? new Date(this.state.lastSync).toLocaleString()
            : "Never",
        );
      new Setting(modal.contentEl)
        .setName("Pending operations")
        .setDesc(
          `${this.state.queue.length} queued; ${this.state.queue.filter((o) => o.error).length} rejected`,
        );
      button(modal.contentEl, "Retry operations", async () => {
        await this.engine.retry();
        render();
      }).disabled = !this.canWrite();
      for (const op of this.state.queue) {
        const operationRow = modal.contentEl.createDiv();
        operationRow.createEl("p", {
          text: `${op.command.type} · attempts ${op.attempts} · ${op.error ?? "Waiting"}`,
        });
        if (op.error)
          button(operationRow, "Review rejected operation", () => {
            const review = new Modal(this.app);
            review.setTitle("Review retained operation");
            review.contentEl.createEl("p", {
              text: "Copy any changes you want to keep before discarding this rejected queue entry. Existing Markdown and remote tasks will not be deleted.",
            });
            review.contentEl.createEl("pre", {
              text: JSON.stringify(
                {
                  type: op.command.type,
                  requested: op.desired ?? op.command.args,
                },
                null,
                2,
              ),
              cls: "flowstitch-report",
            });
            button(
              review.contentEl,
              "Discard this queued operation",
              async () => {
                await this.engine.discardRejected(op.command.uuid);
                review.close();
                render();
              },
            ).disabled = !this.canWrite();
            review.open();
          });
      }
      for (const conflict of Object.values(this.state.conflicts)) {
        const row = modal.contentEl.createDiv({ cls: "flowstitch-conflict" });
        row.createEl("p", { text: `Conflict: ${conflict.fields.join(", ")}` });
        button(row, "Compare", () =>
          new TextModal(
            this.app,
            "Compare task changes",
            JSON.stringify(
              { Obsidian: conflict.local, Todoist: conflict.remote },
              null,
              2,
            ),
          ).open(),
        );
        button(row, "Keep Obsidian", async () => {
          await this.engine.resolve(conflict.id, "local");
          await this.engine.sync(true);
          render();
        }).disabled = !this.canWrite();
        button(row, "Keep Todoist", async () => {
          await this.engine.resolve(conflict.id, "remote");
          render();
        }).disabled = !this.canWrite();
        row.createEl("span", { text: "Close this screen to defer." });
      }
      button(modal.contentEl, "Copy sanitised report", async () => {
        await navigator.clipboard.writeText(
          JSON.stringify(
            {
              version: this.manifest.version,
              status: this.engine.status,
              lastSync: this.state.lastSync,
              pending: this.state.queue.length,
              conflicts: Object.keys(this.state.conflicts).length,
              error: this.engine.error,
            },
            null,
            2,
          ),
        );
      });
    };
    render();
    modal.open();
  }
  async snapshot(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice("Open a Daily Note first");
      return;
    }
    const day = dateKey(new Date(), this.state.settings.timezone);
    const tasks = await this.api.completed(
      zonedDateTime(day, "00:00", this.state.settings.timezone),
      new Date().toISOString(),
    );
    const text = `\n## Completed work · ${day}\n\nHistorical record (not synchronised tasks):\n${tasks.map((t) => "- " + t.content.replace(/[\r\n]/g, " ")).join("\n")}\n`;
    const modal = new Modal(this.app);
    modal.setTitle("Append historical record");
    modal.contentEl.createEl("pre", { text });
    button(
      modal.contentEl,
      "Append to current note",
      () => {
        const editor = view.editor;
        editor.replaceRange(text, editor.offsetToPos(editor.getValue().length));
        modal.close();
      },
      "mod-cta",
    );
    modal.open();
  }
  endOfDay(): void {
    const modal = new Modal(this.app);
    modal.setTitle("End-of-day review");
    modal.contentEl.createEl("p", {
      text: "Choose unfinished tasks to move. Unselected tasks keep their dates.",
    });
    let date = dateKey(
      new Date(Date.now() + 86400000),
      this.state.settings.timezone,
    );
    new Setting(modal.contentEl).setName("Target date").addText((t) => {
      t.inputEl.type = "date";
      t.setValue(date).onChange((v) => {
        date = v;
      });
    });
    const selected = new Set<string>();
    const today = dateKey(new Date(), this.state.settings.timezone);
    for (const task of Object.values(this.state.tasks).filter(
      (t) =>
        !t.checked &&
        !t.is_deleted &&
        t.due &&
        t.due.date.slice(0, 10) <= today,
    ))
      new Setting(modal.contentEl).setName(task.content).addToggle((t) =>
        t.onChange((v) => {
          if (v) selected.add(task.id);
          else selected.delete(task.id);
        }),
      );
    button(
      modal.contentEl,
      "Move selected tasks",
      async () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a date");
        for (const id of selected)
          await this.reschedule(this.state.tasks[id]!, date);
        modal.close();
      },
      "mod-cta",
    ).disabled = !this.canWrite();
    if (this.state.settings.holidays)
      button(
        modal.contentEl,
        "Find next England/Wales working day",
        async () => {
          const response = await requestUrl(
            "https://www.gov.uk/bank-holidays.json",
          );
          const data = response.json as Record<
            string,
            { events: { date: string }[] }
          >;
          const events = data["england-and-wales"]?.events;
          if (!events) throw new Error("Holiday calendar unavailable");
          if (!events.some((event) => event.date.startsWith(date.slice(0, 4))))
            throw new Error(
              "Government calendar has no holiday data for the chosen year",
            );
          const holidays = new Set(events.map((e) => e.date));
          let next = new Date(date + "T12:00:00Z");
          for (let i = 0; i < 31; i++) {
            const key = next.toISOString().slice(0, 10);
            if (
              next.getUTCDay() !== 0 &&
              next.getUTCDay() !== 6 &&
              !holidays.has(key)
            ) {
              new Notice(
                `Suggested working day: ${key}. Enter this date above to use it.`,
              );
              return;
            }
            next = new Date(next.getTime() + 86400000);
          }
          throw new Error("No working date found");
        },
      );
    modal.open();
  }
}
type FlowstitchSettingDefinition = Omit<SettingDefinitionRender, "render"> & {
  render: (setting: Setting) => void;
};
type FlowstitchSettingGroup = Omit<SettingDefinitionGroup, "items"> & {
  items: FlowstitchSettingDefinition[];
};
export class FlowstitchSettings extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: Flowstitch,
  ) {
    super(app, plugin);
  }
  getSettingDefinitions(): FlowstitchSettingGroup[] {
    const groups: FlowstitchSettingGroup[] = [{ type: "group", items: [] }];
    let items: FlowstitchSettingDefinition[] = [];
    groups[0]!.items = items;
    const define = (
      name: string,
      desc: string,
      render: (setting: Setting) => void,
    ): void => {
      items.push({
        name,
        desc,
        render: (setting) => {
          render(setting);
        },
      });
    };
    const settings = this.plugin.state.settings;
    define(
      "Todoist token",
      "Select a local Obsidian secret. Credentials never enter plugin data.",
      (row) =>
        row.addComponent((parent) =>
          new SecretComponent(this.app, parent)
            .setValue(settings.secretName)
            .onChange(async (value) => {
              settings.secretName = value ?? "flowstitch-todoist";
              await this.plugin.save();
            }),
        ),
    );
    define("Connect Todoist", "", (row) =>
      row.addButton((b) =>
        b
          .setButtonText("Connection wizard")
          .onClick(() => this.plugin.connect()),
      ),
    );
    define(
      "Enable writing on this device",
      "Choose one writer for Markdown sync. Other devices stay read-only. No ordinary checkboxes are opted in automatically.",
      (row) =>
        row.addToggle((t) =>
          t.setValue(this.plugin.canWrite()).onChange((v) => {
            this.plugin.setWriter(v);
            this.refreshSettings();
          }),
        ),
    );
    define(
      "Scoped coexistence",
      "Explicitly allow writing with another integration installed. Foreign Todoist markers are excluded. Keep their folder scopes disjoint.",
      (row) =>
        row.addToggle((t) =>
          t.setValue(settings.scopedSync).onChange(async (v) => {
            settings.scopedSync = v;
            await this.plugin.save();
            this.plugin.engine.emit();
            this.refreshSettings();
          }),
        ),
    );
    define(
      "Contextual project defaults",
      "Use the linked note project or its existing related tasks when capturing.",
      (row) =>
        row.addToggle((t) =>
          t.setValue(settings.smartDefaults).onChange(async (value) => {
            settings.smartDefaults = value;
            await this.plugin.save();
          }),
        ),
    );
    items = [];
    groups.push({ type: "group", heading: "Synchronisation", items });
    define("Default project", "", (row) =>
      row.addDropdown((d) => {
        d.addOption("", "Todoist Inbox");
        for (const p of Object.values(this.plugin.state.projects))
          d.addOption(p.id, p.name);
        d.setValue(settings.defaultProject).onChange(async (v) => {
          settings.defaultProject = v;
          await this.plugin.save();
        });
      }),
    );
    define("Refresh interval", "Seconds, minimum 30.", (row) =>
      row.addText((t) =>
        t.setValue(String(settings.interval)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 30) {
            settings.interval = n;
            await this.plugin.save();
            this.plugin.restartTimer();
          }
        }),
      ),
    );
    for (const [key, name, desc] of [
      [
        "marker",
        "Opt-in marker",
        "Only marked checkboxes and explicitly selected folders are synchronised.",
      ],
      [
        "filter",
        "Todoist filter",
        "Used by Apply Todoist filter; supports official query syntax.",
      ],
      ["timezone", "Timezone", "IANA timezone, such as Europe/London."],
    ] as const)
      define(name, desc, (row) =>
        row.addText((t) =>
          t.setValue(settings[key]).onChange(async (v) => {
            if (key === "timezone") {
              try {
                new Intl.DateTimeFormat("en", { timeZone: v });
              } catch {
                return;
              }
            }
            if (key === "marker" && !/^#[\w/-]+$/.test(v)) return;
            settings[key] = v;
            await this.plugin.save();
            if (key === "marker") await this.plugin.reindex();
          }),
        ),
      );
    define(
      "Opt-in folders",
      "One vault-relative folder per line. Every checkbox there is explicitly opted in; leave blank for marker-only sync.",
      (row) =>
        row.addTextArea((t) =>
          t.setValue(settings.folders.join("\n")).onChange(async (v) => {
            settings.folders = v
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.save();
            await this.plugin.reindex();
          }),
        ),
    );
    items = [];
    groups.push({ type: "group", heading: "Daily planning", items });
    for (const [key, name] of [
      ["dailyHeading", "Live view heading"],
      ["dailyFolder", "Daily Note folder"],
      ["dailyFormat", "Daily Note filename format"],
      ["workStart", "Work starts"],
      ["workEnd", "Work finishes"],
      ["lunchStart", "Lunch starts"],
      ["lunchEnd", "Lunch finishes"],
    ] as const)
      define(name, "", (row) =>
        row.addText((t) =>
          t.setValue(settings[key]).onChange(async (v) => {
            settings[key] = v;
            await this.plugin.save();
          }),
        ),
      );
    define(
      "Holiday assistant",
      "Optional government calendar request during review. Suggestions only; no automatic routine rescheduling.",
      (row) =>
        row.addToggle((t) =>
          t.setValue(settings.holidays).onChange(async (v) => {
            settings.holidays = v;
            await this.plugin.save();
          }),
        ),
    );
    define(
      "Export configuration",
      "Includes presets and preferences; excludes credentials, cache and note contents.",
      (row) =>
        row.addButton((b) =>
          b
            .setButtonText("Export")
            .onClick(() =>
              new TextModal(
                this.app,
                "Flowstitch configuration",
                JSON.stringify(settings, null, 2),
              ).open(),
            ),
        ),
    );
    return groups;
  }
  // Obsidian before 1.13 uses this fallback; both paths share definitions.
  display(): void {
    this.renderLegacy();
  }
  private refreshSettings(): void {
    if (typeof this.update === "function") this.update();
    else this.renderLegacy();
  }
  private renderLegacy(): void {
    this.containerEl.empty();
    for (const group of this.getSettingDefinitions()) {
      if (group.heading)
        new Setting(this.containerEl).setName(group.heading).setHeading();
      for (const item of group.items) {
        const row = new Setting(this.containerEl)
          .setName(item.name)
          .setDesc(item.desc ?? "");
        item.render(row);
      }
    }
  }
}
