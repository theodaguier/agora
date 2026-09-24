/**
 * skills.sh installs, without the GitHub API. skills.sh only indexes GitHub repos: Hermes
 * fetches a skill through the GitHub API, unauthenticated (60 requests/hour, several per
 * install, repeated for every bot), which is slow and fails once the quota is gone.
 * skills.sh's own API serves the files, but only to apps hosted on Vercel (OIDC token).
 *
 * So the app downloads the repo archive (codeload, not counted against the API quota),
 * once for every bot, finds the skill's folder like `npx skills add` does, and hands its
 * files to Hermes's own pipeline (quarantine, security scan, install policy, lock.json)
 * through hermes-skill-install.py. The skill stays a hub skill: listed, audited and
 * uninstalled by Hermes like any other.
 */

import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import { parse } from "yaml";
import { env } from "./env";
import { hermesEnv } from "./harden";
import { profileHome } from "./hermes";
import { HermesError } from "./hermes-admin";
import { defineMessages, tr } from "./i18n";

const messages = defineMessages({
  en: {
    download: (repo: string) => `Couldn't download ${repo} from GitHub.`,
    tooLarge: (repo: string) => `The ${repo} repository is too large to install from.`,
    notFound: (skill: string, repo: string) => `No “${skill}” skill found in ${repo}.`,
    skillTooLarge: (skill: string) => `The “${skill}” skill has too many or too large files.`,
    blocked: (verdict: string, reason: string) => `Hermes's security check blocked this skill (${verdict}): ${reason}`,
    failed: "Hermes couldn't install the skill.",
  },
  fr: {
    download: (repo: string) => `Impossible de télécharger ${repo} depuis GitHub.`,
    tooLarge: (repo: string) => `Le dépôt ${repo} est trop volumineux pour en installer un skill.`,
    notFound: (skill: string, repo: string) => `Aucun skill « ${skill} » trouvé dans ${repo}.`,
    skillTooLarge: (skill: string) => `Le skill « ${skill} » a trop de fichiers, ou des fichiers trop lourds.`,
    blocked: (verdict: string, reason: string) => `Le contrôle de sécurité de Hermes a bloqué ce skill (${verdict}) : ${reason}`,
    failed: "Hermes n'a pas pu installer le skill.",
  },
});

const ID = /^skills-sh\/([\w.-]+)\/([\w.-]+)\/([\w.:@-]+)$/;
const MAX_ARCHIVE = 100 * 1024 * 1024;
const MAX_FILES = 300;
const MAX_SKILL_BYTES = 10 * 1024 * 1024;
/** One download serves every bot ticked in the same install, and a retry right after. */
const TTL = 5 * 60_000;

type Bundle = { name: string; identifier: string; metadata: Record<string, string>; files: Record<string, string> };

export const isSkillsSh = (identifier: string) => ID.test(identifier);

const cache = new Map<string, { at: number; bundle: Promise<Bundle> }>();

function download(identifier: string) {
  const hit = cache.get(identifier);
  if (hit && Date.now() - hit.at < TTL) return hit.bundle;
  const bundle = fetchBundle(identifier);
  cache.set(identifier, { at: Date.now(), bundle });
  bundle.catch(() => cache.delete(identifier));
  return bundle;
}

