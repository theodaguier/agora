import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { orgContext } from "./org";
import { renderEvent, type ConversationEvent } from "@agora/core";
import { orgLocale } from "./i18n";

export const COMPANY_MEMORY_KEY = "company_memory";
export const COMPANY_MEMORY_MAX = 20_000;

export async function companyMemory() {
  const [row] = await db.select().from(schema.setting).where(eq(schema.setting.key, COMPANY_MEMORY_KEY));
  return row?.value ?? "";
}

/**
 * Context sent to Hermes with every message: the organization's shared memory
 * and the employee's identity. Several employees talk to the same Hermes
 * profile, whose built-in memory (USER.md) is single: the agent is told so
 * that it doesn't mix people up.
 */
export async function turnContext(user: { name: string; email: string; role?: string | null; locale?: string | null }, agentName: string) {
  const memory = (await companyMemory()).trim();
  return [
    [
      "# Ton identité",
      `Tu es « ${agentName} », tel que décrit dans ta personnalité (SOUL). Si tes réponses précédentes dans cette conversation te présentaient autrement, ta configuration a changé depuis : suis celle-ci.`,
    ].join("\n"),
    ...(await orgContext(memory, user.locale)),
    [
      "# Interlocuteur",
      `Tu parles avec ${user.name} (${user.email})${user.role === "admin" ? ", administrateur de l'app" : ""}.`,
      "Plusieurs membres utilisent cet agent : ta mémoire « USER PROFILE » est commune à tous.",
      "Quand tu y notes quelque chose sur une personne, préfixe-le par son nom, et n'applique à ton interlocuteur que ce qui le concerne.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * A conversation's Hermes session. Hermes caches the agent (and thus its
 * system prompt) for each session: after a personality change, a new session
 * is started so the new identity takes effect.
 * In a group, each bot has its own session: `agora-<conversation>-<agent>`.
 * /new and /compact move the thread to a new generation (`-g<n>`).
 */
export const hermesSessionId = (conversationId: string, revision: number, groupAgentId?: string, generation = 0) => {
  const base = groupAgentId ? `agora-${conversationId}-${groupAgentId}` : `agora-${conversationId}`;
  return `${base}${revision > 0 ? `-r${revision}` : ""}${generation > 0 ? `-g${generation}` : ""}`;
};

/**
 * Call after any rewrite of an agent's SOUL.md. The event is posted in every
 * conversation of the agent; each member reads it in their own language.
 */
export async function bumpAgentRevision(agentId: string, event: ConversationEvent = { type: "agent.updated" }) {
  const note = renderEvent(event, await orgLocale());
  const { eq, sql } = await import("drizzle-orm");
  const { db, schema } = await import("./db");
  const { publishToConversation } = await import("./events");
  await db
    .update(schema.agent)
    .set({ revision: sql`${schema.agent.revision} + 1` })
    .where(eq(schema.agent.id, agentId));
  const rows = await db
    .select({ id: schema.conversationAgent.conversationId })
    .from(schema.conversationAgent)
    .where(eq(schema.conversationAgent.agentId, agentId));
  if (!rows.length) return;
  const events = await db
    .insert(schema.message)
    .values(rows.map((r) => ({ id: crypto.randomUUID(), conversationId: r.id, kind: "event" as const, text: note, data: { event } })))
    .returning();
  for (const m of events) {
    const { id, kind, text, data, createdAt } = m;
    await publishToConversation(m.conversationId, {
      type: "message.created",
      conversationId: m.conversationId,
      message: { id, kind, text, data, createdAt, author: null },
    });
  }
}
