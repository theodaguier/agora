/**
 * Bots a bot asks to create (```bot-create``` block): e.g. one per role of an
 * app the team tests (client, studio, retoucher…). Like POST /agents, creating
 * a bot is an admin's call: an admin approves, unless an admin started the
 * request. They are born set up (SOUL.md written, no onboarding), with the
 * tools of every new profile (sandbox.ts), usable by whoever asked, and added
 * to the group they were asked from.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import type { RequestedBot } from "./db/schema";
import { env } from "./env";
import { errors } from "./errors.messages";
import { forgetMembers, publishToConversation } from "./events";
import { createProfile, HermesError } from "./hermes-admin";
import { defineMessages, tr } from "./i18n";
import { postEvent } from "./messages";
import { newBotIdentity, writeSoul } from "./onboarding";
import { getOrg } from "./org";
import { syncSessionSearch } from "./session-search";

const messages = defineMessages({
  en: { createFailed: "Creation failed" },
  fr: { createFailed: "Échec de la création" },
});

const { agent, agentAccess, botRequest, conversation, conversationAgent, conversationMember, user } = schema;
type Row = typeof botRequest.$inferSelect;

/** Beyond this, a request is more likely a runaway than a team to test with. */
export const MAX_REQUESTED_BOTS = 6;

/** Same limits as the profile a bot writes for itself during onboarding. */
const requestedBotSchema = z.object({
  name: z.string().trim().min(1).max(60),
  role: z.string().trim().max(120).optional(),
  mission: z.string().trim().max(600).optional(),
  instructions: z.string().trim().max(8000).optional(),
});

export const botCreateSchema = z.object({
  reason: z.string().trim().max(300).default(""),
  bots: z.array(requestedBotSchema).min(1).max(MAX_REQUESTED_BOTS),
});

export type BotCreateBlock = z.infer<typeof botCreateSchema>;

export const BOT_CREATE_PROMPT = [
  "# Créer des bots",
  "Quand on te demande de créer d'autres bots (par exemple un par rôle d'une application à tester : client, studio, retoucheur…), décris-les avec ce bloc, seul, à la fin de ta réponse. L'app les crée déjà configurés et, dans un groupe, les y ajoute ; si la demande ne vient pas d'un administrateur, un administrateur valide d'abord :",
  "```bot-create",
  '{"reason": "à quoi ils vont servir", "bots": [{"name": "…", "role": "…", "mission": "…", "instructions": "consignes détaillées, à la 2e personne, sur sa façon de travailler et de répondre"}]}',
  "```",
  `${MAX_REQUESTED_BOTS} bots au plus, chacun avec un nom court et parlant. Ne crée des bots que si on te le demande. Une fois créés, passe-leur la main en les mentionnant.`,
].join("\n");

function toDto(row: Row, viewer: { id: string; role?: string | null }) {
  return {
    id: row.id,
    bots: row.bots.map((b) => ({
      name: b.name,
      role: b.role ?? null,
      mission: b.mission ?? null,
      avatar: { shape: b.avatarShape, color: b.avatarColor },
      agentId: b.agentId ?? null,
    })),
    reason: row.reason,
    status: row.status,
    error: row.error,
    conversationId: row.conversationId,
    createdAt: row.createdAt,
    canDecide: viewer.role === "admin" && row.status === "pending",
  };
}

async function load(id: string) {
  const [row] = await db.select().from(botRequest).where(eq(botRequest.id, id));
  if (!row) throw new HermesError(tr(errors).requestNotFound, 404);
  return row;
}

export async function getBotRequest(id: string, viewer: { id: string; role?: string | null }) {
  const row = await load(id);
  if (viewer.role !== "admin" && viewer.id !== row.requestedBy) {
    const member = row.conversationId
      ? await db
          .select()
          .from(conversationMember)
          .where(and(eq(conversationMember.conversationId, row.conversationId), eq(conversationMember.userId, viewer.id)))
      : [];
    if (!member.length) throw new HermesError(tr(errors).requestNotFound, 404);
  }
  return toDto(row, viewer);
}

type RequestContext = { conversationId: string; agentId: string; requestedBy: string | null };

