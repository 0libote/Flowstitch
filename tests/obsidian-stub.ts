export const notices: string[] = [];
export class Notice {
  constructor(message: string) {
    notices.push(message);
  }
}
export class Modal {
  contentEl = document.createElement("div");
  titleEl = document.createElement("h2");
  static opened: Modal[] = [];
  constructor(public app: unknown) {}
  setTitle(title: string): void {
    this.titleEl.textContent = title;
  }
  open(): void {
    Modal.opened.push(this);
    document.body.append(this.contentEl);
    (this as unknown as { onOpen?: () => void }).onOpen?.();
  }
  close(): void {
    this.contentEl.remove();
    (this as unknown as { onClose?: () => void }).onClose?.();
  }
}
class Input {
  inputEl: HTMLInputElement;
  constructor(parent: HTMLElement, type = "text") {
    this.inputEl = parent.createEl("input");
    this.inputEl.type = type;
  }
  setValue(v: string): this {
    this.inputEl.value = v;
    return this;
  }
  setPlaceholder(v: string): this {
    this.inputEl.placeholder = v;
    return this;
  }
  onChange(fn: (v: string) => unknown): this {
    this.inputEl.addEventListener("input", () => {
      void fn(this.inputEl.value);
    });
    return this;
  }
}
class Area {
  inputEl: HTMLTextAreaElement;
  constructor(parent: HTMLElement) {
    this.inputEl = parent.createEl("textarea");
  }
  setValue(v: string): this {
    this.inputEl.value = v;
    return this;
  }
  onChange(fn: (v: string) => unknown): this {
    this.inputEl.addEventListener("input", () => {
      void fn(this.inputEl.value);
    });
    return this;
  }
}
class Dropdown {
  selectEl: HTMLSelectElement;
  constructor(parent: HTMLElement) {
    this.selectEl = parent.createEl("select");
  }
  addOption(v: string, label: string): this {
    this.selectEl.createEl("option", { text: label, attr: { value: v } });
    return this;
  }
  setValue(v: string): this {
    this.selectEl.value = v;
    return this;
  }
  onChange(fn: (v: string) => unknown): this {
    this.selectEl.addEventListener("change", () => {
      void fn(this.selectEl.value);
    });
    return this;
  }
}
class Toggle {
  toggleEl: HTMLInputElement;
  constructor(parent: HTMLElement) {
    this.toggleEl = parent.createEl("input", { attr: { type: "checkbox" } });
  }
  setValue(v: boolean): this {
    this.toggleEl.checked = v;
    return this;
  }
  onChange(fn: (v: boolean) => unknown): this {
    this.toggleEl.addEventListener("change", () => {
      void fn(this.toggleEl.checked);
    });
    return this;
  }
}
class Button {
  buttonEl: HTMLButtonElement;
  constructor(parent: HTMLElement) {
    this.buttonEl = parent.createEl("button");
  }
  setButtonText(v: string): this {
    this.buttonEl.textContent = v;
    return this;
  }
  onClick(fn: () => void): this {
    this.buttonEl.addEventListener("click", fn);
    return this;
  }
}
export class Setting {
  settingEl: HTMLElement;
  controlEl: HTMLElement;
  private nameEl: HTMLElement;
  constructor(parent: HTMLElement) {
    this.settingEl = parent.createDiv({ cls: "setting-item" });
    this.nameEl = this.settingEl.createDiv({ cls: "setting-item-name" });
    this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" });
  }
  setName(v: string): this {
    this.nameEl.textContent = v;
    return this;
  }
  setDesc(v: string): this {
    this.settingEl.createDiv({ text: v });
    return this;
  }
  setHeading(): this {
    return this;
  }
  addText(fn: (t: Input) => unknown): this {
    fn(new Input(this.controlEl));
    return this;
  }
  addTextArea(fn: (t: Area) => unknown): this {
    fn(new Area(this.controlEl));
    return this;
  }
  addDropdown(fn: (t: Dropdown) => unknown): this {
    fn(new Dropdown(this.controlEl));
    return this;
  }
  addToggle(fn: (t: Toggle) => unknown): this {
    fn(new Toggle(this.controlEl));
    return this;
  }
  addButton(fn: (t: Button) => unknown): this {
    fn(new Button(this.controlEl));
    return this;
  }
  addComponent(fn: (el: HTMLElement) => unknown): this {
    fn(this.controlEl);
    return this;
  }
}
export class ItemView {
  contentEl = document.createElement("div");
  constructor(public leaf: unknown) {}
}
export class MarkdownRenderChild {
  constructor(public containerEl: HTMLElement) {}
}
export class Menu {
  addItem(_fn: unknown): this {
    return this;
  }
  showAtMouseEvent(_event: unknown): void {}
  showAtPosition(_point: unknown): void {}
}
export class SecretComponent {
  constructor(_app: unknown, _el: HTMLElement) {}
  setValue(_v: string): this {
    return this;
  }
  onChange(_fn: unknown): this {
    return this;
  }
}
export const normalizePath = (path: string): string =>
  path
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
export const commands: {
  id: string;
  name: string;
  callback?: () => unknown;
  editorCallback?: (editor: unknown, view: unknown) => unknown;
}[] = [];
export class Plugin {
  private cleanup: (() => void)[] = [];
  constructor(
    public app: unknown,
    public manifest: unknown,
  ) {}
  async loadData(): Promise<unknown> {
    return null;
  }
  async saveData(_data: unknown): Promise<void> {}
  register(fn: () => void): void {
    this.cleanup.push(fn);
  }
  registerEvent(ref: { off?: () => void }): void {
    this.cleanup.push(() => ref.off?.());
  }
  registerDomEvent(el: EventTarget, name: string, fn: EventListener): void {
    el.addEventListener(name, fn);
    this.cleanup.push(() => el.removeEventListener(name, fn));
  }
  registerView(_name: string, _fn: unknown): void {}
  addRibbonIcon(_icon: string, _label: string, _fn: unknown): void {}
  addSettingTab(_tab: unknown): void {}
  addCommand(command: (typeof commands)[number]): void {
    commands.push(command);
    this.cleanup.push(() => {
      const index = commands.indexOf(command);
      if (index >= 0) commands.splice(index, 1);
    });
  }
  registerMarkdownCodeBlockProcessor(_name: string, _fn: unknown): void {}
  unload(): void {
    for (const fn of this.cleanup.reverse()) fn();
    this.cleanup = [];
  }
}
export class PluginSettingTab {
  containerEl = document.createElement("div");
  constructor(
    public app: unknown,
    _plugin: unknown,
  ) {}
}
export class MarkdownView {}
export class TFile {
  extension = "md";
  constructor(public path: string) {}
}
export function addIcon(_name: string, _svg: string): void {}
export async function requestUrl(_request: unknown): Promise<unknown> {
  throw new Error("Network not provided in host simulation");
}
export function moment(date: string): { format: (pattern: string) => string } {
  return {
    format: (pattern) =>
      pattern
        .replace("YYYY", date.slice(0, 4))
        .replace("MM", date.slice(5, 7))
        .replace("DD", date.slice(8, 10)),
  };
}
