/**
 * Company memory: a markdown vault shared by every Hermes profile, following
 * Karpathy's "LLM Wiki" pattern (readable in Obsidian).
 *
 * - The Hermes plugin `agora_wiki` (infra/hermes-plugins) gives agents the
 *   wiki_* tools, injects hot.md and relevant pages, and logs every turn
 *   into raw/: the raw layer feeds itself.
 * - The curator below periodically compiles raw material into durable pages,
 *   via the default profile (session `agora-curator-*`, never logged).
 *
 * The BFF only writes the vault skeleton and its own state (.curator.json)
 * into the vault: all pages go through the plugin, under lock.
 */
import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import { env } from "./env";
import { chat, isDefaultProfile, profileHome } from "./hermes";
import { hermesCli } from "./hermes-admin";
import { defineMessages, tr } from "./i18n";

/**
 * Status texts shown in the admin. The curator runs in the background, so its
 * outcome is stored as a code + counts and rendered in the viewer's language
 * when served (curatorStatus); the stored `message` / `reason` text, rendered at
 * run time, remains the fallback for older state files and for raw errors.
 */
const messages = defineMessages({
  en: {
    agentMemory: (agent: string) => `${agent} memory`,
    alreadyRunning: "A compilation is already running.",
    hermesNotConnected: "Hermes isn't connected.",
    nothingNew: "Nothing new to compile.",
    counts: (r: RunCounts) =>
      `${r.compiled} ${r.compiled === 1 ? "source" : "sources"} compiled, ${r.skipped} skipped${r.missing ? `, ${r.missing} not covered, to retry` : ""}.`,
    failed: "Compilation failed.",
    claimedNotCited: "reported as compiled but cited nowhere in the wiki",
    notReported: "missing from the curator's report",
  },
  fr: {
    agentMemory: (agent: string) => `Mémoire ${agent}`,
    alreadyRunning: "Une compilation est déjà en cours.",
    hermesNotConnected: "Hermes n'est pas branché.",
    nothingNew: "Rien de nouveau à compiler.",
    counts: (r: RunCounts) =>
      `${r.compiled} source(s) compilée(s), ${r.skipped} écartée(s)${r.missing ? `, ${r.missing} non couverte(s), à retenter` : ""}.`,
    failed: "Échec de la compilation.",
    claimedNotCited: "annoncée compilée mais citée nulle part dans le wiki",
    notReported: "absente du compte rendu du curateur",
  },
});

type RunCounts = { compiled: number; skipped: number; missing: number };
/** Outcome of a run, translated when served. Absent when `message` is a raw error. */
type RunResult = { code: "nothingNew" } | { code: "failed" } | ({ code: "counts" } & RunCounts);
type ReasonCode = "claimedNotCited" | "notReported";

const runMessage = (r: RunResult) => (r.code === "counts" ? tr(messages).counts(r) : tr(messages)[r.code]);
const reasonText = <T extends { reason?: string; reasonCode?: ReasonCode }>({ reasonCode, ...rest }: T) =>
  reasonCode ? { ...rest, reason: tr(messages)[reasonCode] } : rest;

const PLUGIN = "agora_wiki";
const PLUGIN_SOURCE = resolve(import.meta.dir, "../../../infra/hermes-plugins", PLUGIN);
const PAGE_DIRS = { entities: "entity", concepts: "concept", comparisons: "comparison", queries: "query" } as const;
const CURATOR_CHUNK = 40_000;
const IDLE_BEFORE_COMPILE = 20 * 60_000;
const COMPILE_ANYWAY_AT = 30_000;
const MAX_ATTEMPTS = 3;

export const vaultDir = () => env.WIKI_DIR || (env.HERMES_HOME ? join(env.HERMES_HOME, "wiki") : "");
export const wikiEnabled = () => !!vaultDir();

/* ---------- vault skeleton ---------- */

