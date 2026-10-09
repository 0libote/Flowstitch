import { beforeEach } from "vitest";
type Options = {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string>;
};
function create(
  this: HTMLElement,
  tag: string,
  options: Options = {},
): HTMLElement {
  const el = document.createElement(tag);
  if (options.cls)
    el.className = Array.isArray(options.cls)
      ? options.cls.join(" ")
      : options.cls;
  if (options.text) el.textContent = options.text;
  for (const [key, value] of Object.entries(options.attr ?? {}))
    el.setAttribute(key, value);
  this.append(el);
  return el;
}
Object.assign(HTMLElement.prototype, {
  empty(this: HTMLElement) {
    this.replaceChildren();
  },
  addClass(this: HTMLElement, ...names: string[]) {
    this.classList.add(...names);
  },
  createEl: create,
  createDiv(this: HTMLElement, options: Options) {
    return create.call(this, "div", options);
  },
  createSpan(this: HTMLElement, options: Options) {
    return create.call(this, "span", options);
  },
});
beforeEach(() => {
  document.body.replaceChildren();
});
