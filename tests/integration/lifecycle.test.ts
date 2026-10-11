// @vitest-environment jsdom
import { it, expect } from "vitest";
import type { App, PluginManifest } from "obsidian";
import Flowstitch from "../../src/main";
import { commands, TFile } from "../obsidian-stub";
import "../dom-setup";
it("registers functional command entrypoints and disposes listeners/commands on reload", async () => {
  let events = 0;
  const on = () => {
    events++;
    return {
      off: () => {
        events--;
      },
    };
  };
  const local = new Map<string, unknown>();
  const app = {
    vault: { getName: () => "Test", on, configDir: ".obsidian" },
    workspace: { on, onLayoutReady: () => {} },
    secretStorage: { getSecret: () => null },
    loadLocalStorage: (key: string) => local.get(key),
    saveLocalStorage: (key: string, value: unknown) => local.set(key, value),
  } as unknown as App;
  const manifest = {
    id: "flowstitch",
    name: "Flowstitch",
    version: "0.1.0",
    minAppVersion: "1.11.4",
    author: "Test",
    description: "Test.",
  } as PluginManifest;
  const plugin = new Flowstitch(app, manifest);
  await plugin.onload();
  expect(commands.map((c) => c.id)).toEqual(
    expect.arrayContaining([
      "open-dashboard",
      "open-sidebar",
      "quick-capture",
      "connect",
      "sync-now",
      "diagnostics",
      "link-current-line",
      "capture-selection",
      "insert-daily-view",
      "open-daily-note",
      "end-of-day",
      "snapshot-completed",
    ]),
  );
  expect(commands.every((c) => !!c.callback || !!c.editorCallback)).toBe(true);
  expect(events).toBeGreaterThan(0);
  plugin.setWriter(true);
  expect(plugin.canWrite()).toBe(true);
  plugin.unload();
  expect(events).toBe(0);
  expect(commands).toHaveLength(0);
  expect(plugin.canWrite()).toBe(false);
  const reloaded = new Flowstitch(app, manifest);
  await reloaded.onload();
  expect(commands).toHaveLength(14);
  reloaded.unload();
  expect(events).toBe(0);
});

it("scopes reindexing to linked notes, active note, and opted folders", async () => {
  const local = new Map<string, unknown>();
  const files = new Map<string, TFile>();
  const contents = new Map<string, string>();
  const folders = new Map<string, { children: unknown[]; path: string }>();

  const createFile = (path: string, text: string) => {
    const f = new TFile(path);
    f.extension = path.split(".").pop() ?? "";
    files.set(path, f);
    contents.set(path, text);
    return f;
  };

  createFile(
    "linked.md",
    '- [ ] Task 1 <!-- flowstitch:{"key":"k1","id":"t1"} -->\n',
  );
  const activeFile = createFile("active.MD", "- [ ] Active task #todoist\n");
  const optedFile = createFile("work/sub/nested.md", "- [ ] Folder task\n");
  const uppercaseFile = createFile(
    "work/sub/uppercase.MD",
    "- [ ] Uppercase task\n",
  );
  createFile("other/ignored.md", "- [ ] Ignored task #todoist\n");
  const missingPath = "missing.md";

  folders.set("work", {
    path: "work",
    children: [
      {
        path: "work/sub",
        children: [optedFile, uppercaseFile],
      },
    ],
  });

  const on = () => ({ off: () => {} });
  const app = {
    vault: {
      getName: () => "Test",
      on,
      configDir: ".obsidian",
      getFileByPath: (p: string) => files.get(p) ?? null,
      getAbstractFileByPath: (p: string) =>
        folders.get(p) ?? files.get(p) ?? null,
      cachedRead: async (f: TFile) => contents.get(f.path) ?? "",
    },
    workspace: {
      on,
      onLayoutReady: () => {},
      getActiveFile: () => activeFile,
      getActiveViewOfType: () => null,
    },
    secretStorage: { getSecret: () => null },
    loadLocalStorage: (key: string) => local.get(key),
    saveLocalStorage: (key: string, value: unknown) => local.set(key, value),
  } as unknown as App;

  const manifest = {
    id: "flowstitch",
    name: "Flowstitch",
    version: "0.1.2",
    minAppVersion: "1.11.4",
    author: "Test",
    description: "Test.",
  } as PluginManifest;

  const plugin = new Flowstitch(app, manifest);
  plugin.state.settings.folders = ["work"];
  plugin.state.links = {
    t1: { path: "linked.md" },
    t_missing: { path: missingPath },
    "pending:temp-123": { path: "real-todoist-id-999" },
  };

  (plugin as unknown as { index: Set<string> }).index.add(missingPath);

  await plugin.reindex();

  const indexedPaths = Array.from(
    (plugin as unknown as { index: Set<string> }).index,
  );
  expect(indexedPaths).toContain("linked.md");
  expect(indexedPaths).toContain("active.MD");
  expect(indexedPaths).toContain("work/sub/nested.md");
  expect(indexedPaths).toContain("work/sub/uppercase.MD");
  expect(indexedPaths).not.toContain("other/ignored.md");
  expect(indexedPaths).not.toContain("missing.md");
  expect(indexedPaths).not.toContain("real-todoist-id-999");
});