const AGENTS_MD = `# Mémoire de l'organisation — contrat

Ce vault est la mémoire commune de tous les agents de l'organisation (profils Hermes). Il suit le patron « LLM Wiki » de Karpathy : les agents écrivent et tiennent le wiki, les humains le lisent (dans l'app ou dans Obsidian).

## Trois couches
1. **raw/** — sources immuables. Personne ne les réécrit.
   - \`raw/conversations/<date>/<profil>.md\` : chaque tour de conversation, écrit automatiquement par le plugin.
   - \`raw/memories/<profil>.md\` : miroir des écritures de la mémoire Hermes intégrée (MEMORY.md, USER.md).
   - \`raw/sources/\` : documents déposés par l'équipe (comptes rendus, contrats, briefs…).
2. **wiki/** — pages tenues par les agents.
   - \`entities/\` : clients, personnes, outils, projets, fournisseurs.
   - \`concepts/\` : décisions, process, règles, causes racines.
   - \`comparisons/\`, \`queries/\` : analyses et questions dont la réponse mérite d'être gardée.
   - \`sessions/<date>.md\` : une entrée par conversation utile.
3. **Ce fichier** — le contrat.

## Règles
- Nom de fichier en minuscules-tirets, unique dans tout le wiki. Frontmatter géré par l'outil wiki_write.
- Au moins 2 \`[[liens]]\` sortants par page, par nom de page, sans dossier.
- Une page se justifie quand le sujet revient dans 2 conversations ou plus, ou qu'il est central à l'une d'elles.
- Quand une information contredit la page, garder les deux avec leur date.
- Décrire ce qui a été **fait ou décidé**, pas ce qui a été demandé.
- **Jamais** de mot de passe, token, clé API ou donnée bancaire.

## Fichiers générés
- \`index.md\` : catalogue régénéré par le plugin après chaque écriture. Ne pas l'éditer.
- \`log.md\` : journal append-only.
- \`hot.md\` : contexte chaud (≤ 15 lignes), injecté dans chaque session de chaque agent.
`;

const OBSIDIAN_GRAPH = {
  colorGroups: [
    { query: "path:wiki/entities", color: { a: 1, rgb: 0x4ade80 } },
    { query: "path:wiki/concepts", color: { a: 1, rgb: 0xd4d4d4 } },
    { query: "path:wiki/sessions", color: { a: 1, rgb: 0x60a5fa } },
    { query: "path:raw", color: { a: 1, rgb: 0x737373 } },
  ],
};

