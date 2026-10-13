import {
  Modal,
  Setting,
  Notice,
  normalizePath,
  type App,
  type TextAreaComponent,
} from "obsidian";
import type Flowstitch from "../main";
import { type Task, type Preset, fields, uuid } from "../types";
import { rescheduleDue } from "../notes/dates";
import { button, template, safeNoteName } from "./helpers";
export class ConnectionModal extends Modal {
  constructor(private plugin: Flowstitch) {
    super(plugin.app);
  }
  onOpen(): void {
    const TOKEN_URL =
      "https://app.todoist.com/app/settings/integrations/developer";
    this.setTitle("Connect Todoist");
    this.contentEl.createEl("p", {
      text: "Link Obsidian to Todoist in about a minute. Copy a token from Todoist, paste it below, and Flowstitch will verify it and load your projects.",
    });
    const steps = this.contentEl.createEl("ol");
    steps.createEl("li", {
      text: "In Todoist, open Settings → Integrations → Developer and copy your Personal API token.",
    });
    steps.createEl("li", {
      text: "Paste the token below.",
    });
    steps.createEl("li", {
      text: "Choose Connect. Flowstitch checks the token and discovers your projects.",
    });
    button(this.contentEl, "Open Todoist token page", () => {
      window.open(TOKEN_URL, "_blank", "noopener,noreferrer");
    });
    this.contentEl.createEl("p", {
      text: "In the Todoist web app: avatar → Settings → Integrations → scroll to Developer → Copy next to Personal API token.",
      cls: "flowstitch-muted",
    });
    let token = "";
    let tokenInput: HTMLInputElement | null = null;
    const formError = this.contentEl.createEl("p", {
      cls: "flowstitch-form-error",
      attr: { role: "alert" },
    });
    formError.style.display = "none";
    const showError = (message: string): void => {
      formError.textContent = message;
      formError.style.display = "";
      tokenInput?.setAttribute("aria-invalid", "true");
      tokenInput?.focus();
    };
    new Setting(this.contentEl)
      .setName("Personal API token")
      .setDesc(
        "Stored only in Secret Storage on this device. Never synced with your notes. Repeat on each device you use.",
      )
      .addText((t) => {
        t.inputEl.type = "password";
        t.inputEl.autocomplete = "off";
        tokenInput = t.inputEl;
        t.setPlaceholder("Paste your Todoist token").onChange((v) => {
          token = v.trim();
          if (token) {
            formError.textContent = "";
            formError.style.display = "none";
            t.inputEl.removeAttribute("aria-invalid");
          }
        });
      });
    this.contentEl.createEl("p", {
      text: "Only opted-in task text and links are sent to Todoist. If connecting fails, re-copy the full token without extra spaces.",
      cls: "flowstitch-muted",
    });
    button(
      this.contentEl,
      "Connect and discover projects",
      async () => {
        try {
          if (!token) {
            showError("Paste your token first (step 2 above)");
            throw new Error("Paste your token first (step 2 above)");
          }
          this.plugin.app.secretStorage.setSecret(
            this.plugin.state.settings.secretName,
            token,
          );
          await this.plugin.engine.sync(true);
          if (
            this.plugin.engine.status === "Authentication required" ||
            this.plugin.engine.error
          ) {
            const message = `${this.plugin.engine.error || "Todoist rejected the token"}. Re-copy the full token from the Developer tab and try again.`;
            showError(message);
            throw new Error(message);
          }
        } catch (error) {
          if (!formError.textContent)
            showError(
              error instanceof Error ? error.message : "Connection failed",
            );
          throw error;
        }
        const work = Object.values(this.plugin.state.projects).find(
          (p) => p.name === "Work",
        );
        if (work && !this.plugin.state.settings.defaultProject)
          this.plugin.state.settings.defaultProject = work.id;
        await this.plugin.save();
        this.contentEl.empty();
        this.contentEl.createEl("p", {
          text: "Connected. Your existing tasks and projects were loaded. Nothing else was created or changed in Todoist.",
          attr: { role: "status" },
        });
        this.contentEl.createEl("p", {
          text: "Next: open the dashboard to browse tasks. When ready, turn on writing on one device in Flowstitch settings to sync Markdown checkboxes.",
        });
        const openBtn = button(this.contentEl, "Open dashboard", async () => {
          this.close();
          await this.plugin.openDashboard(false);
          const dashboard = document.querySelector(
            ".flowstitch",
          ) as HTMLElement | null;
          dashboard?.focus();
        });
        openBtn.focus();
      },
      "mod-cta",
    );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
export class TaskModal extends Modal {
  constructor(
    private plugin: Flowstitch,
    private task?: Task,
    private initial = "",
    private source?: string,
    private preset?: Preset,
  ) {
    super(plugin.app);
  }
  onOpen(): void {
    this.setTitle(
      this.task
        ? "Edit task"
        : this.preset
          ? `Launch ${this.preset.name}`
          : "Quick capture",
    );
    const settings = this.plugin.state.settings;
    const base = this.task ? fields(this.task) : undefined;
    let title = this.task?.content ?? this.initial;
    let description = this.task?.description ?? "";
    let due = "";
    let time = "";
    let priority = this.task?.priority ?? this.preset?.priority ?? 1;
    let project =
      this.task?.project_id ||
      this.preset?.projectId ||
      this.plugin.contextProject(this.source ?? "") ||
      settings.defaultProject;
    let labels = this.task?.labels.join(", ") ?? "";
    let parent = this.task?.parent_id ?? "";
    let note =
      this.source ??
      (this.task ? this.plugin.state.links[this.task.id]?.path : "") ??
      "";
    let anchor = this.task
      ? (this.plugin.state.links[this.task.id]?.anchor ?? "")
      : "";
    let createNote = false;
    let steps = false;
    let titleInput: HTMLInputElement | null = null;
    let dueInput: HTMLInputElement | null = null;
    let timeInput: HTMLInputElement | null = null;
    let noteInput: HTMLInputElement | null = null;
    let parentSelect: HTMLSelectElement | null = null;
    const formError = this.contentEl.createEl("p", {
      cls: "flowstitch-form-error",
      attr: { role: "alert" },
    });
    formError.style.display = "none";
    const fail = (message: string, input?: HTMLElement | null): never => {
      formError.textContent = message;
      formError.style.display = "";
      if (input) {
        input.setAttribute("aria-invalid", "true");
        (input as HTMLElement).focus();
      }
      throw new Error(message);
    };
    const clearFieldError = (input: HTMLElement | null): void => {
      input?.removeAttribute("aria-invalid");
      if (formError.textContent) {
        formError.textContent = "";
        formError.style.display = "none";
      }
    };
    const nameSetting = new Setting(this.contentEl)
      .setName(this.preset ? "Article title" : "Task name")
      .addText((t) => {
        titleInput = t.inputEl;
        t.setValue(title).onChange((v) => {
          title = v;
          if (v.trim()) {
            clearFieldError(titleInput);
            formError.textContent = "";
          }
        });
        t.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit.click();
          }
        });
        window.setTimeout(() => t.inputEl.focus(), 50);
      });
    nameSetting.settingEl.addClass("flowstitch-wide");
    new Setting(this.contentEl)
      .setName("Description / notes")
      .addTextArea((t) =>
        t.setValue(description).onChange((v) => {
          description = v;
        }),
      );
    new Setting(this.contentEl)
      .setName("Due date")
      .setDesc(
        this.task?.due?.is_recurring
          ? "Leave blank to preserve the recurring rule. Rescheduling preserves its rule."
          : "Natural language, such as tomorrow or every weekday. Blank preserves an existing date.",
      )
      .addText((t) => {
        dueInput = t.inputEl;
        return t
          .setPlaceholder(this.task?.due?.string ?? "tomorrow")
          .onChange((v) => {
            due = v;
            clearFieldError(dueInput);
          });
      });
    new Setting(this.contentEl)
      .setName("Time")
      .setDesc("Optional HH:mm; appended to natural language dates.")
      .addText((t) => {
        t.inputEl.type = "time";
        timeInput = t.inputEl;
        t.onChange((v) => {
          time = v;
          clearFieldError(timeInput);
        });
      });
    new Setting(this.contentEl).setName("Priority").addDropdown((d) => {
      for (let i = 1; i <= 4; i++)
        d.addOption(String(5 - i), `P${i}${i === 1 ? " · highest" : ""}`);
      d.setValue(String(priority)).onChange((v) => {
        priority = Number(v);
      });
    });
    new Setting(this.contentEl).setName("Project").addDropdown((d) => {
      d.addOption("", "Todoist Inbox");
      for (const p of Object.values(this.plugin.state.projects))
        d.addOption(p.id, p.name);
      d.setValue(project).onChange((v) => {
        project = v;
      });
    });
    new Setting(this.contentEl)
      .setName("Labels")
      .setDesc("Comma-separated Todoist label names.")
      .addText((t) =>
        t.setValue(labels).onChange((v) => {
          labels = v;
        }),
      );
    new Setting(this.contentEl)
      .setName("Parent task")
      .setDesc("Choose a task in this project to create a subtask.")
      .addDropdown((d) => {
        d.addOption("", "No parent");
        for (const t of Object.values(this.plugin.state.tasks).filter(
          (t) => !t.checked && !t.is_deleted && t.id !== this.task?.id,
        ))
          d.addOption(t.id, t.content.slice(0, 70));
        parentSelect = (d as unknown as { selectEl: HTMLSelectElement })
          .selectEl;
        d.setValue(parent).onChange((v) => {
          parent = v;
          clearFieldError(parentSelect);
        });
      });
    new Setting(this.contentEl)
      .setName("Related note")
      .setDesc("Vault-relative Markdown path. Only the link is attached.")
      .addText((t) => {
        noteInput = t.inputEl;
        return t
          .setValue(note)
          .setPlaceholder("Suppliers/Example.md")
          .onChange((v) => {
            note = v;
            clearFieldError(noteInput);
          });
      });
    new Setting(this.contentEl)
      .setName("Heading or block")
      .setDesc(
        "Optional existing heading name, or ^block-id. The note remains unchanged.",
      )
      .addText((t) =>
        t
          .setValue(anchor)
          .setPlaceholder("Prices or ^supplier")
          .onChange((v) => {
            anchor = v.trim();
          }),
      );
    if (this.preset) {
      new Setting(this.contentEl)
        .setName("Create matching note")
        .addToggle((t) =>
          t.onChange((v) => {
            createNote = v;
          }),
        );
      if (this.preset.subtasks.length)
        new Setting(this.contentEl)
          .setName("Include workflow steps")
          .addToggle((t) =>
            t.onChange((v) => {
              steps = v;
            }),
          );
    }
    const submit = button(
      this.contentEl,
      this.task ? "Save changes" : "Capture task",
      async () => {
        if (!title.trim()) fail("Enter a task name", titleInput);
        if (!this.plugin.canWrite())
          fail("Enable writing on this device in settings");
        if (parent && this.plugin.state.tasks[parent]?.project_id !== project)
          fail("Parent must belong to the selected project", parentSelect);
        let resolvedNote = note.trim() ? normalizePath(note.trim()) : "";
        if (resolvedNote && !this.plugin.app.vault.getFileByPath(resolvedNote))
          fail("Related note does not exist", noteInput);
        let content = title.trim();
        let desc = description;
        const key = uuid();
        if (this.preset) {
          const values = { title: content, notes: description, date: due };
          content = template(this.preset.content, values);
          desc = template(this.preset.description, values);
          if (createNote) {
            let safeName: string;
            try {
              safeName = safeNoteName(title);
            } catch {
              fail("Choose a valid note title", titleInput);
            }
            resolvedNote = normalizePath(
              (this.preset.folder ? this.preset.folder + "/" : "") +
                safeName! +
                ".md",
            );
            if (this.plugin.app.vault.getAbstractFileByPath(resolvedNote))
              fail(
                "Matching note already exists; choose a different title",
                titleInput,
              );
            await this.plugin.ensureFolder(this.preset.folder);
            await this.plugin.app.vault.create(
              resolvedNote,
              template(this.preset.noteTemplate, values),
            );
          }
        }
        if (resolvedNote) {
          const link = this.plugin.noteUri(resolvedNote, anchor);
          if (!desc.includes(link))
            desc += `${desc ? "\n\n" : ""}[Open in Obsidian](${link})`;
        }
        if (this.task) {
          const desired = {
            ...base!,
            content,
            priority,
            project_id:
              project ||
              Object.values(this.plugin.state.projects).find(
                (p) => p.inbox_project,
              )?.id ||
              this.task.project_id,
            labels: labels
              .split(",")
              .map((l) => l.trim())
              .filter(Boolean),
            parent_id: parent || null,
          };
          if (
            this.task.due?.is_recurring &&
            due &&
            !/^\d{4}-\d{2}-\d{2}$/.test(due)
          )
            fail("Use YYYY-MM-DD to reschedule a recurring task", dueInput);
          if (time && !due)
            fail("Enter a date when changing the time", timeInput);
          if (due)
            desired.due = this.task.due?.is_recurring
              ? rescheduleDue(
                  this.task.due,
                  due,
                  settings.timezone,
                  time || undefined,
                )
              : {
                  date: "",
                  string: due + (time ? " at " + time : ""),
                  timezone: settings.timezone,
                };
          await this.plugin.engine.edit(this.task, desired, desc);
          if (resolvedNote)
            this.plugin.state.links[this.task.id] = {
              path: resolvedNote,
              anchor,
            };
        } else {
          const args: Record<string, unknown> = {
            content,
            description: desc,
            priority,
            labels: labels
              .split(",")
              .map((l) => l.trim())
              .filter(Boolean),
            auto_reminder: false,
            ...(project ? { project_id: project } : {}),
            ...(parent ? { parent_id: parent } : {}),
          };
          if (due || time)
            args.due = {
              string: (due || "today") + (time ? " at " + time : ""),
              timezone: settings.timezone,
            };
          if (anchor)
            await this.plugin.engine.create(
              args,
              resolvedNote || undefined,
              key,
              anchor,
            );
          else
            await this.plugin.engine.create(
              args,
              resolvedNote || undefined,
              key,
            );
          if (steps && this.preset) {
            try {
              await this.plugin.save();
              await this.plugin.engine.sync(true);
            } catch {
              // Parent is still queued; children fall back to the temp key.
            }
            const realParent =
              (
                this.plugin.engine.state as unknown as
                  | { links?: Record<string, { path: string }> }
                  | undefined
              )?.links?.["pending:" + key]?.path ?? key;
            for (const step of this.preset.subtasks)
              await this.plugin.engine.create({
                content: step,
                parent_id: realParent,
                ...(project ? { project_id: project } : {}),
                auto_reminder: false,
              });
          }
        }
        await this.plugin.save();
        this.close();
        await this.plugin.engine.sync(true);
        new Notice(
          this.plugin.state.queue.length
            ? "Captured; pending sync"
            : "Task saved",
        );
      },
      "mod-cta",
    );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
export class PresetModal extends Modal {
  constructor(
    private plugin: Flowstitch,
    private preset?: Preset,
  ) {
    super(plugin.app);
  }
  onOpen(): void {
    this.setTitle("Workflow preset");
    const value = this.preset
      ? structuredClone(this.preset)
      : {
          id: uuid(),
          name: "New workflow",
          content: "{{title}}",
          description: "{{notes}}",
          priority: 1,
          projectId: this.plugin.state.settings.defaultProject,
          folder: "",
          noteTemplate: "# {{title}}\n\n{{notes}}\n",
          subtasks: [],
        };
    let descriptionInput: TextAreaComponent | undefined;
    const fieldInputs = new Map<string, HTMLElement>();
    const formError = this.contentEl.createEl("p", {
      cls: "flowstitch-form-error",
      attr: { role: "alert" },
    });
    formError.style.display = "none";
    const fail = (message: string, field?: string): never => {
      formError.textContent = message;
      formError.style.display = "";
      const input = field ? fieldInputs.get(field) : undefined;
      if (input) {
        input.setAttribute("aria-invalid", "true");
        (input as HTMLElement).focus();
      }
      throw new Error(message);
    };
    for (const key of [
      "name",
      "content",
      "description",
      "folder",
      "noteTemplate",
    ] as const)
      new Setting(this.contentEl)
        .setName(
          {
            name: "Name",
            content: "Task title template",
            description: "Description template",
            folder: "Note destination folder",
            noteTemplate: "Note template",
          }[key],
        )
        .setDesc(
          key === "content" || key === "description" || key === "noteTemplate"
            ? "Use {{title}}, {{notes}} and {{date}}. No code is executed."
            : "",
        )
        .addTextArea((t) => {
          if (key === "description") descriptionInput = t;
          fieldInputs.set(
            key,
            (t as unknown as { inputEl: HTMLElement }).inputEl,
          );
          t.setValue(value[key]).onChange((v) => {
            value[key] = v;
            if (v.trim()) {
              (
                t as unknown as { inputEl: HTMLElement }
              ).inputEl.removeAttribute("aria-invalid");
              formError.textContent = "";
              formError.style.display = "none";
            }
          });
        });
    new Setting(this.contentEl).setName("Default priority").addDropdown((d) => {
      for (let i = 1; i <= 4; i++) d.addOption(String(5 - i), `P${i}`);
      d.setValue(String(value.priority)).onChange((v) => {
        value.priority = Number(v);
      });
    });
    new Setting(this.contentEl).setName("Default project").addDropdown((d) => {
      d.addOption("", "Default project");
      for (const p of Object.values(this.plugin.state.projects))
        d.addOption(p.id, p.name);
      d.setValue(value.projectId).onChange((v) => {
        value.projectId = v;
      });
    });
    new Setting(this.contentEl)
      .setName("Optional steps")
      .setDesc("One subtask title per line.")
      .addTextArea((t) =>
        t.setValue(value.subtasks.join("\n")).onChange((v) => {
          value.subtasks = v
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        }),
      );
    new Setting(this.contentEl)
      .setName("Reference master task")
      .setDesc(
        "Copies its description when selected; never modifies the master.",
      )
      .addDropdown((d) => {
        d.addOption("", "No master reference");
        for (const t of Object.values(this.plugin.state.tasks).filter(
          (t) => !t.checked && t.content.includes("[MASTER TEMPLATE]"),
        ))
          d.addOption(t.id, t.content);
        d.setValue(value.masterId ?? "").onChange((v) => {
          value.masterId = v || undefined;
          if (v)
            value.description =
              this.plugin.state.tasks[v]?.description ?? value.description;
          descriptionInput?.setValue(value.description);
        });
      });
    new Setting(this.contentEl).setName("Archived").addToggle((t) =>
      t.setValue(!!value.archived).onChange((v) => {
        value.archived = v;
      }),
    );
    button(
      this.contentEl,
      "Save preset",
      async () => {
        if (!value.name.trim()) fail("Name is required", "name");
        if (!value.content.trim())
          fail("Title template is required", "content");
        if (!value.noteTemplate.trim())
          fail("Note template must not be empty", "noteTemplate");
        if (value.folder.includes(".."))
          fail("Folder must remain inside the vault", "folder");
        const list = this.plugin.state.settings.presets;
        const index = list.findIndex((p) => p.id === value.id);
        if (index < 0) list.push(value);
        else list[index] = value;
        await this.plugin.save();
        this.plugin.engine.emit();
        this.close();
      },
      "mod-cta",
    );
  }
}
export class TextModal extends Modal {
  constructor(
    app: App,
    title: string,
    private text: string,
  ) {
    super(app);
    this.setTitle(title);
  }
  onOpen(): void {
    this.contentEl.createEl("pre", {
      text: this.text,
      cls: "flowstitch-report",
    });
  }
}
