import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { bumpAgentRevision, companyMemory, hermesSessionId, turnContext } from "./company";
import { orgContext, userLocale } from "./org";
import { defineMessages, orgLocale, tr } from "./i18n";
import { renderEvent } from "@agora/core";
import { db, schema } from "./db";
import { publishToAll, publishToConversation } from "./events";
import { excerpt, findHandoffs, formatGroupContext, isNoReply, MAX_RELAYS, newChain, NO_REPLY, withQuote, type Chain, type ImplicitCall, type Quoting } from "./group";
import { dirname, join } from "node:path";
import { CLAUDE_CODE_PROVIDER, claudeCodeChat, canUseClaudeCode, isClaudeCodeModel, resolveClaudeCodeModel } from "./claude-code";
import { CODEX_PROVIDER, canUseCodex, codexChat, isCodexModel } from "./codex";
import { answerApproval, chat, profileHome, type HermesApproval } from "./hermes";
import { blockedModels, resolveHermesModel } from "./models";
import { attributeSession, recordEngineUsage, syncHermesUsage } from "./usage";
import { agentAuthor, listMessages, postEvent, postMessage, unseenMessages, type MessageDto } from "./messages";
import { connectorsPrompt, createRequest, MCP_REQUEST_PROMPT } from "./mcp-requests";
import { onboardingPrompt, parseReply, writeSoul } from "./onboarding";
import { QUESTIONS_PROMPT } from "./questions";
import { createSkillCreation, createSkillRequest, SKILL_CREATE_PROMPT, SKILL_REQUEST_PROMPT } from "./skill-requests";
import { accessibleAgentIds } from "./conversations";
import { applyTasksBlock, TASKS_PROMPT, tasksContext } from "./tasks";
import { applyAvailabilityBlock, AVAILABILITY_BLOCK_PROMPT, availabilityContext } from "./availability-bot";
import { withAttachments, withInvocations, type Invocation } from "./prompt";
import { typesForProfile } from "./integrations";
import { viewPrompt, withViewAction } from "./views";
import type { ViewAction } from "@agora/core";

const { agent, attachment, conversation, conversationAgent, conversationMember, message, pendingTurn, user } = schema;

/** A turn = one bot reply, triggered by a message (from a human, or a bot handing off to it). */
export type TurnRequest = {
  conversationId: string;
  agentId: string;
  triggerId: string;
  /** Employee who started the chain (null if unknown). */
  requestedBy: string | null;
  /** Exchange this turn belongs to, started by a human message. */
  chain: Chain;
  /** The trigger answers a request this bot made to another bot: nothing goes back automatically. */
  answer?: boolean;
  /** Called without a mention (group): the bot may stay silent. */
  implicit?: ImplicitCall;
  /** /retry: the trigger is sent again, asking for a different answer. */
  retry?: boolean;
};

/** Approval requested by the agent, as seen by conversation members. */
export type PendingApproval = { id: string; command: string; description: string; choices: string[] };

type Turn = TurnRequest & {
  turnId: string;
  controller: AbortController;
  started: boolean;
  startedAt?: string;
  text: string;
  tools: { name: string; status: string }[];
  profile?: string;
  approval?: PendingApproval & { hermes: HermesApproval };
  /** Decisions made during the turn, kept with the reply. */
  approvals: { command: string; choice: string; by: string | null }[];
};

const turns = new Map<string, Turn>();
/** Queue per (conversation, bot): a bot never handles two turns at once in the same Hermes session. */
const tails = new Map<string, Promise<void>>();

/** Runs `job` after everything already queued for this bot in this conversation. */
function enqueue(conversationId: string, agentId: string, job: () => Promise<void>) {
  const key = `${conversationId}:${agentId}`;
  const next = (tails.get(key) ?? Promise.resolve())
    .then(job)
    .catch((err) => console.error("bot-runner: turn", err))
    .finally(() => {
      if (tails.get(key) === next) tails.delete(key);
    });
  tails.set(key, next);
}

function newTurn(req: TurnRequest): Turn {
  const turn: Turn = { ...req, turnId: crypto.randomUUID(), controller: new AbortController(), started: false, text: "", tools: [], approvals: [] };
  turns.set(turn.turnId, turn);
  return turn;
}

function endTurn(turn: Turn) {
  turns.delete(turn.turnId);
  if (turn.started) setWorking(turn.agentId, -1);
  db.delete(pendingTurn)
    .where(eq(pendingTurn.id, turn.turnId))
    .catch((err) => console.error("bot-runner: pending turn", err));
}

/** Kept in the database until it ends, so that a restart of the API doesn't lose it silently. */
function rememberTurn(turn: Turn) {
  const { implicit, answer, retry, chain } = turn;
  return db
    .insert(pendingTurn)
    .values({
      id: turn.turnId,
      conversationId: turn.conversationId,
      agentId: turn.agentId,
      triggerId: turn.triggerId,
      requestedBy: turn.requestedBy,
      options: { implicit, answer, retry, chainId: chain.id, relays: chain.relays },
    })
    .catch((err) => console.error("bot-runner: pending turn", err));
}

export function enqueueTurn(req: TurnRequest) {
  const turn = newTurn(req);
  const remembered = rememberTurn(turn);
  enqueue(req.conversationId, req.agentId, async () => {
    await remembered;
    try {
      if (!turn.controller.signal.aborted && !turn.chain.stopped) await runTurn(turn);
    } finally {
      endTurn(turn);
    }
  });
  return turn.turnId;
}

