import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { MAX_PROJECT_CONTEXT, projectBotAccess, type ConversationEvent, type ProjectBotAccess } from "@agora/core";
import { db, schema } from "./db";
import { publishToConversation } from "./events";
import { postEvent } from "./messages";

/**
 * A project's page seen by its bots (Figma « Proposition — Page projet »): the context they read with every
 * message of the project and of its discussions, the files and pages they can list, the repository their
 * code sessions start on; and the two blocks they write back: the name of a discussion opened without one,
 * and a new version of the context.
 */

const { artifact, attachment, conversation, message } = schema;

type ConversationRow = typeof conversation.$inferSelect;

/** The project of a conversation: itself when it is one, its parent when it is a discussion, else null. */
export async function projectOf(conv: ConversationRow): Promise<ConversationRow | null> {
  if (conv.kind !== "group") return null;
  if (!conv.parentId) return conv;
  const [parent] = await db.select().from(conversation).where(eq(conversation.id, conv.parentId));
  return parent ?? null;
}

/** A project and its discussions. */
export async function projectConversationIds(projectId: string) {
  const rows = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(or(eq(conversation.id, projectId), eq(conversation.parentId, projectId)));
  return rows.map((r) => r.id);
}

/** The project's files and the pages its bots wrote, latest first, across the project and its discussions. */
export async function projectData(projectId: string) {
  const ids = await projectConversationIds(projectId);
  if (!ids.length) return { files: [], pages: [] };
  const titles = new Map(
    (await db.select({ id: conversation.id, title: conversation.title, parentId: conversation.parentId }).from(conversation).where(inArray(conversation.id, ids))).map((c) => [
      c.id,
      c.parentId ? c.title : null,
    ]),
  );
  const [files, pages] = await Promise.all([
    db
      .select({ id: attachment.id, conversationId: attachment.conversationId, name: attachment.name, mime: attachment.mime, size: attachment.size, createdAt: attachment.createdAt })
      .from(attachment)
      .where(inArray(attachment.conversationId, ids))
      .orderBy(desc(attachment.createdAt))
      .limit(200),
    db
      .select({ id: artifact.id, conversationId: artifact.conversationId, title: artifact.title, version: artifact.lastVersion, updatedAt: artifact.updatedAt })
      .from(artifact)
      .where(inArray(artifact.conversationId, ids))
      .orderBy(desc(artifact.updatedAt))
      .limit(100),
  ]);
  // A page's versions are files too: listed as the page, not as HTML files.
  const pageFiles = new Set(
    files.length
      ? (
          await db
            .select({ id: schema.artifactVersion.attachmentId })
            .from(schema.artifactVersion)
            .where(inArray(schema.artifactVersion.attachmentId, files.map((f) => f.id)))
        ).map((r) => r.id)
      : [],
  );
  // Who added a file: the author of the message that carries it.
  const authors = new Map<string, { kind: "user" | "agent"; id: string } | null>();
  const carrying = files.length
    ? await db
        .select({ data: message.data, authorUserId: message.authorUserId, authorAgentId: message.authorAgentId })
        .from(message)
        .where(and(inArray(message.conversationId, ids), ne(message.kind, "event")))
        .orderBy(desc(message.createdAt))
        .limit(2000)
    : [];
  for (const m of carrying) {
    const list = (m.data as { attachments?: { id: string }[] } | null)?.attachments ?? [];
    for (const a of list)
      if (!authors.has(a.id))
        authors.set(a.id, m.authorAgentId ? { kind: "agent", id: m.authorAgentId } : m.authorUserId ? { kind: "user", id: m.authorUserId } : null);
  }
  return {
    files: files
      .filter((f) => !pageFiles.has(f.id))
      .map((f) => ({ ...f, createdAt: f.createdAt.toISOString(), discussion: titles.get(f.conversationId) ?? null, author: authors.get(f.id) ?? null })),
    pages: pages.map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString(), discussion: titles.get(p.conversationId) ?? null })),
  };
}

/** What happened in the project and its discussions: their events (members, names, context, sessions…), latest first. */
export async function projectActivity(projectId: string, limit = 100) {
  const ids = await projectConversationIds(projectId);
  if (!ids.length) return [];
  const rows = await db
    .select({ id: message.id, conversationId: message.conversationId, data: message.data, text: message.text, createdAt: message.createdAt, title: conversation.title, parentId: conversation.parentId })
    .from(message)
    .innerJoin(conversation, eq(conversation.id, message.conversationId))
    .where(and(inArray(message.conversationId, ids), eq(message.kind, "event")))
    .orderBy(desc(message.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    discussion: r.parentId ? r.title : null,
    event: ((r.data as { event?: ConversationEvent } | null)?.event ?? null) as ConversationEvent | null,
    text: r.text,
    createdAt: r.createdAt.toISOString(),
  }));
}

/* ---------- what the bots read ---------- */

