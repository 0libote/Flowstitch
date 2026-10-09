import { it, expect } from "vitest";
import {
  prepare,
  scan,
  patch,
  insertDaily,
  uri,
} from "../../src/notes/markdown";
import { reconcile } from "../../src/sync/reconcile";
import { initialState } from "../../src/types";
it("ignores frontmatter, fenced tasks and foreign integrations", () => {
  const input =
    "---\n- [ ] yaml #todoist\n---\n```md\n- [ ] example #todoist\n```\n~~~\n- [ ] example #todoist\n~~~\n- [ ] Foreign #todoist <!-- todoist-id:abc -->\n- [ ] Actual #todoist";
  expect(scan(input, "#todoist", "").map((t) => t.value.content)).toEqual([
    "Actual",
  ]);
});
it("preserves indentation, CRLF, links, tags and Tasks/Dataview suffixes", () => {
  const text =
    "  - [ ] Read [[Supplier]] #work #todoist 📅 2026-10-09 [owner:: me]\r\nParagraph\r\n";
  const prepared = prepare(text, "#todoist", "work");
  const line = scan(prepared, "#todoist", "work")[0]!;
  expect(line.value.content).toBe("Read [[Supplier]] #work");
  const next = patch(
    prepared,
    line,
    { ...line.value, checked: true },
    "abc",
    "#todoist",
  );
  expect(next).toContain(
    "  - [x] Read [[Supplier]] #work #todoist 📅 2026-10-09 [owner:: me]\r\n",
  );
  expect(next).toContain("Paragraph\r\n");
});
it("rejects stale writes, duplicate identities and multiline titles", () => {
  const text = prepare("- [ ] Task #todoist", "#todoist", "");
  const line = scan(text, "#todoist", "")[0]!;
  expect(() =>
    patch(text.replace("Task", "Edit"), line, line.value, "id", "#todoist"),
  ).toThrow();
  expect(() =>
    patch(text + "\n" + text, line, line.value, "id", "#todoist"),
  ).toThrow();
  expect(() =>
    patch(text, line, { ...line.value, content: "A\nB" }, "id", "#todoist"),
  ).toThrow();
});
it("inserts daily view without rewriting user content and is idempotent", () => {
  const text = "# Daily\n\n## Today's Tasks\nUser content\n## Notes\nPrivate";
  const next = insertDaily(text, "Today's Tasks");
  expect(next).toContain("User content\n## Notes\nPrivate");
  expect(insertDaily(next, "Today's Tasks")).toBe(next);
  expect(scan(next, "#todoist", "")).toEqual([]);
});
it("URI encodes vault, note and heading without filesystem paths", () => {
  expect(uri("My vault", "Suppliers/A.md", "Prices")).toBe(
    "obsidian://open?vault=My%20vault&file=Suppliers%2FA.md%23Prices",
  );
});
it("initial preset creates no remote routines or templates", () => {
  const s = initialState();
  expect(s.queue).toEqual([]);
  expect(s.settings.presets[0]?.subtasks).toEqual([]);
});
it("merges fields independently and flags concurrent title changes", () => {
  const value = scan("- [ ] Task #todoist", "#todoist", "")[0]!.value;
  expect(
    reconcile(value, { ...value, content: "Local" }, { ...value, priority: 4 })
      .merged,
  ).toMatchObject({ content: "Local", priority: 4 });
  expect(
    reconcile(
      value,
      { ...value, content: "Local" },
      { ...value, content: "Remote" },
    ).conflicts,
  ).toEqual(["content"]);
});
it("completion preserves original whitespace and marker position", () => {
  const original = "\t- [ ] Request  #todoist   [[Supplier]] <!-- keep -->";
  const text = prepare(original, "#todoist", "work");
  const line = scan(text, "#todoist", "work")[0]!;
  expect(
    patch(text, line, { ...line.value, checked: true }, "id", "#todoist").split(
      "\n",
    )[0],
  ).toBe(original.replace("[ ]", "[x]"));
});
