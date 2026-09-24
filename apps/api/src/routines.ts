/**
 * Routines: the Hermes cron jobs a bot created from a conversation.
 *
 * Hermes keeps them in the profile's cron/jobs.json; each job remembers the
 * session it was created from (`origin.chat_id`, `agora-<conversation>…`).
 * A bot is shared by several employees, so only the conversation's own jobs
 * are shown: another employee's routine (and its prompt) stays theirs.
 * Changes go through the `hermes cron` CLI, which owns the file.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { profileHome } from "./hermes";
import { HermesError, hermesCli } from "./hermes-admin";
import { defineMessages, tr } from "./i18n";

const messages = defineMessages({
  en: {
    invalidSchedule: "Hermes doesn't understand this schedule. Examples: 0 9 * * *, every 2h, weekdays at 9am.",
    notFound: "This routine no longer exists.",
  },
  fr: {
    invalidSchedule: "Hermes ne comprend pas cette fréquence. Exemples : 0 9 * * *, every 2h, weekdays at 9am.",
    notFound: "Cette routine n'existe plus.",
  },
});

export type Routine = {
  id: string;
  name: string;
  /** Cron expression when the schedule is one, to be phrased in the interface language. */
  cron: string | null;
  /** Hermes' own wording ("every day at 9am"), in English. */
  schedule: string;
  nextRunAt: string | null;
  enabled: boolean;
};

type HermesJob = {
  id?: string;
  name?: string;
  prompt?: string;
  schedule?: { kind?: string; expr?: string; display?: string };
  schedule_display?: string;
  next_run_at?: string | null;
  enabled?: boolean;
  state?: string;
  origin?: { chat_id?: string | null };
};

async function readJobs(profile: string): Promise<HermesJob[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(profileHome(profile), "cron", "jobs.json"), "utf8"));
  } catch {
    return []; // no routine created yet
  }
  return Array.isArray(raw) ? raw : Array.isArray((raw as { jobs?: unknown })?.jobs) ? (raw as { jobs: HermesJob[] }).jobs : [];
}

const toRoutine = (j: HermesJob): Routine => ({
  id: String(j.id),
  name: String(j.name || j.prompt || j.id).slice(0, 120),
  cron: j.schedule?.kind === "cron" && j.schedule.expr ? j.schedule.expr : null,
  schedule: j.schedule_display ?? j.schedule?.display ?? "",
  nextRunAt: j.next_run_at ?? null,
  enabled: j.enabled !== false && j.state !== "paused",
});

export async function listRoutines(profile: string, conversationId: string): Promise<Routine[]> {
  const session = `agora-${conversationId}`;
  return (await readJobs(profile)).filter((j) => j.id && j.origin?.chat_id?.startsWith(session)).map(toRoutine);
}

/** All of a bot's routines, with the conversation each was created from (null: not from the app). */
export async function listAgentRoutines(profile: string): Promise<(Routine & { conversationId: string | null })[]> {
  return (await readJobs(profile))
    .filter((j) => j.id)
    .map((j) => ({ ...toRoutine(j), conversationId: j.origin?.chat_id?.match(/^agora-([0-9a-f-]{36})/)?.[1] ?? null }));
}

export async function findRoutine(profile: string, conversationId: string, id: string) {
  return (await listRoutines(profile, conversationId)).find((r) => r.id === id) ?? null;
}

/** What the bot needs to act on a routine the employee mentioned. */
export async function routineBrief(profile: string, id: string) {
  const job = (await readJobs(profile)).find((j) => j.id === id);
  if (!job) return null;
  const r = toRoutine(job);
  return { ...r, prompt: job.prompt ?? "" };
}

export type RoutinePatch = { name?: string; schedule?: string; enabled?: boolean };

/** `hermes cron` exits 0 even when it refuses: its output says so. */
async function cron(profile: string, args: string[]) {
  const out = await hermesCli(["cron", ...args], { profile, timeoutMs: 30_000 });
  const failed = out.match(/^(?:Failed to .*|Job not found.*|Error: .*)$/m)?.[0];
  if (!failed) return;
  if (failed.includes("Invalid schedule")) throw new HermesError(tr(messages).invalidSchedule, 400);
  if (/not found/i.test(failed)) throw new HermesError(tr(messages).notFound, 404);
  throw new HermesError(failed, 502);
}

export async function updateRoutine(profile: string, id: string, patch: RoutinePatch) {
  const edit = [
    ...(patch.name !== undefined ? ["--name", patch.name] : []),
    ...(patch.schedule !== undefined ? ["--schedule", patch.schedule] : []),
  ];
  if (edit.length) await cron(profile, ["edit", ...edit, id]);
  if (patch.enabled !== undefined) await cron(profile, [patch.enabled ? "resume" : "pause", id]);
}

export async function deleteRoutine(profile: string, id: string) {
  await cron(profile, ["remove", id]);
}
