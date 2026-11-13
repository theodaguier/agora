import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { requireUser, type AppEnv } from "../middleware";

const { attachment, conversationMember } = schema;

/** The attachment, only for a member of its conversation. */
async function memberAttachment(id: string, userId: string) {
  const [row] = await db
    .select({ attachment })
    .from(attachment)
    .innerJoin(conversationMember, eq(conversationMember.conversationId, attachment.conversationId))
    .where(and(eq(attachment.id, id), eq(conversationMember.userId, userId)));
  return row;
}

/** What the document editor can write back: text and Word documents, never a binary of another kind. */
const EDITABLE = /\.(docx|md|markdown|txt)$/i;

/** Serves an attachment back, only to a member of its conversation. `?download` forces a download. */
export const attachments = new Hono<AppEnv>()
  .use(requireUser)
  /**
   * A document edited in the app: its file is rewritten in place, so the bot that made it reads the
   * new version at the same path. The body is the whole file, raw.
   */
  .put("/:id", async (c) => {
    const row = await memberAttachment(c.req.param("id"), c.get("user").id);
    if (!row) return c.json({ error: "not_found" }, 404);
    if (!EDITABLE.test(row.attachment.name)) return c.json({ error: "not_editable" }, 400);
    const body = await c.req.arrayBuffer();
    const file = Bun.file(row.attachment.path);
    if (!(await file.exists())) return c.json({ error: "not_found" }, 404);
    await Bun.write(file, body);
    await db.update(attachment).set({ size: body.byteLength }).where(eq(attachment.id, row.attachment.id));
    return c.json({ size: body.byteLength });
  })
  .get("/:id", async (c) => {
    const row = await memberAttachment(c.req.param("id"), c.get("user").id);
    if (!row) return c.json({ error: "not_found" }, 404);
    const { mime, name, path } = row.attachment;
    const inline = c.req.query("download") === undefined && (/^(image|video|audio)\//.test(mime) || mime === "application/pdf");
    const file = Bun.file(path);
    // A row whose file has gone (a cleared temp folder): an honest 404, not a 500.
    if (!(await file.exists())) return c.json({ error: "not_found" }, 404);
    // Bun answers Range requests itself for a file, as video and sound players ask.
    return new Response(file, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
        "X-Content-Type-Options": "nosniff",
        // An uploaded SVG or HTML file must never execute on our origin.
        "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
        // A document can be edited in place: the browser asks again rather than showing an old copy.
        "Cache-Control": "private, no-cache",
      },
    });
  });
