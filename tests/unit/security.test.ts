import { it, expect } from "vitest";
import { scan, uri } from "../../src/notes/markdown";
import { parseProject, parseSection } from "../../src/api/client";
import {
  resolveVaultPath,
  sanitizeSnapshotContent,
  safeNoteName,
  isValidAnchor,
  isValidHolidayEvents,
  truncateDisplay,
  truncateUi,
} from "../../src/ui/helpers";

it("ignores flowstitch metadata with invalid types", () => {
  const badPriority =
    '- [ ] Task #todoist\n<!-- flowstitch:{"key":"k1","priority":99} -->';
  expect(scan(badPriority, "#todoist", "")).toEqual([]);
  const badDue =
    '- [ ] Task #todoist\n<!-- flowstitch:{"key":"k2","due":{"date":"not-a-date"}} -->';
  expect(scan(badDue, "#todoist", "")).toEqual([]);
  const badLabels =
    '- [ ] Task #todoist\n<!-- flowstitch:{"key":"k3","labels":"nope"} -->';
  expect(scan(badLabels, "#todoist", "")).toEqual([]);
  const badParent =
    '- [ ] Task #todoist\n<!-- flowstitch:{"key":"k4","parent_id":42} -->';
  expect(scan(badParent, "#todoist", "")).toEqual([]);
  const badProject =
    '- [ ] Task #todoist\n<!-- flowstitch:{"key":"k5","project_id":7} -->';
  expect(scan(badProject, "#todoist", "")).toEqual([]);
  const good =
    '- [ ] Task #todoist\n<!-- flowstitch:{"key":"k6","priority":4,"project_id":"work","labels":["a"],"parent_id":null,"due":null} -->';
  expect(scan(good, "#todoist", "").map((t) => t.key)).toEqual(["k6"]);
});

it("encodes parentheses in note URIs", () => {
  const link = uri("vault", "a(b).md", "h(1)");
  expect(link).toContain("%28");
  expect(link).toContain("%29");
  expect(link).not.toContain("(");
  expect(link).not.toContain(")");
});

it("validates GOV.UK holiday payload shape", () => {
  expect(
    isValidHolidayEvents([{ date: "2026-05-25" }, { date: "2026-12-25" }]),
  ).toBe(true);
  expect(isValidHolidayEvents(undefined)).toBe(false);
  expect(isValidHolidayEvents({})).toBe(false);
  expect(isValidHolidayEvents([{ date: "25 May" }])).toBe(false);
  expect(isValidHolidayEvents([{ date: "2026-13-40" }])).toBe(false);
  expect(isValidHolidayEvents([{ noDate: true }])).toBe(false);
});

it("rejects vault path traversal and unsafe segments", () => {
  expect(() => resolveVaultPath("../outside")).toThrow();
  expect(() => resolveVaultPath("a/../../b")).toThrow();
  expect(() => resolveVaultPath("/absolute")).toThrow();
  expect(() => resolveVaultPath("a//b")).toThrow();
  expect(() => resolveVaultPath(".")).toThrow();
  expect(() => resolveVaultPath("a/./b")).toThrow();
  expect(() => resolveVaultPath("bad|name")).toThrow();
  expect(resolveVaultPath("Notes/Daily")).toBe("Notes/Daily");
  expect(resolveVaultPath("")).toBe("");
});

it("sanitizes remote snapshot content", () => {
  expect(sanitizeSnapshotContent("- [ ] sneaky #todoist")).not.toContain(
    "#todoist",
  );
  expect(sanitizeSnapshotContent("hi <!-- inject -->")).not.toContain("<!--");
  expect(sanitizeSnapshotContent("- [x] boxed")).toBe("boxed");
  expect(sanitizeSnapshotContent("a\r\nb")).toBe("a b");
});

it("strips unicode controls from note names and validates anchors", () => {
  expect(safeNoteName("a\u202Eb")).toBe("ab");
  expect(safeNoteName("  ok  ")).toBe("ok");
  expect(isValidAnchor("Prices")).toBe(true);
  expect(isValidAnchor("^supplier-1")).toBe(true);
  expect(isValidAnchor("bad\nanchor")).toBe(false);
  expect(isValidAnchor("a#b")).toBe(false);
  expect(isValidAnchor("<!--x-->")).toBe(false);
});

it("validates projects and sections and truncates display", () => {
  expect(() => parseProject({ name: "No id" })).toThrow();
  expect(() => parseSection({ id: "s", name: "No project" })).toThrow();
  expect(parseProject({ id: "p", name: "Work" }).name).toBe("Work");
  expect(
    parseSection({ id: "s", name: "Sec", project_id: "p" }).project_id,
  ).toBe("p");
  expect(truncateDisplay("x".repeat(100), 70).length).toBeLessThanOrEqual(70);
  expect(truncateUi("y".repeat(100), 80).length).toBeLessThanOrEqual(80);
});
