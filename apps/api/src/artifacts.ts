/**
 * Artifacts (@agora/core previews.ts): the pages bots write, kept as versions, and who may open them.
 *
 * Each version is an HTML file of the conversation (attachments.ts); the artifact groups the files a
 * slug named and carries the share link. A page runs its scripts, so it is only ever served with
 * ARTIFACT_CSP: the `sandbox` directive gives it an opaque origin, wherever it is opened (in the
 * app's frame or as a tab), so it never reads the app's cookies, storage or API.
 */
import { randomBytes } from "node:crypto";
import { withArtifactKit, type ArtifactDto, type ArtifactShareMode, type ArtifactSummary, type ArtifactTheme } from "@agora/core";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";

const { artifact, artifactVersion, attachment, conversationMember } = schema;
type ArtifactRow = typeof artifact.$inferSelect;

/** Script hosts a page may load libraries from (the prompt names them). */
export const ARTIFACT_SCRIPT_HOSTS = ["https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://unpkg.com"];

export const ARTIFACT_CSP = [
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads",
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' ${ARTIFACT_SCRIPT_HOSTS.join(" ")}`,
  "style-src 'unsafe-inline' https:",
  "img-src https: data: blob:",
  "font-src https: data:",
  "media-src https: data: blob:",
  // Public APIs only: from its opaque origin, the page carries no one's cookies.
  "connect-src https:",
  "base-uri 'none'",
  "form-action 'none'",
  // The app's own frame; nothing else may embed it.
  "frame-ancestors 'self'",
].join("; ");

const newToken = () => randomBytes(18).toString("base64url");

/** Records a page saved as `attachmentId` as the next version of its slug's artifact (made on its first version). */
export async function recordVersion(conversationId: string, slug: string, title: string, attachmentId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(artifact)
      .values({ id: crypto.randomUUID(), conversationId, slug, title, shareToken: newToken(), lastVersion: 1 })
      .onConflictDoUpdate({
        target: [artifact.conversationId, artifact.slug],
        set: { title: title || sql`${artifact.title}`, lastVersion: sql`${artifact.lastVersion} + 1`, updatedAt: new Date() },
      })
      .returning({ id: artifact.id, version: artifact.lastVersion });
    await tx.insert(artifactVersion).values({ id: crypto.randomUUID(), artifactId: row!.id, version: row!.version, attachmentId });
    return { artifactId: row!.id, version: row!.version };
  });
}

async function isMember(conversationId: string, userId: string) {
  const [row] = await db
    .select({ userId: conversationMember.userId })
    .from(conversationMember)
    .where(and(eq(conversationMember.conversationId, conversationId), eq(conversationMember.userId, userId)));
  return !!row;
}

/**
 * Whether `userId` (null: no session) may open the artifact: its conversation's members always;
 * every account of the organization when it is shared with it; anyone when it is shared by link.
 */
export async function canOpen(row: Pick<ArtifactRow, "conversationId" | "shareMode">, userId: string | null) {
  if (row.shareMode === "link") return true;
  if (!userId) return false;
  if (row.shareMode === "org") return true;
  return isMember(row.conversationId, userId);
}

export const artifactById = async (id: string) => (await db.select().from(artifact).where(eq(artifact.id, id)))[0] ?? null;
export const artifactByToken = async (token: string) => (await db.select().from(artifact).where(eq(artifact.shareToken, token)))[0] ?? null;

async function versionsOf(artifactId: string) {
  return db
    .select({ version: artifactVersion.version, attachmentId: artifactVersion.attachmentId, createdAt: artifactVersion.createdAt, path: attachment.path })
    .from(artifactVersion)
    .innerJoin(attachment, eq(attachment.id, artifactVersion.attachmentId))
    .where(eq(artifactVersion.artifactId, artifactId))
    .orderBy(desc(artifactVersion.version));
}

/** The file of a version (the latest when none is asked for), or null when it is gone. */
export async function versionFile(artifactId: string, version?: number) {
  const versions = await versionsOf(artifactId);
  const v = version === undefined ? versions[0] : versions.find((x) => x.version === version);
  return v ? { version: v.version, path: v.path } : null;
}

export async function artifactDto(row: ArtifactRow, userId: string): Promise<ArtifactDto> {
  const versions = await versionsOf(row.id);
  return {
    id: row.id,
    conversationId: row.conversationId,
    slug: row.slug,
    title: row.title,
    shareMode: row.shareMode,
    sharePath: `/s/${row.shareToken}`,
    versions: versions.map((v) => ({ version: v.version, attachmentId: v.attachmentId, createdAt: v.createdAt.toISOString() })),
    canShare: await isMember(row.conversationId, userId),
  };
}

/** Every artifact of the conversations `userId` is a member of that still has a version, the latest changed first. */
export async function listArtifacts(userId: string): Promise<ArtifactSummary[]> {
  const rows = await db
    .select({
      id: artifact.id,
      conversationId: artifact.conversationId,
      title: artifact.title,
      shareMode: artifact.shareMode,
      shareToken: artifact.shareToken,
      updatedAt: artifact.updatedAt,
      version: sql<number>`max(${artifactVersion.version})`.mapWith(Number),
      versions: sql<number>`count(${artifactVersion.id})`.mapWith(Number),
    })
    .from(artifact)
    .innerJoin(conversationMember, and(eq(conversationMember.conversationId, artifact.conversationId), eq(conversationMember.userId, userId)))
    .innerJoin(artifactVersion, eq(artifactVersion.artifactId, artifact.id))
    .groupBy(artifact.id)
    .orderBy(desc(artifact.updatedAt));
  return rows.map(({ shareToken, updatedAt, ...r }) => ({ ...r, sharePath: `/s/${shareToken}`, updatedAt: updatedAt.toISOString() }));
}

/** Changes who the link opens to; leaving "link" draws a new token, so a link already sent around stops working. */
export async function setShareMode(row: ArtifactRow, mode: ArtifactShareMode) {
  const [updated] = await db
    .update(artifact)
    .set({ shareMode: mode, ...(row.shareMode === "link" && mode !== "link" && { shareToken: newToken() }) })
    .where(eq(artifact.id, row.id))
    .returning();
  return updated!;
}

/**
 * A version's page dressed in Agora's kit (in the app's theme when it says which, else the reader's),
 * with the headers that keep its scripts away from the app.
 */
export async function artifactResponse(path: string, cache: "private" | "no-store", theme?: ArtifactTheme) {
  return new Response(withArtifactKit(await Bun.file(path).text(), theme), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": ARTIFACT_CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": cache === "private" ? "private, max-age=3600" : "no-store",
    },
  });
}
