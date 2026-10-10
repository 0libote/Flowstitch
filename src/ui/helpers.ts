import { Notice } from "obsidian";
export function button(
  parent: HTMLElement,
  label: string,
  action: () => void | Promise<void>,
  cls = "",
): HTMLButtonElement {
  const el = parent.createEl("button", {
    text: label,
    cls,
    attr: { type: "button" },
  });
  el.addEventListener("click", () => {
    el.disabled = true;
    void Promise.resolve()
      .then(action)
      .catch(
        (error) =>
          new Notice(
            error instanceof Error ? error.message : "Operation failed",
          ),
      )
      .finally(() => {
        el.disabled = false;
      });
  });
  return el;
}
export function dateKey(date: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)?.value)
    .join("-");
}
export function taskDate(date: string, zone: string): string {
  return /Z$|[+-]\d\d:\d\d$/.test(date)
    ? dateKey(new Date(date), zone)
    : date.slice(0, 10);
}
export function tomorrow(zone: string): string {
  return dateKey(new Date(Date.now() + 86400000), zone);
}
export function formatDue(date: string, zone: string): string {
  if (date.length === 10) return date;
  if (/Z$|[+-]\d\d:\d\d$/.test(date))
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));
  return date.replace("T", " ").slice(0, 16);
}
export function template(text: string, values: Record<string, string>): string {
  return text.replace(
    /\{\{(\w+)\}\}/g,
    (_match, key: string) => values[key] ?? "",
  );
}
export function safeNoteName(title: string): string {
  const name = title
    .replace(/[\\/:*?"<>|#[\]\r\n]/g, " ")
    .trim()
    .slice(0, 120);
  if (!name || name === "." || name === "..")
    throw new Error("Choose a valid note title");
  return name;
}