/**
 * At startup: the turns left by the previous process. Those still queued are
 * resumed; those it was running are reported as interrupted, since Hermes may
 * already have acted on them (tools, messages) and resending would repeat it.
 */
export async function recoverTurns() {
  const rows = await db.delete(pendingTurn).returning();
  if (!rows.length) return;
  const chains = new Map<string, Chain>();
  const names = new Map((await db.select({ id: agent.id, name: agent.name }).from(agent).where(inArray(agent.id, [...new Set(rows.map((r) => r.agentId))]))).map((a) => [a.id, a.name]));
  for (const r of rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (r.startedAt) {
      await postEvent(r.conversationId, { type: "bot.interrupted", bot: names.get(r.agentId) ?? "?" });
      continue;
    }
    const { chainId, relays, implicit, answer, retry } = r.options;
    const chain = chains.get(chainId) ?? newChain(relays, chainId);
    chain.relays = Math.max(chain.relays, relays);
    chains.set(chainId, chain);
    enqueueTurn({ conversationId: r.conversationId, agentId: r.agentId, triggerId: r.triggerId, requestedBy: r.requestedBy, chain, implicit, answer, retry });
  }
  console.log(`bot-runner: ${rows.length} turn(s) recovered after restart`);
}

/**
 * /new: the bot starts over on an empty Hermes session. Its turns in progress
 * are stopped first; the thread's messages stay on display.
 */
export function resetSession(conversationId: string, agentId: string, actor: { id: string; name: string }) {
  abandonTurns(conversationId, agentId);
  enqueue(conversationId, agentId, async () => {
    await db
      .update(conversationAgent)
      .set({ sessionGeneration: sql`${conversationAgent.sessionGeneration} + 1`, carryOver: null })
      .where(and(eq(conversationAgent.conversationId, conversationId), eq(conversationAgent.agentId, agentId)));
    await postEvent(conversationId, { type: "session.reset", actor: actor.name });
  });
}

const COMPACT_PROMPT =
  "Résume notre conversation jusqu'ici pour qu'elle puisse continuer dans une nouvelle session sans rien perdre d'utile : " +
  "objectifs, décisions prises, faits et chiffres importants, fichiers et ressources mentionnés, travail en cours, prochaines étapes. " +
  "Réponds uniquement avec ce résumé, en listes concises, dans la langue de la conversation.";

/**
 * /compact: the bot summarizes its session, then the thread moves to a new
 * session that receives this summary with its next message.
 */
export function compactSession(conversationId: string, agentId: string, actor: { id: string; name: string }) {
  const turn = newTurn({ conversationId, agentId, triggerId: "", requestedBy: actor.id, chain: newChain() });
  enqueue(conversationId, agentId, () => (turn.controller.signal.aborted ? Promise.resolve() : runCompaction(turn, actor)).finally(() => endTurn(turn)));
  return turn.turnId;
}

async function runCompaction(turn: Turn, actor: { id: string; name: string }) {
  const { conversationId, agentId } = turn;
  const [conv] = await db.select().from(conversation).where(eq(conversation.id, conversationId));
  const [link] = await db
    .select({ link: conversationAgent, agent })
    .from(conversationAgent)
    .innerJoin(agent, eq(agent.id, conversationAgent.agentId))
    .where(and(eq(conversationAgent.conversationId, conversationId), eq(conversationAgent.agentId, agentId)));
  if (!conv || !link) return;
  // Nothing said since the last /compact: the pending summary is still the whole context.
  if (link.link.carryOver) {
    await postEvent(conversationId, { type: "session.compacted", actor: actor.name });
    return;
  }
  const bot = link.agent;
  const [requester] = await db.select().from(user).where(eq(user.id, actor.id));
  const engine = await pickEngine(bot, link.link.model, requester ?? null, actor.id);
  if (!engine) return;

  turn.started = true;
  turn.startedAt = new Date().toISOString();
  setWorking(agentId, 1);
  // The summary is not streamed: members only see that the bot is working.
  await publishToConversation(conversationId, { type: "bot.started", conversationId, turnId: turn.turnId, agentId, requestedBy: turn.requestedBy });

  const sessionId = hermesSessionId(conversationId, bot.revision, conv.kind === "group" ? agentId : undefined, link.link.sessionGeneration);
  let summary = "";
  let failed = false;
  try {
    for await (const ev of openChat(bot, engine, { sessionId, text: COMPACT_PROMPT, requestedBy: actor.id, conversationId, signal: turn.controller.signal })) {
      if (ev.type === "delta") summary += ev.text;
    }
  } catch (err) {
    failed = !turn.controller.signal.aborted;
    if (failed) console.error("bot-runner: compaction", err);
  }
  if (engine.kind === "hermes") await syncHermesUsage(bot.hermesProfile).catch((err) => console.error("bot-runner: usage sync", err));
  await publishToConversation(conversationId, { type: "bot.done", conversationId, turnId: turn.turnId, messageId: null });
  if (turn.controller.signal.aborted) return;
  summary = summary.trim();
  if (failed || !summary) {
    await postEvent(conversationId, { type: "session.compactFailed", bot: bot.name });
    return;
  }
  await db
    .update(conversationAgent)
    .set({ sessionGeneration: sql`${conversationAgent.sessionGeneration} + 1`, carryOver: summary })
    .where(and(eq(conversationAgent.conversationId, conversationId), eq(conversationAgent.agentId, agentId)));
  await postEvent(conversationId, { type: "session.compacted", actor: actor.name });
}

