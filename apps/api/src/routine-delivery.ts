/**
 * A routine's result in the conversation it was created from (Figma « Mode simple », 7 · Résultat de
 * routine): Hermes runs the cron job and writes each run to `cron/output/<job>/<time>.md`, but its
 * `origin` delivery has nowhere to go for an Agora conversation. Every minute, the runs written since
 * the last pass are posted there as the bot's reply, with the routine they come from (`data.routine`),
 * which notifies the person like any new message. Nothing is posted for runs from before this existed.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";
import { profileHome } from "./hermes";
import { agentAuthor, postMessage } from "./messages";
import { listAgentRoutines } from "./routines";

const { agent, conversation, conversationAgent, setting } = schema;

const KEY = "routine-delivery";
const EVERY_MS = 60_000;
/** Hermes' token for a run with nothing to report. */
const SILENT = "[SILENT]";

/** The routine a reply comes from, shown as a grey line above it. */
export type RoutineRef = { id: string; name: string; at: string };

/** Last run file posted, per job (`<profile>/<job>` → file name, which sorts by time). */
type Cursor = Record<string, string>;

async function loadCursor(): Promise<Cursor | null> {
  const [row] = await db.select({ value: setting.value }).from(setting).where(eq(setting.key, KEY));
  return row ? (JSON.parse(row.value) as Cursor) : null;
}

const saveCursor = (cursor: Cursor) =>
  db
    .insert(setting)
    .values({ key: KEY, value: JSON.stringify(cursor) })
    .onConflictDoUpdate({ target: setting.key, set: { value: JSON.stringify(cursor) } });

/** The run's answer: what follows « ## Response » in Hermes' report. */
export function runResponse(report: string) {
  const at = report.search(/^## Response\s*$/m);
  if (at < 0) return null;
  const text = report.slice(at).replace(/^## Response\s*\n/, "").trim();
  return text && text !== SILENT && !text.startsWith("[CRON_FAILURE]") ? text : null;
}

/** « 2026-09-28_10-18-23.md » → its instant (local time of the server, as Hermes wrote it). */
const runTime = (file: string) => {
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/.exec(file);
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}`) : new Date();
};

async function runFiles(profile: string, jobId: string) {
  try {
    return (await readdir(join(profileHome(profile), "cron", "output", jobId))).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
}

async function deliver() {
  const first = await loadCursor();
  const cursor: Cursor = first ?? {};
  let changed = !first;
  const bots = await db.select().from(agent).where(eq(agent.onboarding, false));
  for (const bot of bots) {
    const routines = await listAgentRoutines(bot.hermesProfile).catch(() => []);
    for (const r of routines) {
      const key = `${bot.hermesProfile}/${r.id}`;
      const files = await runFiles(bot.hermesProfile, r.id);
      if (!files.length) continue;
      const last = cursor[key];
      // The very first pass only notes where each job is: older runs stay where they are. A job unseen since
      // (created after it, or with no run yet then) has nothing but new runs.
      const fresh = !first ? [] : last === undefined ? files : files.filter((f) => f > last);
      cursor[key] = files.at(-1)!;
      if (cursor[key] !== last) changed = true;
      if (!r.conversationId) continue;
      // The conversation must still exist, with this bot in it.
      const [link] = await db
        .select({ id: conversation.id })
        .from(conversation)
        .innerJoin(conversationAgent, and(eq(conversationAgent.conversationId, conversation.id), eq(conversationAgent.agentId, bot.id)))
        .where(eq(conversation.id, r.conversationId));
      if (!link) continue;
      for (const file of fresh) {
        const text = runResponse(await readFile(join(profileHome(bot.hermesProfile), "cron", "output", r.id, file), "utf8").catch(() => ""));
        if (!text) continue;
        const routine: RoutineRef = { id: r.id, name: r.name, at: runTime(file).toISOString() };
        await postMessage({ id: crypto.randomUUID(), conversationId: r.conversationId, kind: "bot", authorAgentId: bot.id, text, data: { routine } }, agentAuthor(bot));
      }
    }
  }
  if (changed) await saveCursor(cursor);
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startRoutineDelivery() {
  if (timer || !env.HERMES_HOME) return;
  let busy = false;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await deliver();
    } catch (err) {
      console.error("routines: delivery", err);
    } finally {
      busy = false;
    }
  }, EVERY_MS);
}