async function writeIfMissing(path: string, content: string) {
  if (existsSync(path)) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

export async function ensureVault() {
  const vault = vaultDir();
  for (const d of ["raw/conversations", "raw/memories", "raw/sources", "wiki/sessions", ...Object.keys(PAGE_DIRS).map((d) => `wiki/${d}`)]) {
    await mkdir(join(vault, d), { recursive: true });
  }
  await writeIfMissing(join(vault, "AGENTS.md"), AGENTS_MD);
  await writeIfMissing(join(vault, "index.md"), "# Index — mémoire de l'organisation\n\n> Généré par le plugin agora_wiki.\n");
  await writeIfMissing(join(vault, "log.md"), "# Journal\n");
  await writeIfMissing(join(vault, "hot.md"), "");
  await writeIfMissing(join(vault, ".gitignore"), ".lock\n.curator.json\n.obsidian/workspace*.json\n");
  await writeIfMissing(join(vault, ".obsidian/graph.json"), JSON.stringify(OBSIDIAN_GRAPH, null, 2));
}

/* ---------- plugin in every profile ---------- */

export async function profiles() {
  const names = await readdir(join(env.HERMES_HOME, "profiles")).catch(() => [] as string[]);
  return ["default", ...names.filter((n) => existsSync(join(env.HERMES_HOME, "profiles", n, "config.yaml")))];
}

/** Symlink to the plugin + `memory.provider: agora_wiki` in the profile's config.yaml. */
export async function installWikiPlugin(profile: string) {
  const home = profileHome(profile);
  const link = join(home, "plugins", PLUGIN);
  const current = await lstat(link).catch(() => null);
  if (!current) {
    await mkdir(dirname(link), { recursive: true });
    await symlink(PLUGIN_SOURCE, link);
  } else if (current.isSymbolicLink() && resolve(dirname(link), await readlink(link)) !== PLUGIN_SOURCE) {
    // Link points to an old copy of the repo: recreate it.
    await rm(link);
    await symlink(PLUGIN_SOURCE, link);
  }
  const config = parse(await readFile(join(home, "config.yaml"), "utf8").catch(() => "")) ?? {};
  if (config.memory?.provider !== PLUGIN) {
    await hermesCli(["config", "set", "memory.provider", PLUGIN], { profile: isDefaultProfile(profile) ? undefined : profile });
  }
}

export async function setupMemory() {
  if (!wikiEnabled() || !env.HERMES_HOME) return;
  await ensureVault();
  for (const p of await profiles()) {
    await installWikiPlugin(p).catch((err) => console.error(`memory: plugin for ${p}`, err));
  }
  startCurator();
}

/* ---------- reading the vault ---------- */

export type WikiNodeType = "entity" | "concept" | "comparison" | "query" | "session" | "raw" | "agent" | "ghost";
export type WikiNode = { id: string; label: string; type: WikiNodeType; updated?: string; tags?: string[]; summary?: string };
export type WikiEdge = { source: string; target: string };

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

export function parsePage(text: string) {
  const meta: Record<string, string | string[]> = {};
  if (!text.startsWith("---\n")) return { meta, body: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { meta, body: text };
  for (const line of text.slice(4, end).split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    meta[key] =
      value.startsWith("[") && value.endsWith("]")
        ? value
            .slice(1, -1)
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : value;
  }
  return { meta, body: text.slice(end + 4).replace(/^\n+/, "") };
}

async function listMarkdown(root: string, dir: string): Promise<string[]> {
  const glob = new Bun.Glob("**/*.md");
  const out: string[] = [];
  if (!existsSync(join(root, dir))) return out;
  for await (const rel of glob.scan({ cwd: join(root, dir), onlyFiles: true })) out.push(`${dir}/${rel}`);
  return out.sort();
}

const idOf = (rel: string) => rel.replace(/\.md$/, "");

export async function wikiGraph(agentNames: Record<string, string>) {
  const vault = vaultDir();
  const nodes = new Map<string, WikiNode>();
  const edges: WikiEdge[] = [];
  const bySlug = new Map<string, string>();
  const bodies: [string, string][] = [];

  const pages = await listMarkdown(vault, "wiki");
  for (const rel of pages) {
    const id = idOf(rel);
    const [, dir, slug] = id.split("/");
    const { meta, body } = parsePage(await readFile(join(vault, rel), "utf8"));
    const type: WikiNodeType = dir === "sessions" ? "session" : (PAGE_DIRS[dir as keyof typeof PAGE_DIRS] ?? "concept");
    nodes.set(id, {
      id,
      label: typeof meta.title === "string" && meta.title ? meta.title : slug!,
      type,
      updated: typeof meta.updated === "string" ? meta.updated : undefined,
      tags: Array.isArray(meta.tags) ? meta.tags : undefined,
      summary: typeof meta.summary === "string" ? meta.summary : undefined,
    });
    bySlug.set(slug!, id);
    bodies.push([id, body]);
    for (const src of Array.isArray(meta.sources) ? meta.sources : []) bodies.push([id, `[[${src}]]`]);
    for (const author of Array.isArray(meta.authors) ? meta.authors : []) edges.push({ source: `agent:${author}`, target: id });
  }

  for (const rel of await listMarkdown(vault, "raw")) {
    const id = idOf(rel);
    const parts = id.split("/");
    const profile = parts[1] === "conversations" || parts[1] === "memories" ? parts.at(-1)! : null;
    const label =
      parts[1] === "conversations" ? `${agentNames[profile!] ?? profile} · ${parts[2]}` : parts[1] === "memories" ? tr(messages).agentMemory(agentNames[profile!] ?? profile!) : parts.at(-1)!;
    nodes.set(id, { id, label, type: "raw" });
    if (profile) edges.push({ source: `agent:${profile}`, target: id });
  }

  const resolveLink = (target: string) => {
    const clean = target.trim().replace(/\.md$/, "").replace(/^\/+/, "");
    for (const candidate of [clean, `wiki/${clean}`]) if (nodes.has(candidate)) return candidate;
    return bySlug.get(clean.split("/").at(-1)!) ?? null;
  };

  for (const [id, body] of bodies) {
    for (const m of body.matchAll(WIKILINK)) {
      let target = resolveLink(m[1]!);
      if (!target) {
        target = `ghost:${m[1]!.trim().split("/").at(-1)}`;
        if (!nodes.has(target)) nodes.set(target, { id: target, label: target.slice(6), type: "ghost" });
      }
      if (target !== id) edges.push({ source: id, target });
    }
  }

  for (const e of edges) {
    if (e.source.startsWith("agent:") && !nodes.has(e.source)) {
      const profile = e.source.slice(6);
      nodes.set(e.source, { id: e.source, label: agentNames[profile] ?? profile, type: "agent" });
    }
  }

  const seen = new Set<string>();
  const unique = edges.filter((e) => {
    const k = [e.source, e.target].sort().join("→");
    if (seen.has(k) || !nodes.has(e.target)) return false;
    seen.add(k);
    return true;
  });
  return { nodes: [...nodes.values()], edges: unique };
}

/** Content of a graph node (path relative to the vault, never escaping it). */
export async function wikiPage(id: string) {
  const vault = vaultDir();
  const path = resolve(vault, `${id}.md`);
  if (!path.startsWith(`${resolve(vault)}/`) || !/^(wiki|raw)\//.test(id)) return null;
  const text = await readFile(path, "utf8").catch(() => null);
  if (text === null) return null;
  const { meta, body } = parsePage(text);
  return { id, meta, body: body.length > 60_000 ? `${body.slice(-60_000)}` : body };
}

/* ---------- curator: raw → wiki ---------- */

type CuratorState = {
  offsets: Record<string, number>;
  /** Consecutive coverage failures per source. */
  attempts?: Record<string, number>;
  /** Sources the curator failed to cover after MAX_ATTEMPTS runs: need human review. */
  problems?: { source: string; at: string; reason: string; reasonCode?: ReasonCode }[];
  lastRun?: {
    at: string;
    ok: boolean;
    message: string;
    result?: RunResult;
    sources: number;
    pagesTouched: number;
    /** Verified report, source by source. */
    report?: { source: string; status: "compiled" | "skipped" | "missing"; reason?: string; reasonCode?: ReasonCode }[];
  };
};

const statePath = () => join(vaultDir(), ".curator.json");
let running = false;

async function loadState(): Promise<CuratorState> {
  try {
    return JSON.parse(await readFile(statePath(), "utf8"));
  } catch {
    return { offsets: {} };
  }
}

async function pending(state: CuratorState) {
  const vault = vaultDir();
  const out: { rel: string; from: number; size: number; mtime: number }[] = [];
  for (const rel of await listMarkdown(vault, "raw")) {
    const s = await stat(join(vault, rel));
    const from = state.offsets[rel] ?? 0;
    if (s.size > from) out.push({ rel, from, size: s.size, mtime: s.mtimeMs });
  }
  return out;
}

async function pageMtimes() {
  const vault = vaultDir();
  const m = new Map<string, number>();
  for (const rel of await listMarkdown(vault, "wiki")) m.set(rel, (await stat(join(vault, rel))).mtimeMs);
  const hot = await stat(join(vault, "hot.md")).catch(() => null);
  if (hot) m.set("hot.md", hot.mtimeMs);
  return m;
}

export async function curatorStatus() {
  const state = await loadState();
  const todo = await pending(state);
  return {
    running,
    pendingSources: todo.length,
    pendingChars: todo.reduce((n, t) => n + t.size - t.from, 0),
    lastRun: state.lastRun
      ? {
          ...state.lastRun,
          message: state.lastRun.result ? runMessage(state.lastRun.result) : state.lastRun.message,
          report: state.lastRun.report?.map(reasonText),
        }
      : null,
    problems: (state.problems ?? []).map(reasonText),
  };
}

function curatorPrompt(chunk: string, sources: string[], today: string) {
  return `Tu es le curateur de la mémoire de l'organisation (wiki partagé par tous les agents, patron LLM Wiki de Karpathy). Ton seul travail dans cette session : compiler les nouvelles sources brutes ci-dessous dans le wiki, avec les outils wiki_search, wiki_read, wiki_write et wiki_log_session.

Procédure :
1. Pour chaque source, repère les connaissances durables : faits sur un client, une personne, un projet ou un outil ; décisions ; process ; règles ; problèmes et leurs causes.
2. Avant d'écrire, wiki_search puis wiki_read la page existante. Fusionne : ne perds aucune information déjà présente. Si l'info contredit la page, garde les deux avec leur date.
3. wiki_write : entity pour client, personne, outil, projet, fournisseur ; concept pour décision, process, règle, cause racine. Nom en minuscules-tirets, summary d'une ligne, au moins 2 [[liens]] vers d'autres pages, et dans sources le chemin EXACT de la source (ex. raw/conversations/${today}/compta).
4. wiki_log_session : une entrée par conversation utile, avec l'agent, ce qui a été fait ou décidé (pas ce qui a été demandé), les pages concernées, et source = le chemin EXACT de la source. Date et heure = celles de la conversation.
5. Si le contexte « en ce moment dans l'organisation » a changé, réécris hot avec wiki_write(page="hot") : 15 lignes au plus.
6. Jamais de mot de passe, token, clé ou donnée bancaire. N'invente rien : seulement ce qui figure dans les sources.

Chaque source doit être traitée : soit compilée (citée par son chemin exact dans au moins une page ou une entrée de session), soit écartée parce qu'elle ne contient rien de durable (salutations, tests, questions sans suite).

Termine OBLIGATOIREMENT par ce bloc, avec une ligne par source, sans en oublier :
\`\`\`json
[{"source": "<chemin exact>", "status": "compiled" | "skipped", "reason": "<obligatoire si skipped>"}]
\`\`\`

Sources à traiter (${sources.length}) : ${sources.join(", ")}

${chunk}`;
}

type Report = NonNullable<NonNullable<CuratorState["lastRun"]>["report"]>;

function parseManifest(reply: string): Map<string, { status: string; reason?: string }> {
  const blocks = [...reply.matchAll(/```json\s*([\s\S]*?)```/g)];
  const out = new Map<string, { status: string; reason?: string }>();
  try {
    const list = JSON.parse(blocks.at(-1)?.[1] ?? "[]") as { source?: string; status?: string; reason?: string }[];
    for (const e of Array.isArray(list) ? list : []) {
      if (e?.source) out.set(String(e.source).replace(/\.md$/, "").replace(/^\[\[|\]\]$/g, ""), { status: String(e.status), reason: e.reason });
    }
  } catch {}
  return out;
}

/** All wiki text: a source counts as "compiled" only if it is cited there. */
async function wikiCorpus() {
  const vault = vaultDir();
  let text = "";
  for (const rel of await listMarkdown(vault, "wiki")) text += await readFile(join(vault, rel), "utf8");
  return text;
}

/**
 * Splits raw material into chunks without losing anything: a chunk ends on an
 * entry boundary ("\n## " or "\n- "), and the offset only advances that far.
 */
async function nextSlice(rel: string, from: number, size: number, budget: number) {
  const buf = Buffer.from(await readFile(join(vaultDir(), rel)));
  let end = Math.min(size, from + Math.max(budget, 2000));
  if (end < size) {
    const window = buf.subarray(from, end).toString("utf8");
    const cut = Math.max(window.lastIndexOf("\n## "), window.lastIndexOf("\n- "));
    if (cut > 0) end = from + Buffer.byteLength(window.slice(0, cut));
  }
  return { text: buf.subarray(from, end).toString("utf8"), end };
}

/**
 * Compiles unprocessed raw material, then VERIFIES coverage: a source is only
 * marked processed if it is cited in the wiki or skipped with a reason.
 * Otherwise it stays pending and will be retried; after MAX_ATTEMPTS
 * failures it moves to `problems`, shown in the admin.
 */
export async function compileWiki() {
  if (running) return { skipped: tr(messages).alreadyRunning };
  if (!env.HERMES_API_URL) return { skipped: tr(messages).hermesNotConnected };
  running = true;
  const state = await loadState();
  state.attempts ??= {};
  state.problems ??= [];
  const before = await pageMtimes();
  const report: Report = [];
  let result: RunResult | undefined = { code: "nothingNew" };
  let message = runMessage(result);
  let ok = true;
  try {
    const todo = await pending(state);
    while (todo.length) {
      let chunk = "";
      const batch: { rel: string; id: string; end: number }[] = [];
      while (todo.length && chunk.length < CURATOR_CHUNK) {
        const t = todo.shift()!;
        const slice = await nextSlice(t.rel, t.from, t.size, CURATOR_CHUNK - chunk.length);
        const id = t.rel.replace(/\.md$/, "");
        chunk += `\n\n===== ${id} =====\n${slice.text}`;
        batch.push({ rel: t.rel, id, end: slice.end });
        if (slice.end < t.size) todo.unshift({ ...t, from: slice.end });
        if (slice.end < t.size) break;
      }

      let reply = "";
      for await (const ev of chat({
        profile: "default",
        sessionId: `agora-curator-${Date.now()}`,
        // The default profile is also the "Admin Serveur" agent: the curator role is passed as a system message.
        system: "Dans cette session, tu n'es pas l'assistant d'un membre : tu es uniquement le curateur de la mémoire de l'organisation. Ignore ta personnalité habituelle et suis la procédure du message.",
        text: curatorPrompt(chunk, batch.map((b) => b.id), new Date().toISOString().slice(0, 10)),
        signal: AbortSignal.timeout(20 * 60_000),
      })) {
        if (ev.type === "delta") reply += ev.text;
      }

      const manifest = parseManifest(reply);
      const corpus = await wikiCorpus();
      let blocked = false;
      for (const b of batch) {
        const entry = manifest.get(b.id);
        const cited = corpus.includes(b.id);
        const covered = cited || (entry?.status === "skipped" && !!entry.reason?.trim());
        if (covered) {
          state.offsets[b.rel] = b.end;
          delete state.attempts[b.rel];
          state.problems = state.problems.filter((p) => p.source !== b.id);
          report.push(cited ? { source: b.id, status: "compiled" } : { source: b.id, status: "skipped", reason: entry!.reason });
          continue;
        }
        const attempts = (state.attempts[b.rel] ?? 0) + 1;
        state.attempts[b.rel] = attempts;
        const reasonCode: ReasonCode = entry?.status === "compiled" ? "claimedNotCited" : "notReported";
        const reason = tr(messages)[reasonCode];
        report.push({ source: b.id, status: "missing", reason, reasonCode });
        if (attempts >= MAX_ATTEMPTS) {
          // Stop retrying (otherwise the queue stalls), but flag it.
          state.offsets[b.rel] = b.end;
          delete state.attempts[b.rel];
          state.problems = [...state.problems.filter((p) => p.source !== b.id), { source: b.id, at: new Date().toISOString(), reason, reasonCode }];
        } else {
          blocked = true;
        }
      }
      await writeFile(statePath(), JSON.stringify(state, null, 2));
      // An uncovered source is retried on the next run, not in a loop right now.
      if (blocked) break;
    }
    const counts = { compiled: 0, skipped: 0, missing: 0 };
    for (const r of report) counts[r.status]++;
    if (report.length) {
      result = { code: "counts", ...counts };
      message = runMessage(result);
      ok = counts.missing === 0;
    }
  } catch (err) {
    ok = false;
    // A raw error is shown as is (no code); otherwise the generic message.
    result = err instanceof Error ? undefined : { code: "failed" };
    message = err instanceof Error ? err.message : tr(messages).failed;
    console.error("memory: curator", err);
  } finally {
    const after = await pageMtimes();
    const pagesTouched = [...after].filter(([k, v]) => before.get(k) !== v).length;
    state.lastRun = { at: new Date().toISOString(), ok, message, ...(result && { result }), sources: report.length, pagesTouched, report };
    await writeFile(statePath(), JSON.stringify(state, null, 2)).catch(() => {});
    running = false;
  }
  return state.lastRun;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Every 10 min: compile when conversations are idle, or when raw material piles up. */
function startCurator() {
  if (timer || !env.HERMES_API_URL) return;
  timer = setInterval(async () => {
    try {
      const todo = await pending(await loadState());
      if (!todo.length) return;
      const chars = todo.reduce((n, t) => n + t.size - t.from, 0);
      const idle = Date.now() - Math.max(...todo.map((t) => t.mtime)) > IDLE_BEFORE_COMPILE;
      if (idle || chars > COMPILE_ANYWAY_AT) await compileWiki();
    } catch (err) {
      console.error("memory: scheduling", err);
    }
  }, 10 * 60_000);
}
