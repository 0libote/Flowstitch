import type { Command, Task, Project, Section } from "../types";
export interface Response {
  status: number;
  headers: Record<string, string>;
  json: unknown;
}
export type Transport = (request: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  throw: false;
}) => Promise<Response>;
export interface SyncResponse {
  sync_token: string;
  full_sync: boolean;
  items: Task[];
  projects: Project[];
  sections: Section[];
  sync_status: Record<string, "ok" | { error_code: number; error?: string }>;
  temp_id_mapping: Record<string, string>;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public retryAfter = 0,
  ) {
    super(
      status === 401 || status === 403
        ? "Credentials invalid or access denied"
        : status === 429
          ? "Todoist rate limit reached"
          : status === 0
            ? "Network unavailable"
            : `Todoist request failed (${status})`,
    );
  }
}
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Unexpected Todoist response");
  return value as Record<string, unknown>;
}
function parseRetryAfter(header: string | undefined): number {
  if (!header) return 0;
  const numeric = Number(header) * 1000;
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  const parsed = Date.parse(header) - Date.now();
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 0;
}
function validDueDate(value: string): boolean {
  if (!value) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(value + "T12:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const d = new Date(value);
    return !Number.isNaN(d.getTime());
  }
  return false;
}
export function parseTask(raw: unknown): Task {
  const t = record(raw);
  if (
    typeof t.id !== "string" ||
    typeof t.content !== "string" ||
    typeof t.project_id !== "string"
  )
    throw new Error("Unexpected Todoist task");
  let due: Task["due"] = null;
  if (t.due && typeof t.due === "object") {
    const d = t.due as Record<string, unknown>;
    if (typeof d.date === "string" && validDueDate(d.date))
      due = t.due as Task["due"];
  }
  return {
    id: t.id,
    content: t.content,
    description: typeof t.description === "string" ? t.description : "",
    project_id: t.project_id,
    section_id: typeof t.section_id === "string" ? t.section_id : null,
    parent_id: typeof t.parent_id === "string" ? t.parent_id : null,
    priority: typeof t.priority === "number" ? t.priority : 1,
    labels: Array.isArray(t.labels)
      ? t.labels.filter((l): l is string => typeof l === "string")
      : [],
    due,
    checked: !!(t.checked ?? t.is_completed),
    is_deleted: !!t.is_deleted,
  };
}
export class TodoistClient {
  private verifiedToken = "";
  private verifiedAccount = "";
  constructor(
    private transport: Transport,
    private secret: () => string | null,
  ) {}
  private async request(
    path: string,
    method = "GET",
    body?: string,
    form = false,
  ): Promise<unknown> {
    const token = this.secret();
    if (!token) throw new ApiError(401);
    let res: Response;
    try {
      res = await this.transport({
        url: `https://api.todoist.com/api/v1${path}`,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body
            ? {
                "Content-Type": form
                  ? "application/x-www-form-urlencoded"
                  : "application/json",
              }
            : {}),
        },
        body,
        throw: false,
      });
    } catch {
      throw new ApiError(0);
    }
    if (res.status >= 400) {
      const header = Object.entries(res.headers).find(
        ([key]) => key.toLowerCase() === "retry-after",
      )?.[1];
      throw new ApiError(res.status, parseRetryAfter(header));
    }
    return res.json;
  }
  async account(): Promise<string> {
    const token = this.secret() ?? "";
    if (token && token === this.verifiedToken) return this.verifiedAccount;
    const user = record(await this.request("/user"));
    if (typeof user.id !== "string")
      throw new Error("Unexpected Todoist account");
    this.verifiedAccount = user.id;
    this.verifiedToken = token;
    return user.id;
  }
  async sync(token: string, commands: Command[] = []): Promise<SyncResponse> {
    if (commands.length > 100) throw new Error("Command batch exceeds limit");
    const body = new URLSearchParams({
      sync_token: token,
      resource_types: JSON.stringify(["items", "projects", "sections"]),
      commands: JSON.stringify(commands),
    }).toString();
    if (new TextEncoder().encode(body).length > 1000000)
      throw new Error("Sync request too large");
    const r = record(await this.request("/sync", "POST", body, true));
    if (typeof r.sync_token !== "string" || !Array.isArray(r.items))
      throw new Error("Unexpected Todoist sync response");
    return {
      sync_token: r.sync_token,
      full_sync: !!r.full_sync,
      items: r.items.map(parseTask),
      projects: (r.projects ?? []) as Project[],
      sections: (r.sections ?? []) as Section[],
      sync_status: (r.sync_status ?? {}) as SyncResponse["sync_status"],
      temp_id_mapping: (r.temp_id_mapping ?? {}) as Record<string, string>,
    };
  }
  async list(
    path: string,
    params: Record<string, string> = {},
  ): Promise<unknown[]> {
    const results: unknown[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    let pages = 0;
    do {
      if (pages >= 50) throw new Error("PaginationLimit: too many pages");
      const query = new URLSearchParams({
        ...params,
        ...(cursor ? { cursor } : {}),
      });
      const r = record(await this.request(`${path}?${query}`));
      const entries = r.results ?? r.items;
      if (!isUnknownArray(entries)) throw new Error("Unexpected Todoist page");
      results.push(...entries);
      if (results.length > 5000)
        throw new Error("PaginationLimit: too many items");
      pages++;
      cursor = typeof r.next_cursor === "string" ? r.next_cursor : null;
      if (cursor && seen.has(cursor))
        throw new Error("Repeated Todoist pagination cursor");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return results;
  }
  async filter(query: string): Promise<Task[]> {
    return (await this.list("/tasks/filter", { query })).map(parseTask);
  }
  async completed(since: string, until: string): Promise<Task[]> {
    return (
      await this.list("/tasks/completed/by_completion_date", { since, until })
    ).map((raw) => ({ ...parseTask(raw), checked: true }));
  }
}
