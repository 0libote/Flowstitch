import { type Fields, type Task, fields, uuid } from "../types";
export interface LinkedLine {
  line: number;
  raw: string;
  metadataLine: number;
  metadataRaw: string;
  key: string;
  id?: string;
  value: Fields;
  suffix: string;
  prefix: string;
}
interface Metadata {
  key: string;
  id?: string;
  due?: Fields["due"];
  priority?: number;
  project_id?: string;
  labels?: string[];
  parent_id?: string | null;
}
function validMetaDate(value: unknown): boolean {
  if (typeof value !== "string" || !value) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(value + "T12:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return !Number.isNaN(new Date(value).getTime());
  }
  return false;
}

function validMetadata(meta: Metadata): boolean {
  if (typeof meta.key !== "string" || !meta.key) return false;
  if (meta.id !== undefined && typeof meta.id !== "string") return false;
  if (meta.due !== undefined && meta.due !== null) {
    if (!meta.due || typeof meta.due !== "object") return false;
    const due = meta.due as { date?: unknown };
    if (typeof due.date !== "string" || !validMetaDate(due.date)) return false;
  }
  if (meta.priority !== undefined) {
    if (
      typeof meta.priority !== "number" ||
      !Number.isInteger(meta.priority) ||
      meta.priority < 1 ||
      meta.priority > 4
    )
      return false;
  }
  if (meta.project_id !== undefined && typeof meta.project_id !== "string")
    return false;
  if (meta.labels !== undefined) {
    if (!Array.isArray(meta.labels)) return false;
    if (!meta.labels.every((l) => typeof l === "string")) return false;
  }
  if (
    meta.parent_id !== undefined &&
    meta.parent_id !== null &&
    typeof meta.parent_id !== "string"
  )
    return false;
  return true;
}
const metaPattern = /^[ \t]*<!-- flowstitch:(\{.*\}) -->[ \t]*$/;
const foreign =
  /<!--\s*(?:todoist-id|todoist_id)|\[todoist_id::|%%.*todoist|\^todoist-/i;
function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function hasMarker(body: string, marker: string): boolean {
  if (!marker) return false;
  return new RegExp(`(^|\\W)${escapeReg(marker)}(\\W|$)`).test(body);
}
function stripMarker(body: string, marker: string): string {
  if (!marker) return body;
  const cleaned = body.replace(
    new RegExp(`(^|\\W)${escapeReg(marker)}(?=\\W|$)`),
    (_m, prefix: string) => prefix,
  );
  return cleaned
    .replace(/\(\s*[,;]?\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
const reserved =
  /^(.*?)(\s+(?:📅|⏳|🛫|✅|➕|🔺|⏫|🔼|🔽|⏬|🔁|🆔|⛔|🏁|\[[\w -]+::|<!--|%%|\^)[\s\S]*)$/;
export function scan(
  text: string,
  marker: string,
  defaultProject: string,
  folderOptIn = false,
): LinkedLine[] {
  const lines = text.split("\n");
  const out: LinkedLine[] = [];
  let fence = "";
  let size = 0;
  let front = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = (lines[i] ?? "").replace(/\r$/, "");
    if (i === 0 && raw === "---") {
      front = true;
      continue;
    }
    if (front) {
      if (raw === "---" || raw === "...") front = false;
      continue;
    }
    const f = raw.match(/^[ \t]*(?:>\s*)?(`{3,}|~{3,})/);
    if (f) {
      if (!fence) {
        fence = f[1]![0]!;
        size = f[1]!.length;
      } else if (f[1]![0] === fence && f[1]!.length >= size) fence = "";
      continue;
    }
    if (fence || foreign.test(raw)) continue;
    const m = raw.match(/^([ \t]*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s+)(.*)$/);
    if (!m) continue;
    const next = (lines[i + 1] ?? "").replace(/\r$/, "");
    const mm = next.match(metaPattern);
    let meta: Metadata | undefined;
    if (mm) {
      try {
        meta = JSON.parse(mm[1]!) as Metadata;
        if (!validMetadata(meta)) continue;
      } catch {
        continue;
      }
    }
    const body = m[4]!;
    const opted = hasMarker(body, marker);
    if (!meta && !opted && !folderOptIn) continue;
    const stripped = stripMarker(body, marker);
    const split = stripped.match(reserved);
    const content = (split?.[1] ?? stripped).trim();
    const suffix = split?.[2] ?? "";
    if (!content || /[\r\n]/.test(content)) continue;
    out.push({
      line: i,
      raw,
      metadataLine: mm ? i + 1 : -1,
      metadataRaw: mm ? next : "",
      key: meta?.key ?? "",
      id: meta?.id,
      value: {
        content,
        checked: m[2]!.toLowerCase() === "x",
        due: meta?.due ?? null,
        priority: meta?.priority ?? 1,
        project_id: meta?.project_id ?? defaultProject,
        labels: [...(meta?.labels ?? [])].sort(),
        parent_id: meta?.parent_id ?? null,
      },
      suffix,
      prefix: m[1]! + (m[2] ?? " ") + m[3]!,
    });
  }
  return out;
}
export function metadata(
  line: LinkedLine,
  value: Fields,
  id = line.id,
  key = line.key,
): string {
  const indent = line.raw.match(/^[ \t]*/)?.[0] ?? "";
  return `${indent}<!-- flowstitch:${JSON.stringify({ key, ...(id ? { id } : {}), due: value.due, priority: value.priority, project_id: value.project_id, labels: value.labels, parent_id: value.parent_id })} -->`;
}
export function prepare(
  text: string,
  marker: string,
  project: string,
  folder = false,
): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  for (const task of scan(text, marker, project, folder).reverse()) {
    if (!task.key) {
      task.key = uuid();
      lines.splice(task.line + 1, 0, metadata(task, task.value));
    }
  }
  return lines.join(eol);
}
export function patch(
  text: string,
  expected: LinkedLine,
  value: Fields,
  id: string,
  marker: string,
): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const all = scan(text, marker, value.project_id);
  const matches = all.filter((t) => t.key === expected.key);
  if (matches.length !== 1)
    throw new Error("Task identity missing or duplicated");
  const current = matches[0]!;
  if (
    current.raw !== expected.raw ||
    current.metadataRaw !== expected.metadataRaw
  )
    throw new Error("Note changed during sync; deferred");
  if (/[\r\n]/.test(value.content))
    throw new Error("Multiline task title cannot replace a checkbox");
  const prefix = current.prefix.replace(
    /\[([ xX])\]/,
    `[${value.checked ? "x" : " "}]`,
  );
  const next =
    value.content === current.value.content
      ? current.raw.replace(/\[([ xX])\]/, `[${value.checked ? "x" : " "}]`)
      : `${prefix}${value.content}${current.raw.includes(marker) ? " " + marker : ""}${current.suffix}`;
  lines[current.line] = next;
  lines[current.metadataLine] = metadata(current, value, id);
  return lines.join(eol);
}
export function fromTask(task: Task): Fields {
  return fields(task);
}
export function insertDaily(text: string, heading: string): string {
  if (text.includes("```flowstitch")) return text;
  const block = "\n```flowstitch\nview: today\n```\n";
  const target = `## ${heading}`;
  const lines = text.split("\n");
  const index = lines.findIndex((l) => l.replace(/\r$/, "") === target);
  if (index >= 0) lines.splice(index + 1, 0, block);
  else lines.push("", target, block);
  return lines.join("\n");
}
export function uri(vault: string, path: string, anchor = ""): string {
  const encode = (value: string): string =>
    encodeURIComponent(value).replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `obsidian://open?vault=${encode(vault)}&file=${encode(path + (anchor ? "#" + anchor : ""))}`;
}

/** Losing local context needs an explicit comparison, even for a remote-only title edit. */
export function losesContext(before: string, after: string): boolean {
  const tokens =
    before.match(
      /\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]*\)|(?:^|\s)#[\w/-]+|`[^`]+`/g,
    ) ?? [];
  return tokens.some((token) => !after.includes(token.trim()));
}
