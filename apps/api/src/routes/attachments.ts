import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { requireUser, type AppEnv } from "../middleware";

const { attachment, conversationMember } = schema;

/** Serves an attachment back, only to a member of its conversation. `?download` forces a download. */
export const attachments = new Hono<AppEnv>().use(requireUser).get("/:id", async (c) => {
  const [row] = await db
    .select({ attachment })
    .from(attachment)
    .innerJoin(conversationMember, eq(conversationMember.conversationId, attachment.conversationId))
    .where(and(eq(attachment.id, c.req.param("id")), eq(conversationMember.userId, c.get("user").id)));
  if (!row) return c.json({ error: "not_found" }, 404);
  const { mime, name, path } = row.attachment;
  const inline = c.req.query("download") === undefined && (mime.startsWith("image/") || mime === "application/pdf");
  return new Response(Bun.file(path), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
      // An uploaded SVG or HTML file must never execute on our origin.
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "Cache-Control": "private, max-age=3600",
    },
  });
});
