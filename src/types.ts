export interface Due {
  date: string;
  string?: string;
  timezone?: string | null;
  is_recurring?: boolean;
  lang?: string;
}
export interface Task {
  id: string;
  content: string;
  description: string;
  project_id: string;
  section_id: string | null;
  parent_id: string | null;
  priority: number;
  labels: string[];
  due: Due | null;
  checked: boolean;
  is_deleted?: boolean;
}
export interface Project {
  id: string;
  name: string;
  inbox_project?: boolean;
  is_deleted?: boolean;
}
export interface Section {
  id: string;
  name: string;
  project_id: string;
  is_deleted?: boolean;
}
export interface Fields {
  content: string;
  checked: boolean;
  due: Due | null;
  priority: number;
  project_id: string;
  labels: string[];
  parent_id: string | null;
}
export const fieldKeys = [
  "content",
  "checked",
  "due",
  "priority",
  "project_id",
  "labels",
  "parent_id",
] as const;
export type Field = (typeof fieldKeys)[number];
export interface Command {
  type:
    | "item_add"
    | "item_update"
    | "item_close"
    | "item_uncomplete"
    | "item_move";
  uuid: string;
  temp_id?: string;
  args: Record<string, unknown>;
}
export interface Operation {
  command: Command;
  attempts: number;
  nextAt: number;
  error?: string;
  target?: string;
  base?: Fields;
  desired?: Fields;
  source?: string;
  sourceAnchor?: string;
  expectedDescription?: string;
  noteBaseline?: Fields;
}
export interface Conflict {
  id: string;
  local: Fields;
  remote: Fields;
  base: Fields;
  fields: Field[];
}
export interface Preset {
  id: string;
  name: string;
  content: string;
  description: string;
  priority: number;
  projectId: string;
  folder: string;
  noteTemplate: string;
  subtasks: string[];
  masterId?: string;
  archived?: boolean;
}
export interface Settings {
  secretName: string;
  interval: number;
  marker: string;
  folders: string[];
  defaultProject: string;
  filter: string;
  timezone: string;
  scopedSync: boolean;
  smartDefaults: boolean;
  dailyHeading: string;
  dailyFolder: string;
  dailyFormat: string;
  workStart: string;
  workEnd: string;
  lunchStart: string;
  lunchEnd: string;
  holidays: boolean;
  presets: Preset[];
}
export interface State {
  schema: 1;
  accountId?: string;
  settings: Settings;
  token: string;
  tasks: Record<string, Task>;
  projects: Record<string, Project>;
  sections: Record<string, Section>;
  bases: Record<string, Fields>;
  queue: Operation[];
  conflicts: Record<string, Conflict>;
  links: Record<string, { path: string; anchor?: string }>;
  lastSync: number;
}
export function initialState(): State {
  return {
    schema: 1,
    settings: {
      secretName: "flowstitch-todoist",
      interval: 60,
      marker: "#todoist",
      folders: [],
      defaultProject: "",
      filter: "#Work & (today | overdue)",
      timezone: "Europe/London",
      scopedSync: false,
      smartDefaults: true,
      dailyHeading: "Today's Tasks",
      dailyFolder: "",
      dailyFormat: "YYYY-MM-DD",
      workStart: "09:00",
      workEnd: "17:30",
      lunchStart: "12:00",
      lunchEnd: "13:00",
      holidays: false,
      presets: [
        {
          id: "website-news",
          name: "Website News",
          content: "Website news: {{title}}",
          description: "{{notes}}",
          priority: 1,
          projectId: "",
          folder: "",
          noteTemplate:
            "# {{title}}\n\n{{notes}}\n\n```flowstitch\nview: related\n```\n",
          subtasks: [],
        },
      ],
    },
    token: "*",
    tasks: {},
    projects: {},
    sections: {},
    bases: {},
    queue: [],
    conflicts: {},
    links: {},
    lastSync: 0,
  };
}
export function fields(task: Task): Fields {
  return {
    content: task.content,
    checked: task.checked,
    due: task.due,
    priority: task.priority,
    project_id: task.project_id,
    labels: [...task.labels].sort(),
    parent_id: task.parent_id,
  };
}
export const equal = (a: unknown, b: unknown): boolean =>
  stable(a) === stable(b);
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => stable(v)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([ka], [kb]) => (ka < kb ? -1 : ka > kb ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export const uuid = (): string => crypto.randomUUID();
