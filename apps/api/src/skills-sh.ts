/**
 * skills.sh catalog, queried directly: Hermes's "all sources" search skips it
 * as soon as its own index responds, and has no ranking without a query.
 * Installation, however, goes through Hermes with the identifier `skills-sh/<owner>/<repo>/<skill>`.
 */

import { currentLocale, defineMessages, tr } from "./i18n";

const messages = defineMessages({
  en: { installs: (count: string) => `${count} installs` },
  fr: { installs: (count: string) => `${count} installations` },
});

export type SkillsShSkill = { name: string; description: string; source: "skills.sh"; identifier: string; installs: number };

type Raw = { id?: string; source: string; skillId: string; name: string; installs: number };

const BASE = "https://skills.sh";
const TTL = 60 * 60_000;
let board: { at: number; skills: Skill[] } | undefined;

type Skill = Omit<SkillsShSkill, "description"> & { owner: string };

const toSkill = (r: Raw): Skill => {
  const id = r.id ?? `${r.source}/${r.skillId}`;
  return { name: r.name, owner: r.source, source: "skills.sh", identifier: `skills-sh/${id}`, installs: r.installs };
};

/** Description in the request language (the leaderboard is cached for everyone). */
const describe = ({ owner, ...s }: Skill): SkillsShSkill => {
  const locale = currentLocale();
  const count = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { notation: "compact" }).format(s.installs);
  return { ...s, description: `${owner} · ${tr(messages, locale).installs(count)}` };
};

/** Ranking by installs, as embedded in the skills.sh home page. */
async function leaderboard(): Promise<Skill[]> {
  if (board && Date.now() - board.at < TTL) return board.skills;
  const res = await fetch(BASE, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`skills.sh ${res.status}`);
  const html = await res.text();
  const re = /\\"source\\":\\"([^\\"]+)\\",\\"skillId\\":\\"([^\\"]+)\\",\\"name\\":\\"([^\\"]+)\\",\\"installs\\":(\d+)/g;
  const seen = new Set<string>();
  const skills: Skill[] = [];
  for (const [, source, skillId, name, installs] of html.matchAll(re)) {
    const key = `${source}/${skillId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push(toSkill({ source: source!, skillId: skillId!, name: name!, installs: Number(installs) }));
  }
  skills.sort((a, b) => b.installs - a.installs);
  if (skills.length) board = { at: Date.now(), skills };
  return skills;
}

export async function skillsSh(q: string | undefined): Promise<SkillsShSkill[]> {
  if (!q || q.length < 2) return (await leaderboard()).map(describe);
  const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}&limit=30`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`skills.sh ${res.status}`);
  const data = (await res.json()) as { skills?: Raw[] };
  return (data.skills ?? []).map(toSkill).map(describe);
}
