import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { agentTurns } from "../bot-runner";
import { accessibleAgentIds, agentDto } from "../conversations";
import { db, schema } from "../db";
import { directKey } from "../group";
import { createProfile, HermesError } from "../hermes-admin";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { greeting, newBotName, newBotIdentity } from "../onboarding";
import { errors } from "../errors.messages";
import { tr } from "../i18n";
import { userLocale } from "../org";
import { listAgentRoutines } from "../routines";

const { agent, agentAccess, conversation, conversationAgent, conversationMember, message } = schema;

/** Messaging goes through /conversations; this is only the bot directory and bot creation. */
export const agents = new Hono<AppEnv>()
  .use(requireUser)

  /** Bots the employee can access (NewChat, marketplace). */
  .get("/", async (c) => {
    const rows = await db
      .select({ agent })
      .from(agentAccess)
      .innerJoin(agent, eq(agent.id, agentAccess.agentId))
      .where(eq(agentAccess.userId, c.get("user").id))
      .orderBy(asc(agent.name));
    return c.json(rows.map((r) => agentDto(r.agent)));
  })

  /** A bot's profile, visible to everyone like a colleague's; `access`: the employee may write to it. */
  .get("/:id", async (c) => {
    const [row] = await db.select().from(agent).where(eq(agent.id, c.req.param("id")));
    if (!row) return c.json({ error: tr(errors).botNotFound }, 404);
    const access = await accessibleAgentIds(c.get("user").id);
    return c.json({ ...agentDto(row), createdAt: row.createdAt, access: access.has(row.id) });
  })

  /**
   * What the bot is doing right now and its routines. Only what happens in the
   * employee's own conversations is detailed: another employee's work (and
   * routines) stays theirs; `elsewhere` counts the turns underway in the others.
   */
  .get("/:id/activity", async (c) => {
    const [row] = await db.select().from(agent).where(eq(agent.id, c.req.param("id")));
    if (!row) return c.json({ error: tr(errors).botNotFound }, 404);
    const mine = new Set(
      (
        await db.select({ id: conversationMember.conversationId }).from(conversationMember).where(eq(conversationMember.userId, c.get("user").id))
      ).map((r) => r.id),
    );
    const turns = agentTurns(row.id);
    const routines = await listAgentRoutines(row.hermesProfile);
    return c.json({
      turns: turns.filter((t) => mine.has(t.conversationId)),
      elsewhere: turns.filter((t) => !mine.has(t.conversationId)).length,
      routines: routines.filter((r) => r.conversationId && mine.has(r.conversationId)),
    });
  })

  /**
   * Creates a "New Bot" (Hermes profile cloned from the default profile) and
   * opens its conversation on the greeting message: it then configures itself through chat.
   */
  .post("/", requireAdmin, async (c) => {
    const user = c.get("user");
    const identity = newBotIdentity();
    // Greeting and temporary name in the language of the admin who creates the bot (their conversation).
    const locale = await userLocale(user.locale);
    const name = newBotName(locale);
    try {
      await createProfile(identity.hermesProfile, `Agent « ${name} »`);
    } catch (err) {
      const message = err instanceof HermesError ? err.message : tr(errors).profileCreateFailed;
      return c.json({ error: message }, 502);
    }
    const id = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const hello = greeting(user.name, locale);
    await db.transaction(async (tx) => {
      await tx.insert(agent).values({ id, name, onboarding: true, ...identity });
      await tx.insert(agentAccess).values({ userId: user.id, agentId: id });
      await tx.insert(conversation).values({
        id: conversationId,
        kind: "direct",
        directKey: directKey({ kind: "user", id: user.id }, { kind: "agent", id }),
        createdBy: user.id,
      });
      await tx.insert(conversationMember).values({ conversationId, userId: user.id });
      await tx.insert(conversationAgent).values({ conversationId, agentId: id, addedBy: user.id });
      await tx.insert(message).values({
        id: crypto.randomUUID(),
        conversationId,
        kind: "bot",
        authorAgentId: id,
        text: hello.text,
        data: { choices: hello.choices },
      });
    });
    return c.json({ id, conversationId }, 201);
  });
