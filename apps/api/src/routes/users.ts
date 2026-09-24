import { and, asc, eq, ne, or, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { requireUser, type AppEnv } from "../middleware";
import { currentTaskOf } from "../tasks";

const { user, userAvatar } = schema;

export const users = new Hono<AppEnv>()
  .use(requireUser)

  /** Colleagues to message: every employee in the app, except yourself and banned accounts. */
  .get("/", async (c) => {
    const rows = await db
      .select({ id: user.id, name: user.name, image: user.image, username: user.username, title: user.title })
      .from(user)
      .where(and(ne(user.id, c.get("user").id), or(isNull(user.banned), eq(user.banned, false))))
      .orderBy(asc(user.name));
    return c.json(rows);
  })

  /** Public profile, shown to every colleague (with the person's tasks). */
  .get("/:id", async (c) => {
    const [row] = await db
      .select({ id: user.id, name: user.name, image: user.image, username: user.username, title: user.title, bio: user.bio, email: user.email, createdAt: user.createdAt })
      .from(user)
      .where(eq(user.id, c.req.param("id")));
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ ...row, currentTask: await currentTaskOf(row.id) });
  })

  /** Profile photo; the URL changes with every new photo, hence the long cache. */
  .get("/:id/avatar", async (c) => {
    const [row] = await db.select().from(userAvatar).where(eq(userAvatar.userId, c.req.param("id")));
    if (!row) return c.json({ error: "not_found" }, 404);
    return new Response(new Uint8Array(row.data), {
      headers: { "Content-Type": row.mime, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  });
