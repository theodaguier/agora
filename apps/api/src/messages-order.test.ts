import { expect, test } from "bun:test";
import { insertMessage, mergeMessages, removeMessage } from "@agora/core";

const a = { id: "a", createdAt: "2026-10-26T12:00:00.123000Z" };
const b = { id: "b", createdAt: a.createdAt };
const ids = (rows: typeof a[]) => rows.map((m) => m.id);

test("equal timestamps use the same id order regardless of event arrival", () => {
  expect(ids([a, b].reduce<typeof a[]>(insertMessage, []))).toEqual(["a", "b"]);
  expect(ids([b, a].reduce<typeof a[]>(insertMessage, []))).toEqual(["a", "b"]);
});

test("Postgres microseconds survive ordering, including older millisecond responses", () => {
  const earlier = { ...b, createdAt: "2026-10-26T12:00:00.123Z" };
  const later = { ...a, createdAt: "2026-10-26T12:00:00.123001Z" };
  expect(ids(insertMessage([later], earlier))).toEqual(["b", "a"]);
});

test("a stale refetch retains equal-date and out-of-order messages streamed after it started", () => {
  expect(ids(mergeMessages([a], [a, b], [a]))).toEqual(["a", "b"]);
  const earlier = { ...b, createdAt: "2026-10-26T12:00:00.122999Z" };
  expect(ids(mergeMessages([a], [earlier, a], [a]))).toEqual(["b", "a"]);
  expect(ids(mergeMessages([a], [a, b]))).toEqual(["a", "b"]);
});

test("a stale refetch cannot resurrect a message deleted while it was in flight", () => {
  expect(ids(mergeMessages([a, b], removeMessage([a, b], b.id), [a, b]))).toEqual(["a"]);
});

test("an authoritative refetch still removes messages already absent on the server", () => {
  expect(ids(mergeMessages([a], [a, b], [a, b]))).toEqual(["a"]);
  expect(mergeMessages([], [a], [a])).toEqual([]);
});

test("stream duplicates are ignored without changing the cached array", () => {
  const cached = [a];
  expect(insertMessage(cached, a)).toBe(cached);
});
