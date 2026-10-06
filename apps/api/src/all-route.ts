/**
 * "@all" in a group: one call to the default Hermes profile reads the message
 * and the bots' roles, and only the bots it concerns answer. When the router
 * can't be asked (no Hermes, error, unreadable reply), every bot is called and
 * may stay silent.
 */
import { join } from "node:path";
import { enqueueTurn } from "./bot-runner";
import { env } from "./env";
import { allRoutePrompt, excerpt, formatGroupContext, parseAllRoute, soulRole, withQuote, type Chain, type Quoting, type RoutedBot } from "./group";
import { chat, profileHome } from "./hermes";
import { listMessages, postEvent } from "./messages";

/** Messages before the "@all" one given to the router, for what "it" or "that" refers to. */
const HISTORY = 12;

async function roleOf(profile: string) {
  try {
    return soulRole(await Bun.file(join(profileHome(profile), "SOUL.md")).text());
  } catch {
    return "";
  }
}

/** Ids of the bots the message concerns, in order; null when the router couldn't answer. */
async function route(conversationId: string, triggerId: string, bots: { id: string; name: string; hermesProfile: string }[]) {
  if (!env.HERMES_API_URL) return null;
  const [roles, recent] = await Promise.all([
    Promise.all(bots.map(async (b): Promise<RoutedBot> => ({ id: b.id, name: b.name, role: await roleOf(b.hermesProfile) }))),
    listMessages(conversationId, HISTORY + 1),
  ]);
  const at = recent.findIndex((m) => m.id === triggerId);
  const trigger = recent[at];
  if (!trigger) return null;
  const history = formatGroupContext(
    recent.slice(0, at).map((m) => ({
      kind: m.kind,
      text: excerpt(m.text, 1000),
      authorName: m.author?.name ?? null,
      authorAgentId: m.author?.kind === "agent" ? m.author.id : null,
    })),
    "",
  );
  let reply = "";
  for await (const ev of chat({
    profile: "default",
    sessionId: `agora-all-${triggerId}`,
    // The default profile is also the "Admin Serveur" agent: the router role is passed as a system message.
    system: "Dans cette session, tu n'es pas l'assistant d'un membre : tu choisis uniquement quels bots doivent répondre à un message. Ignore ta personnalité habituelle et n'utilise aucun outil.",
    text: allRoutePrompt({ text: `[${trigger.author?.name ?? "?"}] ${withQuote(trigger.text, trigger.data as Quoting)}`, history, bots: roles }),
    signal: AbortSignal.timeout(90_000),
  })) {
    if (ev.type === "delta") reply += ev.text;
  }
  return parseAllRoute(reply, bots);
}

/**
 * Calls the bots a "@all" message concerns, among `bots` (the group's bots not
 * already called by name). Runs in the background of the send.
 */
export async function callAll(opts: {
  conversationId: string;
  triggerId: string;
  requestedBy: string;
  chain: Chain;
  bots: { id: string; name: string; hermesProfile: string }[];
}) {
  const { conversationId, triggerId, requestedBy, chain, bots } = opts;
  if (!bots.length) return;
  const picked = await route(conversationId, triggerId, bots).catch((err) => {
    console.error("all-route: route", err);
    return null;
  });
  if (chain.stopped) return;
  if (picked === null) {
    // No router: each bot judges for itself and may stay silent.
    for (const b of bots) enqueueTurn({ conversationId, agentId: b.id, triggerId, requestedBy, chain, implicit: "all" });
    return;
  }
  if (!picked.length) {
    await postEvent(conversationId, { type: "all.none" });
    return;
  }
  for (const agentId of picked) enqueueTurn({ conversationId, agentId, triggerId, requestedBy, chain });
}