/** Hermes, or one of the owner's subscription CLIs (Claude Code, Codex). */
type Engine = { kind: "hermes" | "claude-code" | "codex"; model: string | null };

const isSubscriptionModel = (model: string | null) => isClaudeCodeModel(model) || isCodexModel(model);

/**
 * Claude Code or Codex if their subscription owner chose it and started the turn, Hermes otherwise.
 * Null when none of the Hermes models is allowed for the employee.
 */
async function pickEngine(
  bot: typeof agent.$inferSelect,
  model: string | null,
  requester: typeof user.$inferSelect | null,
  requestedBy: string | null,
): Promise<Engine | null> {
  const kind = isClaudeCodeModel(model) ? "claude-code" : isCodexModel(model) ? "codex" : null;
  if (kind && !bot.onboarding && requester && (kind === "claude-code" ? canUseClaudeCode(requester) : canUseCodex(requester))) {
    const id = model!.split("::")[1]!;
    const key = kind === "claude-code" ? `${CLAUDE_CODE_PROVIDER}::${resolveClaudeCodeModel(id)}` : `${CODEX_PROVIDER}::${id}`;
    // A subscription model the admin blocked for the owner: back to Hermes, like a blocked Hermes model.
    if (!(await blockedModels(requester.id).catch(() => new Set<string>())).has(key)) return { kind, model };
  }
  // Models the admin forbids for the employee who started the turn: fall back to an allowed model.
  const hermesModel = await resolveHermesModel(bot.hermesProfile, requestedBy, isSubscriptionModel(model) ? null : model).catch((err) => {
    console.error("bot-runner: allowed models", err);
    return isSubscriptionModel(model) ? null : model;
  });
  return hermesModel === undefined ? null : { kind: "hermes", model: hermesModel };
}

function openChat(
  bot: typeof agent.$inferSelect,
  engine: Engine,
  opts: { sessionId: string; text: string; images?: string[]; system?: string; readDirs?: string[]; requestedBy: string | null; conversationId: string; signal: AbortSignal },
  turn?: Turn,
) {
  if (engine.kind !== "hermes") {
    return (async function* () {
      const common = {
        sessionKey: opts.sessionId,
        text: opts.text,
        images: opts.images,
        model: engine.model!.split("::")[1]!,
        // Outside Hermes, the bot's personality is not injected automatically.
        system: [await readSoul(bot.hermesProfile), opts.system].filter(Boolean).join("\n\n"),
        signal: opts.signal,
      };
      if (engine.kind === "codex") yield* codexChat(common);
      else yield* claudeCodeChat({ ...common, readDirs: opts.readDirs ?? [] });
    })();
  }
  return (async function* () {
    // Tokens Hermes counts from now on in this session belong to this employee.
    await attributeSession(bot.hermesProfile, opts.sessionId, { userId: opts.requestedBy, agentId: bot.id, conversationId: opts.conversationId }).catch((err) =>
      console.error("bot-runner: usage attribution", err),
    );
    if (turn) turn.profile = bot.hermesProfile;
    yield* chat({ profile: bot.hermesProfile, sessionId: opts.sessionId, text: opts.text, images: opts.images, model: engine.model, system: opts.system, signal: opts.signal });
  })();
}

/** Stops a turn, and the exchange between bots it belongs to; only the employee who triggered it may do so. */
export function cancelTurn(turnId: string, conversationId: string, userId: string) {
  const turn = turns.get(turnId);
  if (!turn || turn.conversationId !== conversationId) return "not_found" as const;
  if (turn.requestedBy !== userId) return "forbidden" as const;
  turn.chain.stopped = true;
  turn.controller.abort();
  return "ok" as const;
}

/**
 * Answers a pending approval: by the employee who started the turn, or by an
 * admin. The answer also applies for members who are watching.
 */
export async function answerTurnApproval(turnId: string, conversationId: string, viewer: { id: string; role?: string | null }, approvalId: string, choice: string) {
  const turn = turns.get(turnId);
  if (!turn || turn.conversationId !== conversationId) return "not_found" as const;
  if (turn.requestedBy !== viewer.id && viewer.role !== "admin") return "forbidden" as const;
  const pending = turn.approval;
  if (!pending || pending.id !== approvalId || !turn.profile) return "not_found" as const;
  if (!pending.choices.includes(choice)) return "invalid" as const;
  await answerApproval(turn.profile, pending.hermes, choice);
  turn.approvals.push({ command: pending.command, choice, by: viewer.id });
  turn.approval = undefined;
  await publishToConversation(conversationId, { type: "bot.approval", conversationId, turnId, approval: null });
  return "ok" as const;
}

/** Abandons the turns of a bot removed from a conversation. */
export function abandonTurns(conversationId: string, agentId?: string) {
  for (const turn of turns.values()) {
    if (turn.conversationId === conversationId && (!agentId || turn.agentId === agentId)) turn.controller.abort();
  }
}

