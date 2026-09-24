/**
 * Skills a bot requests: from the hub for itself (```skill-request``` block),
 * or written by the bot (```skill-create``` block, a SKILL.md) for every bot.
 * An admin approves, then the app installs it: in the bot's Hermes profile via
 * the dashboard hub, or in the shared skills dir that every profile reads.
 * Auto-approved if an admin started the request.
 */
import { and, eq } from "drizzle-orm";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, parseDocument, stringify } from "yaml";
import { z } from "zod";
import { db, schema } from "./db";
import { env } from "./env";
import { findSkill, profileHome, sharedSkillsDir } from "./hermes";
import { dashboard, HermesError } from "./hermes-admin";
import { installSkillsSh, isSkillsSh } from "./skills-sh-install";
import { postEvent } from "./messages";
import { errors } from "./errors.messages";
import { defineMessages, tr } from "./i18n";

// Installation runs in the background, but in the language of whoever triggered it
// (the admin's request, kept by AsyncLocalStorage), otherwise the organization's.
const messages = defineMessages({
  en: {
    botGone: "The bot no longer exists.",
    installFailed: "Installation failed",
    notConfirmed: "Hermes didn't confirm the installation.",
    tooLong: "The installation is taking too long.",
    exists: "A different shared skill already has this name.",
  },
  fr: {
    botGone: "Le bot n'existe plus.",
    installFailed: "Échec de l'installation",
    notConfirmed: "Hermes n'a pas confirmé l'installation.",
    tooLong: "L'installation prend trop de temps.",
    exists: "Un autre skill partagé porte déjà ce nom.",
  },
});

const { agent, skillRequest, user } = schema;
type Row = typeof skillRequest.$inferSelect;

export const skillRequestSchema = z.object({
  identifier: z
    .string()
    .regex(/^[\w@./:-]{1,200}$/)
    .refine((s) => !s.startsWith("-")),
  name: z.string().trim().min(1).max(80),
  reason: z.string().trim().max(300).default(""),
});

export type SkillRequestBlock = z.infer<typeof skillRequestSchema>;

export const SKILL_REQUEST_PROMPT = [
  "# Demander un skill",
  "S'il te manque une compétence qui existe dans le hub de skills Hermes (skills officiels, skills.sh, GitHub…), demande son installation avec ce bloc, seul, à la fin de ta réponse :",
  "```skill-request",
  '{"identifier": "skills-sh/owner/repo/skill", "name": "…", "reason": "à quoi il va te servir"}',
  "```",
  "`identifier` est celui du hub (commande `hermes skills search`). Un administrateur valide avant l'installation.",
].join("\n");

/** Hermes's rule for skill and category names (tools/skill_manager_tool.py). */
const SKILL_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export const skillCreateSchema = z.object({
  name: z.string().regex(SKILL_NAME),
  description: z.string().trim().min(1).max(1024),
  category: z.string().regex(SKILL_NAME).optional(),
  reason: z.string().trim().max(300).default(""),
  /** The SKILL.md written into the profiles, without `reason` and `category`. */
  content: z.string().max(100_000),
});

export type SkillCreateBlock = z.infer<typeof skillCreateSchema>;

/** ```skill-create``` block: a SKILL.md, YAML frontmatter then instructions. */
export function parseSkillCreate(body: string): SkillCreateBlock | null {
  const m = body.match(/^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n([\s\S]*)$/);
  const instructions = m?.[2]?.trim();
  if (!m || !instructions) return null;
  let meta: unknown;
  try {
    meta = parse(m[1]!);
  } catch {
    return null;
  }
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const { reason, category, ...front } = meta as Record<string, unknown>;
  const parsed = skillCreateSchema.safeParse({
    name: front.name,
    description: front.description,
    category: category ?? undefined,
    reason: typeof reason === "string" ? reason : undefined,
    content: `---\n${stringify(front).trim()}\n---\n\n${instructions}\n`,
  });
  return parsed.success ? parsed.data : null;
}

