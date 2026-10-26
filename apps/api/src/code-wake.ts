import { and, eq } from "drizzle-orm";
import { enqueueTurn } from "./bot-runner";
import { codeMilestoneState, onCodeMilestone, type CodeMilestone } from "./code-sessions";
import { db, schema } from "./db";
import { newChain } from "./group";
import { postEvent } from "./messages";

/**
 * A Claude Code session wakes the bot that started it when it needs it: its run ended, it failed, or
 * it asks the bot a question. The bot no longer holds its reply open polling the session
 * (claude_code_wait): it says what it launched and stops, and a turn of its own starts later with the
 * session's report, as if the owner had written to it.
 *
 * A short delay first: a bot still waiting on the session gets the report through its poll (every
 * 3 s), and is not woken for what it already knows. A newer milestone replaces a pending one.
 */
const DELAY_MS = 8_000;
/** At most this many wake-ups per session per hour: a bot and its session can't keep each other going. */
const MAX_PER_HOUR = 6;

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const recent = new Map<string, number[]>();

export function startCodeWake() {
  onCodeMilestone((m) => {
    const timer = pending.get(m.sessionId);
    if (timer) clearTimeout(timer);
    pending.set(
      m.sessionId,
      setTimeout(() => {
        pending.delete(m.sessionId);
        wake(m).catch((err) => console.error("code wake", err));
      }, DELAY_MS),
    );
  });
}

async function wake(m: CodeMilestone) {
  const state = codeMilestoneState(m.sessionId);
  // Superseded, already read by the bot, or back at work (an instruction arrived meanwhile): nothing to say.
  if (!state || state.milestone !== m.seq || state.delivered >= m.seq) return;
  if (m.reason !== "question" && state.running) return;
  const now = Date.now();
  const times = (recent.get(m.sessionId) ?? []).filter((t) => now - t < 3_600_000);
  if (times.length >= MAX_PER_HOUR) return void console.warn(`code wake: ${m.sessionId} woke its bot ${MAX_PER_HOUR} times this hour, left alone`);
  recent.set(m.sessionId, [...times, now]);
  // The bot must still be in the conversation.
  const [bot] = await db
    .select({ name: schema.agent.name })
    .from(schema.conversationAgent)
    .innerJoin(schema.agent, eq(schema.agent.id, schema.conversationAgent.agentId))
    .where(and(eq(schema.conversationAgent.conversationId, m.conversationId), eq(schema.conversationAgent.agentId, m.agentId)));
  if (!bot) return;
  const line = await postEvent(m.conversationId, { type: "code.wake", bot: bot.name, title: m.title, sessionId: m.sessionId, reason: m.reason });
  enqueueTurn({ conversationId: m.conversationId, agentId: m.agentId, triggerId: line.id, requestedBy: m.requestedBy, chain: newChain(), wake: { sessionId: m.sessionId, reason: m.reason } });
}