/** Turns in progress, so a client joining late sees replies already underway. */
export function activeTurns(conversationId: string) {
  return [...turns.values()]
    .filter((t) => t.conversationId === conversationId && t.started)
    .map(({ turnId, agentId, requestedBy, text, tools, approval }) => ({ turnId, agentId, requestedBy, text, tools, approval: publicApproval(approval) }));
}

/** Started turns per bot, whatever the conversation: a bot "is working" while it has at least one. */
const working = new Map<string, number>();

function setWorking(agentId: string, delta: 1 | -1) {
  const before = working.get(agentId) ?? 0;
  const after = Math.max(0, before + delta);
  if (after) working.set(agentId, after);
  else working.delete(agentId);
  if (!before !== !after) publishToAll({ type: "agent.status", agentId, working: after > 0 });
}

export const workingAgentIds = () => [...working.keys()];

/** What a bot is doing right now: its started turns, with the last tool it used. */
export function agentTurns(agentId: string) {
  return [...turns.values()]
    .filter((t) => t.agentId === agentId && t.started)
    .map((t) => ({ conversationId: t.conversationId, requestedBy: t.requestedBy, tool: t.tools.at(-1)?.name ?? null, startedAt: t.startedAt }));
}

const publicApproval = (a: Turn["approval"]): PendingApproval | null => (a ? { id: a.id, command: a.command, description: a.description, choices: a.choices } : null);

async function loadAttachments(ids: string[], conversationId: string) {
  if (!ids.length) return [];
  return db
    .select()
    .from(attachment)
    .where(and(eq(attachment.conversationId, conversationId), inArray(attachment.id, ids)));
}

type TriggerData = ({ attachments?: { id: string }[]; invocations?: Invocation[]; mentions?: string[]; viewAction?: ViewAction } & NonNullable<Quoting>) | null;

async function localeOf(userId: string | null) {
  if (!userId) return null;
  const [row] = await db.select({ locale: user.locale }).from(user).where(eq(user.id, userId));
  return row?.locale ?? null;
}