export const SKILL_CREATE_PROMPT = [
  "# Créer un skill",
  "Quand on te demande de créer un skill, ou que tu mets au point une procédure réutilisable, écris-le avec ce bloc, seul, à la fin de ta réponse, plutôt qu'avec ton outil skill_manage. Il devient disponible pour tous les bots ; si la demande ne vient pas d'un administrateur, un administrateur le valide d'abord :",
  "```skill-create",
  "---",
  "name: nom-du-skill",
  "description: quand s'en servir, en une phrase",
  "reason: à quoi il va servir",
  "---",
  "# Titre",
  "Instructions pas à pas…",
  "```",
  "`name` : minuscules, chiffres, tirets. `category` (facultatif) suit la même règle. Dans les instructions, pas de ``` : utilise ~~~ pour les blocs de code.",
].join("\n");

function toDto(row: Row, viewer: { id: string; role?: string | null }) {
  return {
    id: row.id,
    kind: row.kind,
    identifier: row.identifier,
    name: row.name,
    reason: row.reason,
    description: row.description,
    category: row.category,
    content: row.content,
    status: row.status,
    error: row.error,
    agentId: row.agentId,
    conversationId: row.conversationId,
    createdAt: row.createdAt,
    canDecide: viewer.role === "admin" && row.status === "pending",
  };
}

async function load(id: string) {
  const [row] = await db.select().from(skillRequest).where(eq(skillRequest.id, id));
  if (!row) throw new HermesError(tr(errors).requestNotFound, 404);
  return row;
}

export async function getSkillRequest(id: string, viewer: { id: string; role?: string | null }) {
  const row = await load(id);
  if (viewer.role !== "admin" && viewer.id !== row.requestedBy) {
    const member = row.conversationId
      ? await db
          .select()
          .from(schema.conversationMember)
          .where(and(eq(schema.conversationMember.conversationId, row.conversationId), eq(schema.conversationMember.userId, viewer.id)))
      : [];
    if (!member.length) throw new HermesError(tr(errors).requestNotFound, 404);
  }
  return toDto(row, viewer);
}

export async function listSkillRequests(viewer: { id: string; role?: string | null }) {
  const rows = await db.select().from(skillRequest).orderBy(skillRequest.createdAt);
  return rows.map((r) => toDto(r, viewer)).reverse();
}

type RequestContext = { conversationId: string; agentId: string; requestedBy: string | null };

export const createSkillRequest = (block: SkillRequestBlock, ctx: RequestContext) => insertRequest({ kind: "install", ...block }, ctx);

export const createSkillCreation = (block: SkillCreateBlock, ctx: RequestContext) =>
  insertRequest({ kind: "create", identifier: block.name, ...block }, ctx);

async function insertRequest(
  values: Pick<typeof skillRequest.$inferInsert, "kind" | "identifier" | "name" | "reason" | "description" | "category" | "content">,
  ctx: RequestContext,
) {
  const [requester] = ctx.requestedBy ? await db.select({ role: user.role }).from(user).where(eq(user.id, ctx.requestedBy)) : [];
  const admin = requester?.role === "admin";
  const [row] = await db
    .insert(skillRequest)
    .values({
      id: crypto.randomUUID(),
      ...values,
      requestedBy: ctx.requestedBy,
      agentId: ctx.agentId,
      conversationId: ctx.conversationId,
      ...(admin && { decidedBy: ctx.requestedBy, decidedAt: new Date() }),
    })
    .returning();
  if (admin) void installSkill(row!);
  return row!;
}

export async function decideSkill(id: string, adminId: string, approve: boolean) {
  const row = await load(id);
  if (row.status !== "pending") throw new HermesError(tr(errors).requestAlreadyHandled, 409);
  await db
    .update(skillRequest)
    .set({ status: approve ? "pending" : "rejected", decidedBy: adminId, decidedAt: new Date() })
    .where(eq(skillRequest.id, id));
  if (!approve) {
    if (row.conversationId) await postEvent(row.conversationId, { type: "skill.refused", skill: row.name });
    return;
  }
  void installSkill(row);
}

