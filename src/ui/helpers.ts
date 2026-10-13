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
  if (!date || typeof date !== "string") return "";
  if (/Z$|[+-]\d\d:\d\d$/.test(date)) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return date.slice(0, 10);
    try {
      return dateKey(parsed, zone);
    } catch {
      return date.slice(0, 10);
    }
  }
  return date.slice(0, 10);
}
export function tomorrow(zone: string): string {
  return dateKey(new Date(Date.now() + 86400000), zone);
}
export function formatDue(date: string, zone: string): string {
  if (!date || typeof date !== "string") return "";
  if (date.length === 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : date.slice(0, 10);
  if (/Z$|[+-]\d\d:\d\d$/.test(date)) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime()))
      return date.replace("T", " ").slice(0, 16);
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed);
    } catch {
      return date.replace("T", " ").slice(0, 16);
    }
  }
  return date.replace("T", " ").slice(0, 16);
}
export function template(text: string, values: Record<string, string>): string {
  return text.replace(
    /\{\{(\w+)\}\}/g,
    (_match, key: string) => values[key] ?? "",
  );
}
export function truncateDisplay(value: string, max = 70): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1).trimEnd() + "…";
}

export function truncateUi(value: string, max = 80): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1).trimEnd() + "…";
}

export function isValidAnchor(anchor: string): boolean {
  if (!anchor) return true;
  if (anchor.length > 200 || /[\r\n#[\]()<>]/.test(anchor)) return false;
  if (anchor.startsWith("^")) return /^\^[A-Za-z0-9-]+$/.test(anchor);
  if (anchor.includes("<!--") || anchor.includes("-->")) return false;
  return anchor.trim().length > 0;
}

/** Central vault-relative path validation. Rejects traversal, absolute paths and unsafe characters. */
export function resolveVaultPath(input: string): string {
  const raw = input.replace(/\\/g, "/").trim();
  if (!raw) return "";
  if (raw.startsWith("/") || raw.startsWith("./") || raw === ".")
    throw new Error("Folder must be vault-relative");
  const segments = raw.split("/");
  for (const part of segments) {
    if (!part || part === "." || part === "..")
      throw new Error("Folder must remain inside the vault");
    // Allowlist: no control/bidi isolates, no characters illegal on common filesystems.
    if (
      /[\\:*?"<>|#\[\]\r\n\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/.test(
        part,
      )
    )
      throw new Error("Folder contains unsupported characters");
  }
  return segments.join("/").replace(/\/+$/g, "");
}

/** Strip bidi/control characters and filesystem-illegal characters from note names. */
export function safeNoteName(title: string): string {
  const stripped = title.replace(
    /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u2028\u2029]/g,
    "",
  );
  const name = stripped
    .replace(/[\\/:*?"<>|#[\]\r\n]/g, " ")
    .trim()
    .slice(0, 120);
  if (!name || name === "." || name === "..")
    throw new Error("Choose a valid note title");
  return name;
}

/** Remove sync-active markers and comment/checkbox syntax from remote text before appending to a note. */
export function sanitizeSnapshotContent(content: string): string {
  return content
    .replace(/[\r\n]+/g, " ")
    .replace(/#todoist/gi, "")
    .replace(/<!--/g, "")
    .replace(/-->/g, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function isValidHolidayEvents(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every((event) => {
    const date = (event as { date?: unknown } | null | undefined)?.date;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return false;
    const parsed = new Date(date + "T12:00:00Z");
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date
    );
  });
}