async function fetchBundle(identifier: string): Promise<Bundle> {
  const [, owner, repo, skill] = identifier.match(ID)!;
  const full = `${owner}/${repo}`;
  const res = await fetch(`https://codeload.github.com/${full}/tar.gz/HEAD`, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!res?.ok) throw new HermesError(tr(messages).download(full));
  if (Number(res.headers.get("content-length")) > MAX_ARCHIVE) throw new HermesError(tr(messages).tooLarge(full), 400);
  const archive = await res.arrayBuffer();
  if (archive.byteLength > MAX_ARCHIVE) throw new HermesError(tr(messages).tooLarge(full), 400);

  const tmp = await mkdtemp(join(tmpdir(), "skills-sh-"));
  try {
    await Bun.write(join(tmp, "repo.tar.gz"), archive);
    const out = join(tmp, "repo");
    await mkdir(out);
    const tar = Bun.spawn(["tar", "-xzf", join(tmp, "repo.tar.gz"), "-C", out, "--no-same-owner", "--no-same-permissions"], { stderr: "pipe" });
    if ((await tar.exited) !== 0) throw new HermesError(tr(messages).download(full));
    // The archive holds a single "<repo>-HEAD" folder; git records the commit in its first (pax) header.
    const top = (await readdir(out, { withFileTypes: true })).find((d) => d.isDirectory());
    if (!top) throw new HermesError(tr(messages).notFound(skill!, full), 404);
    const root = join(out, top.name);
    const head = new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(archive)).subarray(0, 1024));
    const revision = head.match(/comment=([0-9a-f]{40})\n/)?.[1];

    const dir = await findSkillDir(root, skill!);
    if (!dir) throw new HermesError(tr(messages).notFound(skill!, full), 404);
    const files = await readSkillFiles(dir, skill!);
    const path = relative(root, dir).split(sep).join("/");
    return {
      name: basename(dir),
      identifier,
      files,
      metadata: {
        source_url: `https://github.com/${full}/tree/${revision ?? "HEAD"}/${path}`,
        ...(revision && { source_revision: revision }),
        detail_url: `https://skills.sh/${full}/${skill}`,
        repo_url: `https://github.com/${full}`,
      },
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * The folder whose SKILL.md is the skill: named after it, or declaring it as its `name`
 * (skills.sh ids are the slug of that name). The shallowest match wins.
 */
async function findSkillDir(root: string, skill: string) {
  const want = slug(skill);
  const byFolder: string[] = [];
  const byName: string[] = [];
  for await (const rel of new Bun.Glob("**/SKILL.md").scan({ cwd: root, onlyFiles: true, dot: true, followSymlinks: false })) {
    if (/(^|\/)(node_modules|\.git)\//.test(rel)) continue;
    const dir = join(root, dirname(rel));
    if (slug(basename(dir)) === want) byFolder.push(dir);
    else if (slug(frontmatterName(await readFile(join(root, rel), "utf8").catch(() => ""))) === want) byName.push(dir);
  }
  const depth = (p: string) => p.split(sep).length;
  return [...byFolder].sort((a, b) => depth(a) - depth(b))[0] ?? [...byName].sort((a, b) => depth(a) - depth(b))[0];
}

function frontmatterName(md: string) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  try {
    const name = m ? (parse(m[1]!) as { name?: unknown } | null)?.name : undefined;
    return typeof name === "string" ? name : "";
  } catch {
    return "";
  }
}

/** Regular files only: symlinks and anything else in the archive are left out. Contents in base64. */
async function readSkillFiles(dir: string, skill: string) {
  const files: Record<string, string> = {};
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const abs = join(entry.parentPath, entry.name);
    const rel = relative(dir, abs).split(sep).join("/");
    if (/(^|\/)\.git\//.test(rel)) continue;
    total += (await stat(abs)).size;
    if (Object.keys(files).length >= MAX_FILES || total > MAX_SKILL_BYTES) throw new HermesError(tr(messages).skillTooLarge(skill), 400);
    files[rel] = (await readFile(abs)).toString("base64");
  }
  return files;
}

/**
 * Hermes's interpreter (the one with its modules): the `hermes` launcher's shebang in the
 * image (a venv entry point), or the python a wrapper script execs (a local install).
 */
async function hermesPython() {
  const bin = Bun.which(env.HERMES_BIN) ?? env.HERMES_BIN;
  const launcher = await readFile(bin, "utf8").catch(() => "");
  const shebang = launcher.match(/^#!\s*(\S*python[\d.]*)\s*$/m)?.[1];
  const wrapped = launcher.match(/["']?(\/[^"'\s]+\/bin\/python[\d.]*)["']?/)?.[1];
  return shebang ?? wrapped ?? join(dirname(bin), "python3");
}

/**
 * Installs a skills.sh skill in a bot's profile. Already installed counts as done.
 * `verdict`: the security scan's, in capitals as Hermes prints it (SAFE, CAUTION…).
 */
export async function installSkillsSh(identifier: string, profile: string): Promise<{ skill: string; verdict: string | null }> {
  const bundle = await download(identifier);
  const proc = Bun.spawn([await hermesPython(), join(import.meta.dir, "hermes-skill-install.py")], {
    env: hermesEnv({ HERMES_HOME: profileHome(profile) }),
    stdin: new TextEncoder().encode(JSON.stringify(bundle)),
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => proc.kill(), 120_000);
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(timer);
  const last = stdout.trim().split("\n").at(-1) ?? "";
  let out: { status?: string; verdict?: string | null; reason?: string } = {};
  try {
    out = JSON.parse(last);
  } catch {}
  if (code !== 0 || !out.status) {
    console.error("skills.sh install", identifier, profile, stderr.trim().split("\n").slice(-5).join("\n"));
    throw new HermesError(tr(messages).failed);
  }
  const verdict = out.verdict ? out.verdict.toUpperCase() : null;
  if (out.status === "blocked") throw new HermesError(tr(messages).blocked(verdict ?? "?", out.reason ?? ""), 400);
  return { skill: bundle.name, verdict };
}
