import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { db, schema } from "./db";
import { listConversations } from "./conversations";

describe.skipIf(process.env.AGORA_DB_TESTS !== "1")("conversation list against PostgreSQL", () => {
  const prefix = crypto.randomUUID();
  const me = `${prefix}-me`, other = `${prefix}-other`;
  const visible = `${prefix}-visible`, own = `${prefix}-own`, events = `${prefix}-events`, hidden = `${prefix}-hidden`, empty = `${prefix}-empty`;
  const conversationIds = [visible, own, events, hidden, empty];
  let migrated = false;
  const at = (seconds: number) => new Date(Date.UTC(2026, 9, 26, 12, 0, seconds));

  beforeAll(async () => {
    const result = await db.execute<{ name: string }>(sql`select current_database() as name`);
    if (result[0]?.name !== "agora_test") throw new Error("Database tests require an isolated database named agora_test");
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
    migrated = true;
    await db.insert(schema.user).values([{ id: me, name: "Me", email: `${me}@example.invalid` }, { id: other, name: "Other", email: `${other}@example.invalid` }]);
    await db.insert(schema.conversation).values(conversationIds.map((id) => ({ id, kind: "group" as const, createdBy: me })));
    await db.insert(schema.conversationMember).values(conversationIds.map((conversationId) => ({ conversationId, userId: conversationId === hidden ? other : me, lastReadAt: at(1) })));
    await db.insert(schema.message).values([
      { id: `${prefix}-incoming`, conversationId: visible, kind: "user", authorUserId: other, text: "incoming", createdAt: at(2) },
      { id: `${prefix}-a`, conversationId: visible, kind: "user", authorUserId: me, text: "same-date-a", createdAt: at(3) },
      { id: `${prefix}-b`, conversationId: visible, kind: "user", authorUserId: me, text: "same-date-b", createdAt: at(3) },
      { id: `${prefix}-own-message`, conversationId: own, kind: "user", authorUserId: me, text: "mine", createdAt: at(4) },
      { id: `${prefix}-event`, conversationId: events, kind: "event", text: "event", createdAt: at(5) },
      { id: `${prefix}-hidden-message`, conversationId: hidden, kind: "user", authorUserId: other, text: "hidden", createdAt: at(6) },
    ]);
  }, 60_000);
  afterAll(async () => {
    try {
      if (migrated) {
        await db.delete(schema.conversation).where(inArray(schema.conversation.id, conversationIds));
        await db.delete(schema.user).where(inArray(schema.user.id, [me, other]));
      }
    } finally { await db.$client.end(); }
  }, 30_000);

  test("only accessible conversations are returned, including empty ones", async () => {
    const ids = (await listConversations(me)).map((c) => c.id);
    expect(ids).toContain(empty);
    expect(ids).toContain(visible);
    expect(ids).not.toContain(hidden);
  });
  test("the latest message has a stable tie break and a decoded UTC date", async () => {
    const row = (await listConversations(me)).find((c) => c.id === visible)!;
    expect(row.preview?.text).toBe("same-date-b");
    expect(row.lastAt).toEqual(at(3));
  });
  test("an unread incoming message stays unread even when a newer message is ours", async () => {
    const rows = await listConversations(me);
    expect(rows.find((c) => c.id === visible)?.unread).toBe(true);
    expect(rows.find((c) => c.id === own)?.unread).toBe(false);
    expect(rows.find((c) => c.id === events)?.unread).toBe(false);
  });
  test("marking the conversation read clears unread state", async () => {
    await db.update(schema.conversationMember).set({ lastReadAt: at(10) }).where(eq(schema.conversationMember.conversationId, visible));
    expect((await listConversations(me)).find((c) => c.id === visible)?.unread).toBe(false);
  });
});