/** The identities are drawn now: a retry after a failure resumes the same profiles. */
export async function createBotRequest(block: BotCreateBlock, ctx: RequestContext) {
  const [requester] = ctx.requestedBy ? await db.select({ role: user.role }).from(user).where(eq(user.id, ctx.requestedBy)) : [];
  const admin = requester?.role === "admin";
  const [row] = await db
    .insert(botRequest)
    .values({
      id: crypto.randomUUID(),
      bots: block.bots.map((b) => ({ ...b, ...newBotIdentity() })),
      reason: block.reason,
      requestedBy: ctx.requestedBy,
      agentId: ctx.agentId,
      conversationId: ctx.conversationId,
      ...(admin && { decidedBy: ctx.requestedBy, decidedAt: new Date() }),
    })
    .returning();
  if (admin) void createBots(row!, ctx.requestedBy).catch((err) => console.error("bot requests: creation", err));
  return row!;
}

export async function decideBots(id: string, adminId: string, approve: boolean) {
  const row = await load(id);
  if (row.status !== "pending") throw new HermesError(tr(errors).requestAlreadyHandled, 409);
  await db
    .update(botRequest)
    .set({ status: approve ? "pending" : "rejected", decidedBy: adminId, decidedAt: new Date() })
    .where(eq(botRequest.id, id));
  if (!approve) {
    if (row.conversationId) await postEvent(row.conversationId, { type: "bots.refused", names: row.bots.map((b) => b.name) });
    return;
  }
  void createBots(row, adminId).catch((err) => console.error("bot requests: creation", err));
}

/**
 * In the background, one bot after the other (each profile takes a few Hermes
 * CLI starts). A failure leaves the request pending, with its error, for a
 * retry that skips the bots already created.
 */
async function createBots(row: Row, decidedBy: string | null) {
  // Only one run per request: a second click while creating finds it taken.
  const [claimed] = await db
    .update(botRequest)
    .set({ status: "creating", error: null })
    .where(and(eq(botRequest.id, row.id), eq(botRequest.status, "pending")))
    .returning();
  if (!claimed) return;
  const bots = [...claimed.bots];
  try {
    if (!env.HERMES_HOME) throw new Error(tr(errors).hermesHomeNotConfigured);
    const [conv] = claimed.conversationId ? await db.select().from(conversation).where(eq(conversation.id, claimed.conversationId)) : [];
    const group = conv?.kind === "group" ? conv.id : null;
    const users = [...new Set([claimed.requestedBy, decidedBy].filter((u): u is string => !!u))];
    for (const [i, bot] of bots.entries()) {
      if (bot.agentId) continue;
      await createProfile(bot.hermesProfile, `Agent « ${bot.name} »`);
      await writeSoul(bot.hermesProfile, bot);
      const created: RequestedBot = { ...bot, agentId: crypto.randomUUID() };
      bots[i] = created;
      await db.transaction(async (tx) => {
        await tx.insert(agent).values({
          id: created.agentId!,
          name: bot.name,
          hermesProfile: bot.hermesProfile,
          avatarShape: bot.avatarShape,
          avatarColor: bot.avatarColor,
        });
        if (users.length) await tx.insert(agentAccess).values(users.map((userId) => ({ userId, agentId: created.agentId! }))).onConflictDoNothing();
        if (group) await tx.insert(conversationAgent).values({ conversationId: group, agentId: created.agentId!, addedBy: claimed.requestedBy }).onConflictDoNothing();
        await tx.update(botRequest).set({ bots }).where(eq(botRequest.id, claimed.id));
      });
    }
    await db.update(botRequest).set({ status: "created" }).where(eq(botRequest.id, claimed.id));
    if (group) {
      forgetMembers(group);
      void syncSessionSearch();
      await publishToConversation(group, { type: "conversation.updated", conversationId: group });
    }
    if (claimed.conversationId) {
      const confined = !(await getOrg()).newBotsAllTools;
      await postEvent(claimed.conversationId, { type: "bots.created", names: bots.map((b) => b.name), confined });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : tr(messages).createFailed;
    console.error("bot requests: creation", err);
    await db.update(botRequest).set({ status: "pending", error: message }).where(eq(botRequest.id, claimed.id));
    if (claimed.conversationId) await postEvent(claimed.conversationId, { type: "bots.failed", error: message });
  }
}
