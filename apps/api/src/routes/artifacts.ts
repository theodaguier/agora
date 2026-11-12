import { ARTIFACT_SHARE_MODES, artifactTheme } from "@agora/core";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import { artifactByToken, artifactById, artifactDto, artifactResponse, canOpen, listArtifacts, setShareMode, versionFile } from "../artifacts";
import { requireUser, type AppEnv } from "../middleware";

const versionParam = (raw: string | undefined) => {
  const v = z.coerce.number().int().positive().safeParse(raw);
  return v.success ? v.data : undefined;
};

/** An artifact, its versions and its link, for the people who may open it. */
export const artifacts = new Hono<AppEnv>()
  .use(requireUser)
  /** Every artifact of the reader's conversations (the Artefacts screen). */
  .get("/", async (c) => c.json(await listArtifacts(c.get("user").id)))
  .get("/:id", async (c) => {
    const row = await artifactById(c.req.param("id"));
    if (!row || !(await canOpen(row, c.get("user").id))) return c.json({ error: "not_found" }, 404);
    return c.json(await artifactDto(row, c.get("user").id));
  })
  /** Who the link opens to: the conversation's members only may change it. */
  .patch("/:id/share", async (c) => {
    const body = z.object({ mode: z.enum(ARTIFACT_SHARE_MODES) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const row = await artifactById(c.req.param("id"));
    const me = c.get("user").id;
    if (!row || !(await canOpen(row, me))) return c.json({ error: "not_found" }, 404);
    const dto = await artifactDto(row, me);
    if (!dto.canShare) return c.json({ error: "forbidden" }, 403);
    return c.json(await artifactDto(await setShareMode(row, body.data.mode), me));
  })
  /** A version's page (`?v=`), the latest without it: what the app's frame loads. */
  .get("/:id/content", async (c) => {
    const row = await artifactById(c.req.param("id"));
    if (!row || !(await canOpen(row, c.get("user").id))) return c.json({ error: "not_found" }, 404);
    const v = versionParam(c.req.query("v"));
    const file = await versionFile(row.id, v);
    if (!file) return c.json({ error: "not_found" }, 404);
    return artifactResponse(file.path, v === undefined ? "no-store" : "private", artifactTheme(c.req.query("theme")));
  });

/**
 * The share link, `/s/<token>` (Caddy sends it here): the latest version, as a page of its own.
 * Without the session the mode asks for, the visitor is sent to the login, then back.
 */
export const sharedArtifacts = new Hono().get("/:token", async (c) => {
  const row = await artifactByToken(c.req.param("token"));
  const notFound = () => c.text("Cet artefact n'existe pas ou n'est plus partagé.", 404);
  if (!row) return notFound();
  const session = row.shareMode === "link" ? null : await auth.api.getSession({ headers: c.req.raw.headers });
  if (row.shareMode !== "link" && !session) return c.redirect(`/login?redirect=${encodeURIComponent(`/s/${row.shareToken}`)}`);
  if (!(await canOpen(row, session?.user.id ?? null))) return notFound();
  const file = await versionFile(row.id);
  if (!file) return notFound();
  return artifactResponse(file.path, "no-store", artifactTheme(c.req.query("theme")));
});
