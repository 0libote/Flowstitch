import { it, expect } from "vitest";
import { TodoistClient, ApiError, parseTask } from "../../src/api/client";
const raw = { id: "abc", content: "Title", project_id: "work", checked: false };
it("uses v1 POST form sync and stable UUIDs; does not log secrets", async () => {
  let seen: Record<string, unknown> = {};
  const api = new TodoistClient(
    async (r) => {
      seen = r;
      return {
        status: 200,
        headers: {},
        json: { sync_token: "next", items: [raw], projects: [], sections: [] },
      };
    },
    () => "token",
  );
  await api.sync("*", [
    { type: "item_close", uuid: "stable", args: { id: "abc" } },
  ]);
  expect(seen.url).toBe("https://api.todoist.com/api/v1/sync");
  expect(seen.method).toBe("POST");
  expect(new URLSearchParams(String(seen.body)).get("commands")).toContain(
    "stable",
  );
});
it("rejects batches above official limit", async () => {
  const api = new TodoistClient(
    async () => {
      throw Error("should not call");
    },
    () => "token",
  );
  await expect(
    api.sync(
      "*",
      Array.from({ length: 101 }, () => ({
        type: "item_close" as const,
        uuid: "id",
        args: { id: "abc" },
      })),
    ),
  ).rejects.toThrow("limit");
});
it("honours Retry-After without leaking server body", async () => {
  const api = new TodoistClient(
    async () => ({
      status: 429,
      headers: { "Retry-After": "60" },
      json: { token: "secret", note: "private" },
    }),
    () => "token",
  );
  try {
    await api.sync("*");
    throw Error("expected failure");
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).retryAfter).toBe(60000);
    expect((e as Error).message).not.toContain("private");
  }
});
it("does not call transport with missing credentials", async () => {
  const api = new TodoistClient(
    async () => {
      throw Error("should not call");
    },
    () => null,
  );
  await expect(api.sync("*")).rejects.toMatchObject({ status: 401 });
});
it("paginates history items and marks occurrences completed", async () => {
  let calls = 0;
  const api = new TodoistClient(
    async (r) => {
      calls++;
      expect(r.url).toContain("/api/v1/tasks/completed/by_completion_date");
      return {
        status: 200,
        headers: {},
        json: {
          items: [{ ...raw, id: String(calls) }],
          next_cursor: calls === 1 ? "next" : null,
        },
      };
    },
    () => "token",
  );
  const tasks = await api.completed("since", "until");
  expect(calls).toBe(2);
  expect(tasks.every((t) => t.checked)).toBe(true);
});
it("rejects malformed tasks and repeated pagination cursors", async () => {
  expect(() => parseTask({ content: "Missing id" })).toThrow();
  const api = new TodoistClient(
    async () => ({
      status: 200,
      headers: {},
      json: { results: [raw], next_cursor: "same" },
    }),
    () => "token",
  );
  await expect(api.filter("today")).rejects.toThrow("cursor");
});
