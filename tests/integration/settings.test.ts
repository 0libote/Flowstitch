// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from "vitest";
import { Setting, type App } from "obsidian";
import Flowstitch, { FlowstitchSettings } from "../../src/main";
import { initialState } from "../../src/types";
import { safeNoteName } from "../../src/ui/helpers";
import "../dom-setup";
import { setApiVersion, notices } from "../obsidian-stub";
beforeEach(() => setApiVersion("1.11.4"));

function setup() {
  const state = initialState();
  state.projects = { work: { id: "work", name: "Work" } };
  let writer = false;
  const fake = {
    state,
    save: vi.fn(async () => {}),
    reindex: vi.fn(async () => {}),
    restartTimer: vi.fn(),
    connect: vi.fn(),
    canWrite: () => writer,
    setWriter: vi.fn((value: boolean) => {
      writer = value;
    }),
    engine: { emit: vi.fn() },
  };
  const tab = new FlowstitchSettings({} as App, fake as unknown as Flowstitch);
  const definitions = () =>
    tab.getSettingDefinitions().flatMap((group) => group.items ?? []);
  const render = (name: string) => {
    const def = definitions().find(
      (item) => "name" in item && item.name === name,
    );
    expect(def?.render).toBeTypeOf("function");
    const parent = document.createElement("div");
    expect(def!.render(new Setting(parent))).toBeUndefined();
    return parent;
  };
  return { tab, fake, definitions, render };
}

it("exposes searchable settings without side effects and shares every row with the legacy screen", () => {
  const { tab, fake, definitions } = setup();
  const names = definitions().map((item) => ("name" in item ? item.name : ""));
  expect(names).toEqual(
    expect.arrayContaining([
      "Connect Todoist",
      "Opt-in marker",
      "Timezone",
      "Default project",
      "Holiday assistant",
    ]),
  );
  expect(new Set(names).size).toBe(names.length);
  expect(fake.save).not.toHaveBeenCalled();
  tab.display();
  const rendered = [
    ...tab.containerEl.querySelectorAll(".setting-item-name"),
  ].map((el) => el.textContent);
  expect(
    rendered.filter(
      (name) => name !== "Synchronisation" && name !== "Daily planning",
    ),
  ).toEqual(names);
});

it("refreshes writing controls on legacy hosts and calls update on modern hosts", () => {
  const { tab, fake, render } = setup();
  const legacyToggle = render("Enable writing on this device").querySelector(
    "input",
  )!;
  legacyToggle.checked = true;
  legacyToggle.dispatchEvent(new Event("change"));
  expect(fake.setWriter).toHaveBeenCalledWith(true);
  expect(
    tab.containerEl.querySelector<HTMLInputElement>('input[type="checkbox"]')
      ?.checked,
  ).toBe(true);
  setApiVersion("1.13.0");
  const update = vi.fn();
  Object.assign(tab, { update });
  const modernToggle = render("Enable writing on this device").querySelector(
    "input",
  )!;
  modernToggle.checked = false;
  modernToggle.dispatchEvent(new Event("change"));
  expect(fake.setWriter).toHaveBeenLastCalledWith(false);
  expect(update).toHaveBeenCalledOnce();
});

it("declarative controls validate markers and refresh the Markdown index after saving", async () => {
  const { fake, render } = setup();
  const input = render("Opt-in marker").querySelector("input")!;
  input.value = "not-a-marker";
  input.dispatchEvent(new Event("input"));
  expect(fake.save).not.toHaveBeenCalled();
  input.value = "#flow/task";
  input.dispatchEvent(new Event("input"));
  await vi.waitFor(() => expect(fake.reindex).toHaveBeenCalledOnce());
  expect(fake.state.settings.marker).toBe("#flow/task");
  const select = render("Default project").querySelector("select")!;
  select.value = "work";
  select.dispatchEvent(new Event("change"));
  await vi.waitFor(() =>
    expect(fake.state.settings.defaultProject).toBe("work"),
  );
});

it("accepts only known string project IDs from loosely typed frontmatter", () => {
  const state = initialState();
  state.projects = { work: { id: "work", name: "Work" } };
  let property: unknown = "work";
  const app = {
    vault: { getFileByPath: () => ({}) },
    metadataCache: {
      getFileCache: () => ({ frontmatter: { "flowstitch-project": property } }),
    },
  } as unknown as App;
  const plugin = new Flowstitch(app, {
    id: "flowstitch",
  } as Flowstitch["manifest"]);
  plugin.state = state;
  expect(plugin.contextProject("Projects/Work.md")).toBe("work");
  for (property of [{ id: "work" }, ["work"], 1, null, "missing"]) {
    expect(plugin.contextProject("Projects/Work.md")).toBe("");
  }
});

it("removes both Markdown brackets and unsafe filename characters from note names", () => {
  expect(safeNoteName('Article [draft] / part\\two: "three" #tag')).toBe(
    "Article  draft    part two   three   tag",
  );
  expect(() => safeNoteName("[]")).toThrow("valid note title");
});

it("reports rejected asynchronous setting saves without leaking error contents", async () => {
  const { fake, render } = setup();
  fake.save.mockRejectedValueOnce(new Error("confidential vault information"));
  const input = render("Live view heading").querySelector("input")!;
  input.value = "My day";
  input.dispatchEvent(new Event("input"));
  await vi.waitFor(() =>
    expect(notices[notices.length - 1]).toContain(
      "could not save this setting",
    ),
  );
  expect(notices[notices.length - 1]).not.toContain("confidential");
});
