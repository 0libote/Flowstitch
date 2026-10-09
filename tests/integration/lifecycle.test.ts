// @vitest-environment jsdom
import { it, expect } from "vitest";
import type { App, PluginManifest } from "obsidian";
import Flowstitch from "../../src/main";
import { commands } from "../obsidian-stub";
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
