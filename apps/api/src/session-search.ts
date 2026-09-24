/**
 * Hermes's session_search tool searches all of a profile's past sessions,
 * whoever they were with: a bot several members talk to could quote one
 * member's private conversation to another. It is therefore turned off for
 * the app's sessions (api_server platform) as soon as a bot has more than one
 * member: those with access to it, and the members of the groups it is in.
 * Hermes rereads its config on every turn, so the change applies right away.
 *
 * Only what the app turned off is turned back on (when the bot has a single
 * member again): a choice made by an admin in the bot's tools stays.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { hermesCli } from "./hermes-admin";

const { agent, agentAccess, conversation, conversationAgent, conversationMember, setting } = schema;

const TOOLSET = "session_search";
/** Profiles whose session_search the app turned off (JSON array). */
const KEY = "sessionSearch.disabledProfiles";

/** Bot → number of distinct members who can talk to it. */
export async function audiences() {
  const [access, groups, bots] = await Promise.all([
    db.select({ agentId: agentAccess.agentId, userId: agentAccess.userId }).from(agentAccess),
    db
      .select({ agentId: conversationAgent.agentId, userId: conversationMember.userId })
      .from(conversationAgent)
      .innerJoin(conversation, and(eq(conversation.id, conversationAgent.conversationId), eq(conversation.kind, "group")))
      .innerJoin(conversationMember, eq(conversationMember.conversationId, conversationAgent.conversationId)),
    db.select({ id: agent.id, profile: agent.hermesProfile }).from(agent),
  ]);
  const members = new Map<string, Set<string>>();
  for (const { agentId, userId } of [...access, ...groups]) members.set(agentId, (members.get(agentId) ?? new Set()).add(userId));
  return bots.map((b) => ({ profile: b.profile, members: members.get(b.id)?.size ?? 0 }));
}

async function disabledByApp() {
  const [row] = await db.select({ value: setting.value }).from(setting).where(eq(setting.key, KEY));
  try {
    return new Set<string>(row ? JSON.parse(row.value) : []);
  } catch {
    return new Set<string>();
  }
}

async function saveDisabled(profiles: Set<string>) {
  const value = JSON.stringify([...profiles].sort());
  await db.insert(setting).values({ key: KEY, value }).onConflictDoUpdate({ target: setting.key, set: { value } });
}

/** What to change: shared bots not turned off yet, and bots the app turned off that are personal again. */
export function plan(bots: { profile: string; members: number }[], disabled: Set<string>) {
  const shared = new Set(bots.filter((b) => b.members > 1).map((b) => b.profile));
  return {
    disable: [...shared].filter((p) => !disabled.has(p)),
    enable: [...disabled].filter((p) => !shared.has(p) && bots.some((b) => b.profile === p)),
    // Bots deleted since: nothing left to turn back on.
    forget: [...disabled].filter((p) => !bots.some((b) => b.profile === p)),
  };
}

let running: Promise<void> | null = null;
let again = false;

async function sync() {
  const disabled = await disabledByApp();
  const { disable, enable, forget } = plan(await audiences(), disabled);
  for (const profile of disable) {
    // Already off (an admin's choice): left as is, and not turned back on later.
    const list = await hermesCli(["tools", "list", "--platform", "api_server"], { profile, timeoutMs: 60_000 });
    if (new RegExp(`disabled\\s+${TOOLSET}\\b`).test(list)) continue;
    await hermesCli(["tools", "disable", TOOLSET, "--platform", "api_server"], { profile, timeoutMs: 60_000 });
    disabled.add(profile);
    await saveDisabled(disabled);
  }
  for (const profile of enable) {
    await hermesCli(["tools", "enable", TOOLSET, "--platform", "api_server"], { profile, timeoutMs: 60_000 });
    disabled.delete(profile);
    await saveDisabled(disabled);
  }
  if (forget.length) {
    for (const p of forget) disabled.delete(p);
    await saveDisabled(disabled);
  }
  if (disable.length || enable.length) console.log(`session_search: off for ${disable.join(", ") || "-"}, back on for ${enable.join(", ") || "-"}`);
}

/**
 * Brings session_search in line with who can talk to each bot. Call it after
 * any change of access or of a group's members or bots; calls during a sync
 * are merged into one more pass.
 */
export function syncSessionSearch() {
  if (running) {
    again = true;
    return running;
  }
  running = sync()
    .catch((err) => console.error("session_search: sync", err))
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        void syncSessionSearch();
      }
    });
  return running;
}

