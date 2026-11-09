import { and, desc, eq, lt } from "drizzle-orm";
import type { BotWebhookStatus } from "@agora/core";
import { enqueueTurn } from "./bot-runner";
import { accessibleAgentIds, openDirectWithAgent } from "./conversations";
import { db, schema } from "./db";
import { env } from "./env";
import { newChain } from "./group";
import { postEvent } from "./messages";
import { hashWebhookToken, newWebhookToken, webhookDedupeKey } from "./webhook-payload";

/**
 * Webhooks: how the outside starts a bot. Any service that can call an address (PostHog, a CI, a
 * form) gets one, per bot; what it sends and what the bot does with it are settings, nothing here
 * knows a service. A call posts a line in the owner's direct conversation with the bot and starts a
 * turn as that owner, which is what lets the bot use their code sessions.
 *
 * A call can come as often as the service likes, and a turn or a session costs: the same event only
 * counts once over DEDUPE_MS, and a webhook starts at most MAX_PER_HOUR turns.
 */
const DEDUPE_MS = 24 * 3_600_000;
const MAX_PER_HOUR = 6;
/** Deliveries older than this can no longer match an event: they go. */
const KEEP_MS = 7 * 24 * 3_600_000;

const { botWebhook, botWebhookDelivery } = schema;

/** Turns started per webhook over the last hour; checked and taken before any await, so a burst can't pass. */
const recent = new Map<string, number[]>();

function takeSlot(id: string) {
  const now = Date.now();
  const times = (recent.get(id) ?? []).filter((t) => now - t < 3_600_000);
  recent.set(id, times);
  if (times.length >= MAX_PER_HOUR) return null;
  times.push(now);
  // The list as it is by then: a later call may have replaced it.
  return () => {
    const current = recent.get(id) ?? [];
    const i = current.indexOf(now);
    if (i >= 0) current.splice(i, 1);
  };
}

/** Null: no such address (or turned off), and the caller learns nothing more. */
export async function receiveWebhook(token: string, body: string): Promise<BotWebhookStatus | null> {
  const [hook] = await db.select().from(botWebhook).where(eq(botWebhook.tokenHash, hashWebhookToken(token)));
  if (!hook?.enabled) return null;
  // PostgreSQL text can't hold a NUL.
  const status = await deliver(hook, body.replaceAll("\0", ""));
  await db.update(botWebhook).set({ lastReceivedAt: new Date(), lastStatus: status }).where(eq(botWebhook.id, hook.id));
  return status;
}

async function deliver(hook: typeof botWebhook.$inferSelect, body: string): Promise<BotWebhookStatus> {
  if (!(await accessibleAgentIds(hook.ownerId)).has(hook.agentId)) return "no_access";
  const release = takeSlot(hook.id);
  if (!release) return "rate_limited";
  const now = new Date();
  // Atomic: of two calls for the same event, only one gets a row back.
  const [delivery] = await db
    .insert(botWebhookDelivery)
    .values({ id: crypto.randomUUID(), webhookId: hook.id, dedupeKey: webhookDedupeKey(body, hook.dedupeField), payload: body, receivedAt: now })
    .onConflictDoUpdate({
      target: [botWebhookDelivery.webhookId, botWebhookDelivery.dedupeKey],
      set: { payload: body, receivedAt: now },
      where: lt(botWebhookDelivery.receivedAt, new Date(now.getTime() - DEDUPE_MS)),
    })
    .returning({ id: botWebhookDelivery.id });
  if (!delivery) {
    release();
    return "duplicate";
  }
  await db.delete(botWebhookDelivery).where(and(eq(botWebhookDelivery.webhookId, hook.id), lt(botWebhookDelivery.receivedAt, new Date(now.getTime() - KEEP_MS))));
  const [bot] = await db.select({ name: schema.agent.name }).from(schema.agent).where(eq(schema.agent.id, hook.agentId));
  const line = await postEvent(hook.conversationId, { type: "webhook.received", bot: bot?.name ?? "?", name: hook.name });
  enqueueTurn({ conversationId: hook.conversationId, agentId: hook.agentId, triggerId: line.id, requestedBy: hook.ownerId, chain: newChain(), webhook: delivery.id });
  return "accepted";
}

const columns = {
  id: botWebhook.id,
  name: botWebhook.name,
  instructions: botWebhook.instructions,
  dedupeField: botWebhook.dedupeField,
  autoMerge: botWebhook.autoMerge,
  enabled: botWebhook.enabled,
  lastReceivedAt: botWebhook.lastReceivedAt,
  lastStatus: botWebhook.lastStatus,
  owner: schema.user.name,
};

export const listWebhooks = (agentId: string) =>
  db.select(columns).from(botWebhook).innerJoin(schema.user, eq(schema.user.id, botWebhook.ownerId)).where(eq(botWebhook.agentId, agentId)).orderBy(desc(botWebhook.createdAt));

type WebhookFields = { name: string; instructions: string; dedupeField?: string | null; autoMerge?: boolean };

/** The address is only ever returned here: the database keeps its hash. Null: the owner can't use this bot. */
export async function createWebhook(agentId: string, ownerId: string, fields: WebhookFields) {
  if (!(await accessibleAgentIds(ownerId)).has(agentId)) return null;
  const token = newWebhookToken();
  const id = crypto.randomUUID();
  const conversationId = await openDirectWithAgent(ownerId, agentId);
  await db.insert(botWebhook).values({ id, agentId, ownerId, conversationId, tokenHash: hashWebhookToken(token), ...fields });
  return { id, url: `${env.WEB_ORIGIN.replace(/\/$/, "")}/api/hooks/${token}` };
}

export async function updateWebhook(agentId: string, id: string, patch: Partial<WebhookFields> & { enabled?: boolean }) {
  await db.update(botWebhook).set(patch).where(and(eq(botWebhook.id, id), eq(botWebhook.agentId, agentId)));
}

export const deleteWebhook = (agentId: string, id: string) => db.delete(botWebhook).where(and(eq(botWebhook.id, id), eq(botWebhook.agentId, agentId)));