async function groupSystem(opts: { title: string; selfName: string; humans: string[]; bots: string[]; locale: string | null }) {
  const memory = (await companyMemory()).trim();
  return [
    [
      "# Ton identité",
      `Tu es « ${opts.selfName} », tel que décrit dans ta personnalité (SOUL). Si tes réponses précédentes dans cette conversation te présentaient autrement, ta configuration a changé depuis : suis celle-ci.`,
    ].join("\n"),
    ...(await orgContext(memory, opts.locale)),
    [
      "# Conversation de groupe",
      `Tu participes au groupe « ${opts.title} ».`,
      `Membres du groupe : ${opts.humans.join(", ") || "aucun"}.`,
      `Autres bots du groupe : ${opts.bots.map((b) => `@${b}`).join(", ") || "aucun"}.`,
      "On t'appelle quand on te mentionne (@Nom), qu'on répond à l'un de tes messages, qu'on te nomme ou qu'on écrit juste après ta réponse. Ne reproche jamais à quelqu'un de ne pas t'avoir mentionné. Chaque message reçu liste ce qui s'est dit depuis ta dernière intervention, préfixé par son auteur entre crochets ; ne préfixe pas ta réponse.",
      "Réponds à la dernière demande qui te concerne.",
      "Tu peux discuter avec les autres bots du groupe : chaque mention (@Nom) d'un bot le fait répondre. Mentionne-le pour lui demander quelque chose ou lui confier une partie du travail ; quand un bot t'a sollicité, ta réponse lui revient d'elle-même. Ne mentionne jamais un bot pour le remercier, le saluer ou conclure : ça relancerait l'échange pour rien. Pour parler d'un bot sans le solliciter, écris son nom sans @.",
      "Quand l'échange a abouti, conclus à l'attention des membres sans mentionner de bot : c'est ce qui y met fin.",
      "Ta mémoire « USER PROFILE » est commune à tous les membres : quand tu y notes quelque chose sur une personne, préfixe-le par son nom.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function runTurn(turn: Turn) {
  const { conversationId, agentId } = turn;
  const [conv] = await db.select().from(conversation).where(eq(conversation.id, conversationId));
  const [link] = await db
    .select({ link: conversationAgent, agent })
    .from(conversationAgent)
    .innerJoin(agent, eq(agent.id, conversationAgent.agentId))
    .where(and(eq(conversationAgent.conversationId, conversationId), eq(conversationAgent.agentId, agentId)));
  const [trigger] = await db.select().from(message).where(eq(message.id, turn.triggerId));
  if (!conv || !link || !trigger) return;
  const bot = link.agent;
  const group = conv.kind === "group";

  turn.started = true;
  turn.startedAt = new Date().toISOString();
  setWorking(agentId, 1);
  await db.update(pendingTurn).set({ startedAt: new Date() }).where(eq(pendingTurn.id, turn.turnId));
  await publishToConversation(conversationId, { type: "bot.started", conversationId, turnId: turn.turnId, agentId, requestedBy: turn.requestedBy });

  // Build the message sent to Hermes.
  const data = trigger.data as TriggerData;
  // Called without a mention, or by another bot: it may stay silent.
  const fromBot = !!trigger.authorAgentId;
  const optional = group && (!!turn.implicit || fromBot);
  const files = await loadAttachments((data?.attachments ?? []).map((a) => a.id), conversationId);
  let text: string;
  let system: string;
  let groupBots: { id: string; name: string }[] = [];
  /** Employees whose tasks the bot sees. */
  let people: { id: string; name: string }[] = [];
  /** Direct conversation: the employee's other bots, which this bot may bring into a group. */
  let otherBots: { id: string; name: string }[] = [];
  const [requester] = !group && trigger.authorUserId ? await db.select().from(user).where(eq(user.id, trigger.authorUserId)) : [];
  if (group) {
    const [humans, bots, context] = await Promise.all([
      db
        .select({ id: user.id, name: user.name })
        .from(conversationMember)
        .innerJoin(user, eq(user.id, conversationMember.userId))
        .where(eq(conversationMember.conversationId, conversationId)),
      db
        .select({ id: agent.id, name: agent.name })
        .from(conversationAgent)
        .innerJoin(agent, eq(agent.id, conversationAgent.agentId))
        .where(eq(conversationAgent.conversationId, conversationId)),
      unseenMessages(conversationId, agentId, trigger.id),
    ]);
    groupBots = bots;
    people = humans;
    const history = formatGroupContext(
      context.map((m) => ({
        kind: m.kind,
        text: m.text,
        authorName: m.author?.name ?? null,
        authorAgentId: m.author?.kind === "agent" ? m.author.id : null,
        attachments: (m.data as { attachments?: { name: string }[] } | null)?.attachments,
        quoting: m.data as Quoting,
      })),
      agentId,
    );
    const by = context.at(-1)?.author;
    const ask =
      fromBot && by?.kind === "agent"
        ? `Le bot ${by.name} te sollicite : réponds-lui maintenant. S'il n'attend rien de toi (remerciement, simple conclusion), réponds uniquement ${NO_REPLY}.`
        : `${by?.name ?? "Un salarié"} te mentionne. Réponds maintenant.`;
    const who = by?.name ?? "Un salarié";
    const why = {
      reply: `${who} répond à l'un de tes messages, sans te mentionner.`,
      named: `${who} parle de toi, sans te mentionner avec @.`,
      followUp: `${who} écrit juste après ta réponse, sans mentionner personne : c'est peut-être la suite de votre échange.`,
    };
    text = turn.implicit
      ? `Nouveaux messages du groupe depuis ta dernière intervention :\n\n${history}\n\n---\n\n${why[turn.implicit]} ` +
        `Réponds s'il s'adresse à toi ou attend quelque chose de toi : une question, une demande, une consigne, un feu vert, une information qui change ton travail. Dans le doute, réponds. ` +
        `S'il n'appelle rien de ta part (remerciement, simple accusé de réception, message clairement destiné à quelqu'un d'autre), réponds uniquement ${NO_REPLY}.`
      : `Nouveaux messages du groupe depuis ta dernière intervention :\n\n${history}\n\n---\n\n${ask}`;
    // Skills invoked for this bot with "/".
    const invoked = (data?.invocations ?? []).filter((v) => v.kind !== "routine" && v.agentId === agentId);
    text = withViewAction(await withInvocations(bot.hermesProfile, text, invoked), data?.viewAction);
    system = await groupSystem({
      title: conv.title ?? "sans nom",
      selfName: bot.name,
      humans: humans.map((h) => h.name),
      bots: bots.filter((b) => b.id !== agentId).map((b) => b.name),
      // Language of the member who started the turn (including when a bot hands off).
      locale: await localeOf(trigger.authorUserId ?? turn.requestedBy),
    });
  } else {
    text = withViewAction(await withInvocations(bot.hermesProfile, withQuote(trigger.text, data), data?.invocations ?? []), data?.viewAction);
    if (bot.onboarding) {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(message)
        .where(and(eq(message.conversationId, conversationId), eq(message.kind, "user")));
      text = onboardingPrompt({ userName: requester?.name ?? "", text, turn: n ?? 1, locale: await userLocale(requester?.locale) });
    }
    system = await turnContext(requester ?? { name: "un membre", email: "inconnu" }, bot.name);
    if (requester) people = [{ id: requester.id, name: requester.name }];
    if (requester && !bot.onboarding) {
      otherBots = await relayableBots(requester.id, agentId).catch((err) => {
        console.error("bot-runner: other bots", err);
        return [];
      });
      if (otherBots.length) system = [system, relayPrompt(requester.name, otherBots)].join("\n\n");
    }
  }
  // Outside initial setup, the bot may request a missing MCP connector.
  if (!bot.onboarding) {
    const [tasks, schedules, views] = await Promise.all([
      tasksContext(people).catch((err) => {
        console.error("bot-runner: tasks context", err);
        return "";
      }),
      availabilityContext(people).catch((err) => {
        console.error("bot-runner: availability context", err);
        return "";
      }),
      typesForProfile(bot.hermesProfile).then(viewPrompt, (err) => {
        console.error("bot-runner: integration types", err);
        return "";
      }),
    ]);
    system = [system, QUESTIONS_PROMPT, MCP_REQUEST_PROMPT, SKILL_REQUEST_PROMPT, SKILL_CREATE_PROMPT, TASKS_PROMPT, tasks, AVAILABILITY_BLOCK_PROMPT, schedules, views]
      .filter(Boolean)
      .join("\n\n");
  }
  // /retry: same message again, but the previous answer is already in the session.
  if (turn.retry) text = `${text}\n\n---\n\n(Nouvelle tentative : ta réponse précédente à ce message ne convenait pas. Propose une autre réponse, sans y faire référence.)`;
  // First message after /compact: the new session starts from the summary.
  const carryOver = link.link.carryOver;
  if (carryOver) text = `${carried(carryOver)}\n\n---\n\n${text}`;
  const prompt = await withAttachments(text, files);

  const sessionId = hermesSessionId(conversationId, bot.revision, group ? agentId : undefined, link.link.sessionGeneration);
  const engine = await pickEngine(bot, link.link.model, requester ?? null, turn.requestedBy);
  if (!engine) {
    const event = { type: "bot.noAllowedModel", bot: bot.name } as const;
    await publishToConversation(conversationId, { type: "bot.error", conversationId, turnId: turn.turnId, message: renderEvent(event, await userLocale(await localeOf(turn.requestedBy))) });
    await postEvent(conversationId, event);
    return;
  }
  if (!bot.onboarding) {
    const connectors = await connectorsPrompt(bot.hermesProfile, engine.kind).catch((err) => {
      console.error("bot-runner: connectors context", err);
      return "";
    });
    if (connectors) system = [system, connectors].filter(Boolean).join("\n\n");
  }
  const events = openChat(
    bot,
    engine,
    { sessionId, text: prompt.text, images: prompt.images, system, readDirs: files.map((f) => dirname(f.path)), requestedBy: turn.requestedBy, conversationId, signal: turn.controller.signal },
    turn,
  );

  // Reply streamed live to all members.
  let reply = "";
  let failed = false;
  try {
    for await (const ev of events) {
      if (ev.type === "delta") {
        reply += ev.text;
        turn.text = reply;
        await publishToConversation(conversationId, { type: "bot.delta", conversationId, turnId: turn.turnId, text: ev.text });
      } else if (ev.type === "approval") {
        turn.approval = { id: crypto.randomUUID(), command: ev.approval.command, description: ev.approval.description, choices: ev.approval.choices, hermes: ev.approval };
        await publishToConversation(conversationId, { type: "bot.approval", conversationId, turnId: turn.turnId, approval: publicApproval(turn.approval) });
      } else if (ev.type === "usage") {
        // Only the subscription engines report usage per reply (Hermes' is read from its state.db).
        if (engine.kind !== "hermes") {
          await recordEngineUsage(engine.kind, ev.usage, { userId: turn.requestedBy, agentId, conversationId, sessionId }).catch((err) =>
            console.error("bot-runner: usage", err),
          );
        }
      } else if (ev.type === "approval.resolved") {
        if (turn.approval) {
          // Answer came from elsewhere (timeout, another client): record it anyway.
          turn.approvals.push({ command: turn.approval.command, choice: ev.choice, by: null });
          turn.approval = undefined;
          await publishToConversation(conversationId, { type: "bot.approval", conversationId, turnId: turn.turnId, approval: null });
        }
      } else {
        turn.tools.push({ name: ev.name, status: ev.status });
        await publishToConversation(conversationId, { type: "bot.tool", conversationId, turnId: turn.turnId, name: ev.name, status: ev.status, label: ev.label });
      }
    }
  } catch (err) {
    failed = !turn.controller.signal.aborted;
    if (failed) console.error(`${engine.kind} chat failed`, err);
  }

  // Before the next turn in this session, which may be another employee's (group).
  if (engine.kind === "hermes") await syncHermesUsage(bot.hermesProfile).catch((err) => console.error("bot-runner: usage sync", err));

  // Bot removed during the turn: save nothing.
  const [still] = await db
    .select({ agentId: conversationAgent.agentId })
    .from(conversationAgent)
    .where(and(eq(conversationAgent.conversationId, conversationId), eq(conversationAgent.agentId, agentId)));
  if (!still) {
    await publishToConversation(conversationId, { type: "bot.done", conversationId, turnId: turn.turnId, messageId: null });
    return;
  }

  // Even if interrupted, keep what the agent already replied.
  const parsed = parseReply(reply);
  if (optional && isNoReply(parsed.text)) parsed.text = "";
  let saved: Awaited<ReturnType<typeof postMessage>> | null = null;
  const request =
    parsed.mcpRequest && !turn.controller.signal.aborted
      ? await createRequest(parsed.mcpRequest, { conversationId, agentId, requestedBy: turn.requestedBy }).catch((err) => {
          console.error("bot-runner: connector request", err);
          return null;
        })
      : null;
  // One skill card per message: a written skill wins over a hub request.
  const skillCtx = { conversationId, agentId, requestedBy: turn.requestedBy };
  const skill =
    (parsed.skillCreate || parsed.skillRequest) && !turn.controller.signal.aborted
      ? await (parsed.skillCreate ? createSkillCreation(parsed.skillCreate, skillCtx) : createSkillRequest(parsed.skillRequest!, skillCtx)).catch((err) => {
          console.error("bot-runner: skill request", err);
          return null;
        })
      : null;
  if (parsed.tasks && !turn.controller.signal.aborted) {
    await applyTasksBlock(parsed.tasks, { conversationId, agentId, botName: bot.name, requestedBy: turn.requestedBy }).catch((err) =>
      console.error("bot-runner: tasks", err),
    );
  }
  if (parsed.availability && !turn.controller.signal.aborted) {
    await applyAvailabilityBlock(parsed.availability, { conversationId, botName: bot.name, requestedBy: turn.requestedBy }).catch((err) =>
      console.error("bot-runner: availability", err),
    );
  }
  if (parsed.text || parsed.choices || parsed.questions || parsed.views || request || skill) {
    const extra = {
      ...(turn.tools.length && { tools: turn.tools }),
      ...(turn.approvals.length && { approvals: turn.approvals }),
      ...(parsed.choices && { choices: parsed.choices }),
      ...(parsed.questions && { questions: parsed.questions }),
      ...(parsed.views && { views: parsed.views }),
      ...(request && { mcpRequest: request.id }),
      ...(skill && { skillRequest: skill.id }),
    };
    saved = await postMessage(
      {
        id: crypto.randomUUID(),
        conversationId,
        kind: "bot",
        authorAgentId: agentId,
        text: parsed.text,
        data: Object.keys(extra).length ? extra : null,
      },
      agentAuthor(bot),
    );
  }
  if (failed) {
    const event = { type: "bot.failed", bot: bot.name } as const;
    await publishToConversation(conversationId, { type: "bot.error", conversationId, turnId: turn.turnId, message: renderEvent(event, await userLocale(await localeOf(turn.requestedBy))) });
    await postEvent(conversationId, event);
    return;
  }
  await publishToConversation(conversationId, { type: "bot.done", conversationId, turnId: turn.turnId, messageId: saved?.id ?? null });
  // Only up to the trigger message: whatever was written during the reply still needs to be passed to it.
  // The /compact summary is now in the new session.
  await db
    .update(conversationAgent)
    .set({ seenUntil: sql`(select ${message.createdAt} from ${message} where ${message.id} = ${trigger.id})`, ...(carryOver && { carryOver: null }) })
    .where(and(eq(conversationAgent.conversationId, conversationId), eq(conversationAgent.agentId, agentId)));

  if (!saved || turn.controller.signal.aborted || turn.chain.stopped) {
    if (!group) await finishOnboarding(bot, parsed, conversationId);
    return;
  }

  if (!group) {
    await finishOnboarding(bot, parsed, conversationId);
    // The bot mentions other bots of the employee: the exchange continues in a group.
    const targets = findHandoffs(parsed.text, otherBots, agentId);
    if (targets.length && requester) {
      await openRelayGroup({ originId: conversationId, bot, requester, targets: otherBots.filter((b) => targets.includes(b.id)), message: saved, chain: turn.chain }).catch(
        (err) => console.error("bot-runner: relay group", err),
      );
    }
    return;
  }

  // The bot mentions other bots of the group: each one answers in turn.
  const mentioned = findHandoffs(parsed.text, groupBots, agentId);
  // Answering a bot that asked it something, without mentioning anyone (or with a
  // garbled mention): the asker gets the answer back and may stay silent.
  const asker = !turn.answer && trigger.authorAgentId && findHandoffs(trigger.text, groupBots, trigger.authorAgentId).includes(agentId) ? trigger.authorAgentId : null;
  const targets: { agentId: string; implicit?: ImplicitCall }[] = mentioned.length
    ? mentioned.map((id) => ({ agentId: id }))
    : asker && asker !== agentId
      ? [{ agentId: asker, implicit: "reply" }]
      : [];
  for (const target of targets) {
    if (turn.chain.relays >= MAX_RELAYS) {
      // Reported once per exchange, even when several bots reach it.
      if (turn.chain.limited) return;
      turn.chain.limited = true;
      await postEvent(conversationId, { type: "relay.limit" });
      return;
    }
    turn.chain.relays++;
    enqueueTurn({ conversationId, ...target, triggerId: saved.id, requestedBy: turn.requestedBy, chain: turn.chain, answer: target.agentId === trigger.authorAgentId });
  }
}


/** Context carried into a bot's next message: a /compact summary, or a titled excerpt (relay group). */
const carried = (text: string) => (text.startsWith("# ") ? text : `Résumé de notre conversation jusqu'ici (le contexte a été compacté) :\n\n${text}`);

/** The employee's other bots, which a bot of their direct conversation may bring into a group. */
async function relayableBots(userId: string, selfId: string) {
  const ids = [...(await accessibleAgentIds(userId))].filter((id) => id !== selfId);
  if (!ids.length) return [];
  const rows = await db.select({ id: agent.id, name: agent.name, onboarding: agent.onboarding }).from(agent).where(inArray(agent.id, ids));
  return rows.filter((a) => !a.onboarding && a.name.trim()).map(({ id, name }) => ({ id, name }));
}

const relayPrompt = (userName: string, bots: { name: string }[]) =>
  [
    "# Autres bots",
    `Bots que ${userName} utilise aussi : ${bots.map((b) => `@${b.name}`).join(", ")}.`,
    `Quand l'aide de l'un d'eux est nécessaire, mentionne-le (@Nom) : un groupe s'ouvre avec ${userName}, toi et lui, où vous poursuivez l'échange ensemble. Il ne voit pas cette conversation : écris-lui une demande qui se suffit à elle-même.`,
    "Ne mentionne jamais un bot sans avoir besoin de lui : pour en parler, écris son nom sans @.",
  ].join("\n");

/** Messages of the direct conversation passed to the bot that opens a group from it. */
const RELAY_EXCERPT = 20;

/**
 * A bot mentioned other bots in a direct conversation: the exchange continues
 * in a group with the employee, the bot and those bots, opened from this
 * conversation (the same group each time for the same bots). The bot's message
 * is posted there, and each mentioned bot answers it.
 */
async function openRelayGroup(opts: {
  originId: string;
  bot: typeof agent.$inferSelect;
  requester: { id: string; name: string };
  targets: { id: string; name: string }[];
  message: MessageDto;
  chain: Chain;
}) {
  const { originId, bot, requester, targets } = opts;
  const wanted = [bot.id, ...targets.map((t) => t.id)];
  // Group already opened from this conversation, still with the employee and these bots.
  const groups = await db
    .select({ id: conversation.id })
    .from(conversation)
    .innerJoin(conversationMember, and(eq(conversationMember.conversationId, conversation.id), eq(conversationMember.userId, requester.id)))
    .where(and(eq(conversation.originId, originId), eq(conversation.kind, "group")))
    .orderBy(desc(conversation.updatedAt));
  const links = groups.length
    ? await db
        .select({ conversationId: conversationAgent.conversationId, agentId: conversationAgent.agentId })
        .from(conversationAgent)
        .where(inArray(conversationAgent.conversationId, groups.map((g) => g.id)))
    : [];
  const existing = groups.find((g) => wanted.every((id) => links.some((l) => l.conversationId === g.id && l.agentId === id)))?.id;

  // What was said in private, for the bot: its new session in the group starts without it.
  const history = (await listMessages(originId, RELAY_EXCERPT * 2)).filter((m) => m.kind !== "event").slice(-RELAY_EXCERPT);
  const excerptText = formatGroupContext(
    history.map((m) => ({ kind: m.kind, text: excerpt(m.text, 2000), authorName: m.author?.name ?? null, authorAgentId: m.author?.kind === "agent" ? m.author.id : null })),
    "",
  );
  const carryOver = `# Contexte\nTu as ouvert ce groupe depuis ta conversation privée avec ${requester.name}, en y sollicitant ${targets.map((t) => `@${t.name}`).join(", ")}. Derniers échanges de cette conversation :\n\n${excerptText}`;

  const groupId = existing ?? crypto.randomUUID();
  if (existing) {
    await db
      .update(conversationAgent)
      .set({ carryOver })
      .where(and(eq(conversationAgent.conversationId, groupId), eq(conversationAgent.agentId, bot.id)));
  } else {
    await db.transaction(async (tx) => {
      await tx.insert(conversation).values({ id: groupId, kind: "group", createdBy: requester.id, originId });
      await tx.insert(conversationMember).values({ conversationId: groupId, userId: requester.id });
      await tx
        .insert(conversationAgent)
        .values(wanted.map((agentId) => ({ conversationId: groupId, agentId, addedBy: requester.id, ...(agentId === bot.id && { carryOver }) })));
    });
    await postEvent(groupId, { type: "group.created", actor: bot.name });
  }
  const relayed = await postMessage(
    { id: crypto.randomUUID(), conversationId: groupId, kind: "bot", authorAgentId: bot.id, text: opts.message.text, data: null },
    agentAuthor(bot),
  );
  await publishToConversation(groupId, { type: "conversation.updated", conversationId: groupId });
  await postEvent(originId, { type: "relay.group", bot: bot.name, bots: targets.map((t) => t.name), conversationId: groupId });
  for (const target of targets) {
    opts.chain.relays++;
    enqueueTurn({ conversationId: groupId, agentId: target.id, triggerId: relayed.id, requestedBy: requester.id, chain: opts.chain });
  }
}

/** The bot's personality (SOUL.md of its Hermes profile), if readable from here. */
async function readSoul(profile: string) {
  try {
    const soul = (await Bun.file(join(profileHome(profile), "SOUL.md")).text()).trim();
    return soul && `# Ta personnalité (SOUL)\n\n${soul}`;
  } catch {
    return "";
  }
}

/** Finishes setting up a "Nouveau Bot": name chosen, then SOUL.md written. */
async function finishOnboarding(bot: typeof agent.$inferSelect, parsed: ReturnType<typeof parseReply>, conversationId: string) {
  if (!bot.onboarding) return;
  if (parsed.name && !parsed.profile && parsed.name !== bot.name) {
    await db.update(agent).set({ name: parsed.name }).where(eq(agent.id, bot.id));
    await publishToConversation(conversationId, { type: "conversation.updated", conversationId });
  }
  if (!parsed.profile) return;
  try {
    await writeSoul(bot.hermesProfile, parsed.profile);
    await db.update(agent).set({ name: parsed.profile.name, onboarding: false }).where(eq(agent.id, bot.id));
    // New Hermes session: the old one caches the "Nouveau Bot" identity.
    // Event seen by every member of the bot's conversations: organization language.
    await bumpAgentRevision(bot.id, { type: "agent.ready", name: parsed.profile.name });
    await publishToConversation(conversationId, { type: "conversation.updated", conversationId });
  } catch (err) {
    console.error("onboarding: profile not saved", err);
  }
}