/** In the background; a failure leaves the request pending, with its error, for a retry. */
async function installSkill(row: Row) {
  const setStatus = (values: Partial<Row>) => db.update(skillRequest).set(values).where(eq(skillRequest.id, row.id));
  try {
    await setStatus({ status: "installing", error: null });
    if (row.kind === "create") await writeSharedSkill(row);
    const bot = row.kind === "create" ? null : await installFromHub(row);
    await setStatus({ status: "installed" });
    if (row.conversationId)
      await postEvent(row.conversationId, bot ? { type: "skill.installed", skill: row.name, bot } : { type: "skill.shared", skill: row.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : tr(messages).installFailed;
    await setStatus({ status: "pending", error: message });
    if (row.conversationId) await postEvent(row.conversationId, { type: "skill.failed", skill: row.name, error: message });
  }
}

/**
 * Installation via the dashboard hub: the outcome is read from the action's
 * log (the exit code is 0 even on failure).
 */
async function installFromHub(row: Row) {
  const [bot] = row.agentId ? await db.select().from(agent).where(eq(agent.id, row.agentId)) : [];
  if (!bot) throw new Error(tr(messages).botGone);
  if (isSkillsSh(row.identifier)) {
    await installSkillsSh(row.identifier, bot.hermesProfile);
    return bot.name;
  }
  const started = await dashboard<{ name?: string }>("/api/skills/hub/install", {
    method: "POST",
    profile: bot.hermesProfile,
    body: JSON.stringify({ identifier: row.identifier, profile: bot.hermesProfile }),
  });
  if (started?.name) await waitAction(started.name);
  return bot.name;
}

/**
 * Writes the SKILL.md into the shared dir ([category/]<name>/), where every bot
 * picks it up on its next turn. The same skill already there counts as done
 * (retry); a different one is never overwritten.
 */
async function writeSharedSkill(row: Row) {
  const root = sharedSkillsDir();
  const existing = await findSkill(root, row.name).catch(() => null);
  if (existing) {
    if ((await readFile(existing, "utf8").catch(() => null)) === row.content) return;
    throw new Error(tr(messages).exists);
  }
  const dir = join(root, row.category ?? "", row.name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), row.content ?? "", { flag: "wx" });
}

/** Lists the shared dir in the profile's `skills.external_dirs` (config.yaml, re-read by Hermes on every turn). */
export async function shareSkillsWith(profile: string) {
  const dir = sharedSkillsDir();
  await mkdir(dir, { recursive: true });
  const path = join(profileHome(profile), "config.yaml");
  const doc = parseDocument(await readFile(path, "utf8").catch(() => ""));
  const current = doc.toJS()?.skills?.external_dirs;
  const list: string[] = Array.isArray(current) ? current.map(String) : [];
  if (list.includes(dir)) return;
  doc.setIn(["skills", "external_dirs"], [...list, dir]);
  await writeFile(path, doc.toString());
}

/** At startup: every profile reads the shared skills. */
export async function setupSharedSkills() {
  if (!env.HERMES_HOME) return;
  const { profiles } = await import("./memory");
  for (const p of await profiles()) await shareSkillsWith(p).catch((err) => console.error(`shared skills: ${p}`, err));
}

async function waitAction(name: string) {
  for (let i = 0; i < 120; i++) {
    const s = await dashboard<{ running: boolean; exit_code: number | null; lines?: string[] }>(`/api/actions/${encodeURIComponent(name)}/status`);
    if (!s.running) {
      const lines = s.lines ?? [];
      const start = lines.map((l) => l.startsWith("===") && l.includes(" started ")).lastIndexOf(true);
      const run = lines.slice(start + 1).join("\n");
      const error = run.match(/Error:\s*([\s\S]*?)(?:\n\n|$)/);
      if (error) throw new Error(error[1]!.replace(/\s+/g, " ").trim());
      if (s.exit_code !== 0 || !/^Installed:/m.test(run)) throw new Error(tr(messages).notConfirmed);
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(tr(messages).tooLong);
}
