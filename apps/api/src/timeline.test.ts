import { expect, test } from "bun:test";
import { conversationTimeline } from "@agora/core";

const message = (id: string, createdAt: string, turn?: { id: string; startedAt: string }) => ({ id, createdAt, data: turn ? { turn } : null });
const a = { turnId: "a", startedAt: "2026-10-26T12:00:01.000Z" };
const b = { turnId: "b", startedAt: "2026-10-26T12:00:02.000Z" };
const user = message("user", "2026-10-26T12:00:00.000Z");
const keys = (messages: ReturnType<typeof message>[], turns: typeof a[]) => conversationTimeline(messages, turns).map((e) => e.key);
const finalA = message("reply-a", "2026-10-26T12:00:10.000Z", { id: "a", startedAt: a.startedAt });
const finalB = message("reply-b", "2026-10-26T12:00:03.000Z", { id: "b", startedAt: b.startedAt });

test("a short reply finishing before a long one never swaps their places", () => {
  const expected = ["message:user", "turn:a", "turn:b"];
  expect(keys([user], [a, b])).toEqual(expected);
  expect(keys([user, finalB], [a, b])).toEqual(expected);
  expect(keys([user, finalB], [a])).toEqual(expected);
  expect(keys([user, finalB, finalA], [])).toEqual(expected);
});
test("REST reload and reversed event arrival keep the same chronology", () => {
  expect(keys([finalB, user, finalA], [])).toEqual(keys([user], [b, a]));
});
test("an intervening human message keeps its place after the reply that was already streaming", () => {
  const other = message("other", "2026-10-26T12:00:01.500000Z");
  expect(keys([user, other], [a])).toEqual(keys([user, other, finalA], []));
});
test("legacy history and turns without metadata still render without duplicates or errors", () => {
  expect(conversationTimeline([user], [{ turnId: "legacy" }]).map((e) => e.key)).toEqual(["message:user", "turn:legacy"]);
});
