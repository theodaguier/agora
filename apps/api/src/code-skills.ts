import { lstat, mkdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { asc, eq } from "drizzle-orm";
import type { CodeCommand, CodeEngine } from "@agora/core";
import { excludePaths } from "./code-git";
import { db, schema } from "./db";
import { env } from "./env";
import { profileHome, sharedSkillsDir, skills as enabledSkills, type SkillInfo } from "./hermes";
import { defineMessages, tr } from "./i18n";

/**
 * What a code session inherits from the team's bots: the skills enabled for every bot its requester
 * may use (all of them for an admin), the shared ones too. Same SKILL.md format as Claude Code's,
 * linked into the session's directory before each run, where the engine reads its project skills
 * (`.claude/skills` for Claude Code and Cursor, `.agents/skills` for Codex). A skill the repository
 * has itself always wins; the links stay out of git (info/exclude), never in a tracked file.
 */

export type TeamSkill = { name: string; description: string; dir: string };

/** A bot the requester may use, as code-skills needs it. */
export type TeamAgent = { id: string; profile: string; name: string };

/** Names safe as a directory of the session (and as a slash command). */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** The bots whose skills and connectors a session inherits: its own bot first, then by name. */
export function teamOrder(agents: TeamAgent[], who: { role?: string | null; access: Set<string> }, first: string | null): string[] {
  const usable = who.role === "admin" ? agents : agents.filter((a) => a.id === first || who.access.has(a.id));
  const sorted = [...usable].sort((a, b) => Number(b.id === first) - Number(a.id === first) || a.name.localeCompare(b.name));
  return [...new Set(sorted.map((a) => a.profile))];
}

/** The Hermes profiles of the bots the person may use, `firstAgent`'s first (the session's bot). */
export async function teamProfiles(userId: string, firstAgent: string | null) {
  const [who] = await db.select({ role: schema.user.role }).from(schema.user).where(eq(schema.user.id, userId));
  const [agents, access] = await Promise.all([
    db.select({ id: schema.agent.id, profile: schema.agent.hermesProfile, name: schema.agent.name }).from(schema.agent).orderBy(asc(schema.agent.name)),
    db.select({ id: schema.agentAccess.agentId }).from(schema.agentAccess).where(eq(schema.agentAccess.userId, userId)),
  ]);
  return teamOrder(agents, { role: who?.role, access: new Set(access.map((a) => a.id)) }, firstAgent);
}

/** Lists in priority order, merged: the first of a name wins, and a name in `taken` (the repository's own) never comes. */
export function unionSkills(lists: TeamSkill[][], taken: Set<string> = new Set()): TeamSkill[] {
  const out = new Map<string, TeamSkill>();
  for (const list of lists) {
    for (const s of list) if (NAME.test(s.name) && !taken.has(s.name) && !out.has(s.name)) out.set(s.name, s);
  }
  return [...out.values()];
}

/** Every `<name>/SKILL.md` under a root (Hermes's `.hub` left out): name → its directory, the first found. */
export async function scanSkills(root: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  try {
    for await (const rel of new Bun.Glob("**/SKILL.md").scan({ cwd: root, onlyFiles: true, followSymlinks: true })) {
      if (rel.startsWith(".hub/") || rel === "SKILL.md") continue;
      const dir = rel.slice(0, -"/SKILL.md".length);
      const name = dir.split("/").at(-1)!;
      if (!found.has(name)) found.set(name, join(root, dir));
    }
  } catch {
    // No such directory.
  }
  return found;
}

/** The `description:` of a SKILL.md's frontmatter, "" without one. */
export async function skillDescription(dir: string) {
  const text = await readFile(join(dir, "SKILL.md"), "utf8").catch(() => "");
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (!front) return "";
  try {
    const { parse } = await import("yaml");
    const value = (parse(front) as Record<string, unknown> | null)?.description;
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  } catch {
    return "";
  }
}

/** A profile's enabled skills, read from the dashboard at most every CACHE_MS. */
const CACHE_MS = 30_000;
const enabledCache = new Map<string, { at: number; list: Promise<SkillInfo[]> }>();

function enabledOf(profile: string) {
  const hit = enabledCache.get(profile);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
  const list = enabledSkills(profile).catch((err) => {
    console.error(`code skills: ${profile}`, err instanceof Error ? err.message : err);
    enabledCache.delete(profile);
    return [] as SkillInfo[];
  });
  enabledCache.set(profile, { at: Date.now(), list });
  return list;
}

/**
 * The skills a session inherits from these bots (teamProfiles): each one's enabled skills (found in
 * its profile, then among the shared skills, as Hermes resolves them), then every shared skill.
 * First name wins.
 */
export async function teamSkills(profiles: string[]): Promise<TeamSkill[]> {
  if (!env.HERMES_HOME) return [];
  const shared = await scanSkills(sharedSkillsDir());
  const perProfile = await Promise.all(
    profiles.map(async (p) => {
      const [enabled, own] = await Promise.all([enabledOf(p), scanSkills(join(profileHome(p), "skills"))]);
      return enabled.flatMap((s): TeamSkill[] => {
        const dir = own.get(s.name) ?? shared.get(s.name);
        return dir ? [{ name: s.name, description: s.description ?? "", dir }] : [];
      });
    }),
  );
  const sharedList = await Promise.all([...shared].map(async ([name, dir]) => ({ name, dir, description: await skillDescription(dir) })));
  return unionSkills([...perProfile, sharedList]);
}

/* ---------- in the session's directory ---------- */

/** Where an engine reads the project's skills, relative to its directory. */
export const skillsDirOf = (engine: CodeEngine) => (engine === "codex" ? ".agents/skills" : ".claude/skills");

/** The names Agora linked there, to tell its links from the repository's own skills. */
export const MANIFEST = ".agora-manifest";

const readManifest = async (dir: string): Promise<string[]> => {
  try {
    const list = JSON.parse(await readFile(join(dir, MANIFEST), "utf8"));
    return Array.isArray(list) ? list.filter((n): n is string => typeof n === "string" && NAME.test(n)) : [];
  } catch {
    return [];
  }
};

/**
 * Links the skills into `<cwd>/<rel>/<name>` (symlinks to the bots' directories), again before every
 * run: links of skills gone are removed, a skill the repository has itself is left alone (it wins).
 * Only Agora's links (its manifest, and symlinks) are ever touched. Returns the skills linked.
 */
export async function linkSkills(cwd: string, rel: string, skills: TeamSkill[]): Promise<TeamSkill[]> {
  const dir = join(cwd, rel);
  const before = await readManifest(dir);
  if (!skills.length && !before.length) return [];
  const wanted = new Map(skills.map((s) => [s.name, s]));
  const ours = new Set(before);
  const link = async (name: string) => lstat(join(dir, name)).catch(() => null);
  for (const name of before) {
    if (wanted.has(name)) continue;
    if ((await link(name))?.isSymbolicLink()) await rm(join(dir, name), { force: true });
  }
  await mkdir(dir, { recursive: true });
  const linked: TeamSkill[] = [];
  for (const s of skills) {
    const path = join(dir, s.name);
    const st = await link(s.name);
    if (st) {
      // The repository's own skill (or anything not Agora's link): it wins.
      if (!ours.has(s.name) || !st.isSymbolicLink()) continue;
      if ((await readlink(path).catch(() => null)) === s.dir) {
        linked.push(s);
        continue;
      }
      await rm(path, { force: true });
    }
    try {
      await symlink(s.dir, path, "dir");
      linked.push(s);
    } catch (err) {
      console.error(`code skills: ${s.name}`, err instanceof Error ? err.message : err);
    }
  }
  if (linked.length) {
    await writeFile(join(dir, MANIFEST), JSON.stringify(linked.map((s) => s.name)));
    await excludePaths(cwd, [`${rel}/${MANIFEST}`, ...linked.map((s) => `${rel}/${s.name}`)]);
  } else {
    await rm(join(dir, MANIFEST), { force: true });
  }
  return linked;
}

/* ---------- the "/" palette before a run ---------- */

/** Claude Code's own commands offered besides the skills: the ones that work without its terminal. */
export const BUILTIN_COMMANDS = ["compact", "init", "code-review", "security-review", "review", "simplify", "verify", "run", "goal"] as const;

const builtinText = defineMessages<Record<(typeof BUILTIN_COMMANDS)[number], string>>({
  en: {
    compact: "Summarize the conversation to free up context",
    init: "Write a CLAUDE.md that describes the project",
    "code-review": "Review the current changes for bugs",
    "security-review": "Review the current changes for security issues",
    review: "Review a pull request",
    simplify: "Clean up and simplify the changed code",
    verify: "Check that the change really works",
    run: "Launch the project's app to see the change",
    goal: "Set a goal the session works toward",
  },
  fr: {
    compact: "Résume la conversation pour libérer du contexte",
    init: "Écrit un CLAUDE.md qui décrit le projet",
    "code-review": "Relit les changements en cours pour trouver des bugs",
    "security-review": "Cherche des failles de sécurité dans les changements en cours",
    review: "Relit une pull request",
    simplify: "Nettoie et simplifie le code modifié",
    verify: "Vérifie que le changement fonctionne vraiment",
    run: "Lance l'app du projet pour voir le changement",
    goal: "Fixe un objectif vers lequel la session travaille",
  },
});

/** What "/" offers a new session of this engine: Claude Code's commands, then the team's skills. */
export async function sessionCommands(userId: string, engine: CodeEngine, firstAgent: string | null = null): Promise<CodeCommand[]> {
  const t = tr(builtinText);
  const builtins: CodeCommand[] = engine === "claude" ? BUILTIN_COMMANDS.map((name) => ({ name, description: t[name], skill: false })) : [];
  const skills = (await teamSkills(await teamProfiles(userId, firstAgent))).map((s): CodeCommand => ({ name: s.name, description: s.description, skill: true }));
  return [...builtins, ...skills];
}
