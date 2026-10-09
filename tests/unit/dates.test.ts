import { it, expect } from "vitest";
import { zonedDateTime, rescheduleDue, validDate } from "../../src/notes/dates";
import { dateKey, taskDate, template } from "../../src/ui/helpers";
it("converts London wall clocks across spring and autumn DST", () => {
  expect(zonedDateTime("2026-03-28", "13:30", "Europe/London")).toBe(
    "2026-03-28T13:30:00.000Z",
  );
  expect(zonedDateTime("2026-03-29", "13:30", "Europe/London")).toBe(
    "2026-03-29T12:30:00.000Z",
  );
  expect(zonedDateTime("2026-10-25", "13:30", "Europe/London")).toBe(
    "2026-10-25T13:30:00.000Z",
  );
});
it("rejects nonexistent and ambiguous wall clocks", () => {
  expect(() => zonedDateTime("2026-03-29", "01:30", "Europe/London")).toThrow(
    "does not exist",
  );
  expect(() => zonedDateTime("2026-10-25", "01:30", "Europe/London")).toThrow(
    "ambiguous",
  );
  expect(validDate("2026-02-30")).toBe(false);
});
it("retains recurrence and floating times without UTC conversion", () => {
  expect(
    rescheduleDue(
      {
        date: "2026-03-28T13:30:00",
        string: "every day",
        is_recurring: true,
        timezone: null,
      },
      "2026-03-29",
      "Europe/London",
    ),
  ).toEqual({
    date: "2026-03-29T13:30:00",
    string: "every day",
    is_recurring: true,
    timezone: null,
  });
});
it("reschedules fixed time at same local hour across DST", () => {
  expect(
    rescheduleDue(
      {
        date: "2026-03-28T13:30:00Z",
        string: "every day",
        is_recurring: true,
        timezone: "Europe/London",
      },
      "2026-03-29",
      "Europe/London",
    ).date,
  ).toBe("2026-03-29T12:30:00.000Z");
});
it("groups fixed dates in London but preserves floating dates", () => {
  expect(taskDate("2026-07-10T23:30:00Z", "Europe/London")).toBe("2026-07-11");
  expect(taskDate("2026-07-10T23:30:00", "Europe/London")).toBe("2026-07-10");
  expect(dateKey(new Date("2026-07-10T23:30:00Z"), "Europe/London")).toBe(
    "2026-07-11",
  );
});
it("template substitution creates copies and executes no code", () => {
  const source = "Website news: {{title}}";
  expect(template(source, { title: "Article" })).toBe("Website news: Article");
  expect(source).toBe("Website news: {{title}}");
  expect(template("{{notes}}", { notes: "<script>bad</script>" })).toBe(
    "<script>bad</script>",
  );
});
