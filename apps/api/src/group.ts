/** Pure conversation logic: direct keys, group context, bot-to-bot handoffs. */

/** Maximum number of bot turns other bots may trigger from a single human message. */
export const MAX_RELAYS = 12;

/**
 * Exchange between bots started by one human message, shared by all its turns:
 * each mention of a bot by a bot spends a relay, and stopping one of its turns
 * stops the whole exchange.
 */
export type Chain = { id: string; relays: number; stopped: boolean; limited: boolean };

export const newChain = (relays = 0, id: string = crypto.randomUUID()): Chain => ({ id, relays, stopped: false, limited: false });

export type Party = { kind: "user" | "agent"; id: string };

/** Unique key of a direct conversation, independent of participant order. */
export function directKey(a: Party, b: Party) {
  return [a, b]
    .map((p) => `${p.kind === "user" ? "u" : "a"}:${p.id}`)
    .sort()
    .join("|");
}

/** Snapshot of the message being answered, frozen at send time. */
export type ReplyTo = {
  id: string;
  authorName: string;
  /** Set when the quoted message is a bot's: a reply calls that bot. */
  authorAgentId?: string;
  text: string;
  attachment?: { id: string; name: string; mime: string };
};

/**
 * What a bot answers when a message it wasn't mentioned in calls for nothing
 * (thanks, acknowledgement): the turn then ends without a message.
 */
export const NO_REPLY = "NO_REPLY";

export const isNoReply = (text: string) => text.trim().replace(/[.\s]+$/, "") === NO_REPLY;

/** Original author of a forwarded message. */
export type Forwarded = { authorName: string };

export type Quoting = { replyTo?: ReplyTo; forwarded?: Forwarded } | null | undefined;

const EXCERPT = 280;

/** Short excerpt of a message, on one line. */
export const excerpt = (text: string, max = EXCERPT) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** Tells a bot that a message answers or forwards another one. */
export function withQuote(text: string, data: Quoting) {
  if (data?.forwarded) return `(Message transféré, écrit à l'origine par ${data.forwarded.authorName})\n${text}`;
  const q = data?.replyTo;
  if (!q) return text;
  const quoted = q.text || (q.attachment ? `[fichier : ${q.attachment.name}]` : "");
  return `(En réponse à ${q.authorName} : « ${quoted} »)\n${text}`;
}

export type ContextMessage = {
  kind: "user" | "bot" | "event";
  text: string;
  authorName: string | null;
  authorAgentId: string | null;
  attachments?: { name: string }[];
  quoting?: Quoting;
};

/**
 * What the bot hasn't seen yet in the group, author by author. Its own
 * messages are already in its Hermes session, so they are not resent.
 */
export function formatGroupContext(messages: ContextMessage[], selfAgentId: string) {
  return messages
    .filter((m) => !(m.kind === "bot" && m.authorAgentId === selfAgentId))
    .map((m) => {
      if (m.kind === "event") return `(${m.text})`;
      const who = m.kind === "bot" ? `Bot ${m.authorName ?? "?"}` : (m.authorName ?? "?");
      const files = m.attachments?.length ? ` [fichiers : ${m.attachments.map((a) => a.name).join(", ")}]` : "";
      return `[${who}] ${withQuote(m.text, m.quoting)}${files}`;
    })
    .join("\n\n");
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** How long after a bot's reply a message without a mention may still be the rest of the exchange. */
export const FOLLOW_UP_MS = 10 * 60_000;

/**
 * Why a bot is called without being mentioned: a reply to one of its
 * messages, its name written without "@", or a message right after its reply.
 * It then decides whether the message calls for an answer.
 */
export type ImplicitCall = "reply" | "named" | "followUp";

export type GroupCall = { agentId: string; implicit?: ImplicitCall };

/**
 * Bots a member's message calls in a group. Mentions are always answered;
 * without any, the bots the message is likely addressed to are called and
 * may stay silent. A message mentioning a colleague ("@Léa") calls no one else.
 */
export function groupCalls(opts: {
  text: string;
  mentions: string[];
  /** Bot whose message is being answered. */
  repliedTo?: string;
  agents: { id: string; name: string }[];
  /** Last message before this one, if it is a bot's. */
  lastBot?: { agentId: string; at: Date } | null;
  now: Date;
}): GroupCall[] {
  const inGroup = (id: string) => opts.agents.some((a) => a.id === id);
  const calls: GroupCall[] = opts.mentions.filter(inGroup).map((agentId) => ({ agentId }));
  const add = (agentId: string, implicit: ImplicitCall) => {
    if (inGroup(agentId) && !calls.some((c) => c.agentId === agentId)) calls.push({ agentId, implicit });
  };
  if (opts.repliedTo) add(opts.repliedTo, "reply");
  if (calls.length || /@[\p{L}\p{N}_]/u.test(opts.text)) return calls;
  for (const a of opts.agents) {
    if (a.name.trim() && new RegExp(`(?<![\\p{L}\\p{N}_])${escape(a.name.trim())}(?![\\p{L}\\p{N}_])`, "iu").test(opts.text)) add(a.id, "named");
  }
  if (!calls.length && opts.lastBot && opts.now.getTime() - opts.lastBot.at.getTime() <= FOLLOW_UP_MS) add(opts.lastBot.agentId, "followUp");
  return calls;
}

/**
 * Bots mentioned ("@Name") in a reply, in order of appearance, with no
 * duplicates and excluding the bot itself. Longer names are tried first so
 * that "@Agent Immobilier" isn't read as "@Agent".
 */
export function findHandoffs(reply: string, agents: { id: string; name: string }[], selfId: string) {
  const candidates = agents.filter((a) => a.id !== selfId && a.name.trim()).sort((a, b) => b.name.length - a.name.length);
  if (!candidates.length) return [];
  const pattern = new RegExp(`@(${candidates.map((a) => escape(a.name)).join("|")})(?![\\p{L}\\p{N}_])`, "giu");
  const found: string[] = [];
  for (const m of reply.matchAll(pattern)) {
    const hit = candidates.find((a) => a.name.toLowerCase() === m[1]!.toLowerCase());
    if (hit && !found.includes(hit.id)) found.push(hit.id);
  }
  return found;
}