/** The project section of a bot's system prompt, in a project or one of its discussions. */
export async function projectPrompt(conv: ConversationRow): Promise<string> {
  const project = await projectOf(conv);
  if (!project) return "";
  const access = projectBotAccess(project.botAccess);
  const lines = [
    "# Projet",
    conv.parentId
      ? `Cette conversation est une discussion du projet « ${project.title ?? "sans nom"} »${conv.title ? `, intitulée « ${conv.title} »` : ""}.`
      : `Cette conversation est le fil général du projet « ${project.title ?? "sans nom"} ».`,
    project.description ? `Description du projet : ${project.description}` : null,
  ];
  if (access.context !== "none") {
    const context = project.context?.trim();
    lines.push(
      "",
      "## Contexte du projet",
      "Ce que l'équipe a écrit pour cadrer le projet, à respecter dans tes réponses :",
      context ? context : "(vide pour l'instant)",
    );
    if (access.context === "write")
      lines.push(
        "",
        "Quand l'échange établit une décision, une règle ou un fait durable sur le projet, mets le contexte à jour : termine ta réponse par un bloc",
        "```project-context",
        '{"context": "<le contexte complet, réécrit>", "summary": "<ce qui change, en quelques mots>"}',
        "```",
        "Le contexte réécrit remplace l'ancien : garde ce qui reste vrai, ajoute ou corrige le reste, en Markdown court. Ne le fais pas pour une information passagère.",
      );
  }
  if (project.repo && access.sessions === "repo") lines.push("", `Dépôt GitHub du projet : ${project.repo}. Les sessions de code du projet partent de ce dépôt sauf demande contraire.`);
  if (access.data !== "none") {
    const data = await projectData(project.id).catch(() => null);
    const names = data ? [...data.pages.map((p) => `page « ${p.title} »`), ...data.files.map((f) => `fichier « ${f.name} »`)].slice(0, 30) : [];
    if (names.length) lines.push("", "## Données du projet", `Pages et fichiers déjà dans le projet : ${names.join(", ")}.`);
  }
  if (conv.parentId && !conv.title && access.discussions === "rename")
    lines.push(
      "",
      "## Nom de la discussion",
      "Cette discussion n'a pas encore de nom. Termine ta réponse par un bloc qui lui en donne un, court (2 à 6 mots), qui dit son sujet :",
      "```discussion-title",
      '{"title": "<nom>"}',
      "```",
    );
  return lines.filter((l) => l !== null).join("\n");
}

/* ---------- what the bots write ---------- */

export const discussionTitleSchema = z.object({ title: z.string().trim().min(1).max(80) });
export const projectContextSchema = z.object({ context: z.string().max(MAX_PROJECT_CONTEXT), summary: z.string().trim().max(120).optional() });

export type DiscussionTitleBlock = z.infer<typeof discussionTitleSchema>;
export type ProjectContextBlock = z.infer<typeof projectContextSchema>;

type Ctx = { conversationId: string; agentId: string; botName: string };

const allowed = async (conversationId: string, key: keyof ProjectBotAccess, value: string) => {
  const [conv] = await db.select().from(conversation).where(eq(conversation.id, conversationId));
  const project = conv && (await projectOf(conv));
  return project && projectBotAccess(project.botAccess)[key] === value ? { conv, project } : null;
};

/** Names a discussion that has none yet (a name a member gave is never overwritten by a bot). */
export async function applyDiscussionTitle(block: DiscussionTitleBlock, ctx: Ctx) {
  const ok = await allowed(ctx.conversationId, "discussions", "rename");
  if (!ok || !ok.conv.parentId || ok.conv.title) return;
  const [named] = await db
    .update(conversation)
    .set({ title: block.title })
    .where(and(eq(conversation.id, ctx.conversationId), isNull(conversation.title)))
    .returning({ id: conversation.id });
  if (!named) return;
  await postEvent(ctx.conversationId, { type: "discussion.titled", actor: ctx.botName, title: block.title });
  await publishToConversation(ctx.conversationId, { type: "conversation.updated", conversationId: ctx.conversationId });
}

/** Rewrites the project's context, told in the thread it was changed from. */
export async function applyProjectContext(block: ProjectContextBlock, ctx: Ctx) {
  const ok = await allowed(ctx.conversationId, "context", "write");
  if (!ok) return;
  const context = block.context.trim();
  if (context === (ok.project.context ?? "").trim()) return;
  await db
    .update(conversation)
    .set({ context: context || null, contextUpdatedAt: new Date(), contextAuthor: { kind: "agent", id: ctx.agentId, name: ctx.botName } })
    .where(eq(conversation.id, ok.project.id));
  await postEvent(ctx.conversationId, { type: "project.context", actor: ctx.botName, ...(block.summary && { summary: block.summary }) });
  await publishToConversation(ok.project.id, { type: "conversation.updated", conversationId: ok.project.id });
}

/**
 * A discussion still untitled after its bot answered (an engine that skipped the block): it takes the
 * first words of its first message, so the sidebar never lists « sans nom ».
 */
export async function titleFromFirstMessage(conversationId: string) {
  const [conv] = await db.select().from(conversation).where(eq(conversation.id, conversationId));
  if (!conv?.parentId || conv.title) return;
  const [first] = await db
    .select({ text: message.text })
    .from(message)
    .where(and(eq(message.conversationId, conversationId), eq(message.kind, "user")))
    .orderBy(asc(message.createdAt))
    .limit(1);
  const words = first?.text.replace(/\s+/g, " ").trim();
  if (!words) return;
  const title = words.length <= 60 ? words : `${words.slice(0, 60).replace(/\s+\S*$/, "")}…`;
  const [named] = await db.update(conversation).set({ title }).where(and(eq(conversation.id, conversationId), isNull(conversation.title))).returning({ id: conversation.id });
  if (named) await publishToConversation(conversationId, { type: "conversation.updated", conversationId });
}
