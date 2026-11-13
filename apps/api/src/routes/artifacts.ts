import { ARTIFACT_SHARE_MODES, artifactTheme, previewFileName } from "@agora/core";
import { artifactPage } from "../artifact-page";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import { artifactByToken, artifactById, artifactDto, artifactResponse, canOpen, deleteArtifact, listArtifacts, renameArtifact, setShareMode, versionFile } from "../artifacts";
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
  /** Renames it: the conversation's members only. */
  .patch("/:id", async (c) => {
    const body = z.object({ title: z.string().trim().min(1).max(120) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const row = await artifactById(c.req.param("id"));
    const me = c.get("user").id;
    if (!row || !(await canOpen(row, me))) return c.json({ error: "not_found" }, 404);
    if (!(await artifactDto(row, me)).canShare) return c.json({ error: "forbidden" }, 403);
    return c.json(await artifactDto(await renameArtifact(row, body.data.title), me));
  })
  /** Deletes it with its versions: the conversation's members only. */
  .delete("/:id", async (c) => {
    const row = await artifactById(c.req.param("id"));
    const me = c.get("user").id;
    if (!row || !(await canOpen(row, me))) return c.json({ error: "not_found" }, 404);
    if (!(await artifactDto(row, me)).canShare) return c.json({ error: "forbidden" }, 403);
    await deleteArtifact(row);
    return c.body(null, 204);
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

/** The artifact a share link names, and the reader's session, when the reader may open it. */
async function openShared(token: string, headers: Headers) {
  const row = await artifactByToken(token);
  if (!row) return { status: "missing" as const };
  const session = await auth.api.getSession({ headers }).catch(() => null);
  if (row.shareMode !== "link" && !session) return { status: "login" as const, row };
  if (!(await canOpen(row, session?.user.id ?? null))) return { status: "missing" as const };
  const file = await versionFile(row.id);
  return file ? { status: "ok" as const, row, file, session } : { status: "missing" as const };
}

/**
 * The share link, `/s/<token>` (Caddy sends it here): the latest version under Agora's toolbar
 * (artifact-page.ts); `/s/<token>/raw` is the page alone, which the toolbar's frame loads
 * (`?download`: as a file). Without the session the mode asks for, the visitor is sent to the login, then back.
 */
export const sharedArtifacts = new Hono()
  .get("/:token", async (c) => {
    const found = await openShared(c.req.param("token"), c.req.raw.headers);
    if (found.status === "login") return c.redirect(`/login?redirect=${encodeURIComponent(`/s/${found.row.shareToken}`)}`);
    if (found.status === "missing") return c.text("Cet artefact n'existe pas ou n'est plus partagé.", 404);
    const { row, file, session } = found;
    // Back into the app for whoever can open it there (a member, or anyone of the organization when it is shared with it).
    const inApp = !!session && (row.shareMode !== "private" || (await canOpen({ ...row, shareMode: "private" }, session.user.id)));
    return artifactPage({ title: row.title, version: file.version, token: row.shareToken, appPath: inApp ? `/artifacts/${row.id}` : null });
  })
  .get("/:token/raw", async (c) => {
    const found = await openShared(c.req.param("token"), c.req.raw.headers);
    if (found.status !== "ok") return c.text("Cet artefact n'existe pas ou n'est plus partagé.", 404);
    const res = await artifactResponse(found.file.path, "no-store", artifactTheme(c.req.query("theme")));
    if (c.req.query("download") !== undefined) res.headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(previewFileName(found.row.title))}`);
    return res;
  });
