import { Hono } from "hono";
import { z } from "zod";
import { listInbox, markRead, unreadCount } from "../inbox";
import { requireUser, type AppEnv } from "../middleware";

/** Your inbox: mentions, replies and tasks that concern you. */
export const inbox = new Hono<AppEnv>()
  .use(requireUser)

  /** `?unread=1`: unread only. */
  .get("/", async (c) => {
    const me = c.get("user").id;
    const [items, unread] = await Promise.all([listInbox(me, { unread: c.req.query("unread") === "1" }), unreadCount(me)]);
    return c.json({ items, unread });
  })

  /** Marks some notifications read (or unread with `read: false`), or every unread one without `ids`. */
  .post("/read", async (c) => {
    const body = z
      .object({ ids: z.array(z.string().min(1)).min(1).max(200).optional(), read: z.boolean().default(true) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    await markRead(c.get("user").id, body.data);
    return c.body(null, 204);
  });
